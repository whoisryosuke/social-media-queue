import { Hono, type Context } from 'hono'
import {
  mastodonConnectStartResponseSchema,
  mastodonConnectStartSchema,
  platformLimitsSchema,
  type Account,
} from '@social-scheduler/shared'
import { and, eq } from 'drizzle-orm'
import { decrypt, encrypt } from '../crypto.js'
import type { Database } from '../db/client.js'
import { accounts, mastodonApps } from '../db/schema.js'
import { MastodonAdapter } from '../platforms/mastodon/adapter.js'
import {
  authorizeUrl,
  exchangeCode,
  normalizeInstanceUrl,
  registerApp,
  PlatformError,
} from '../platforms/mastodon/client.js'
import type { ResolvedAccount } from '../platforms/types.js'

export interface AccountsConfig {
  encryptionKey: string
  apiOrigin: string
  webOrigin: string
}

function error(c: Context, message: string, status = 400): Response {
  return c.json({ error: message }, status as 400)
}

function toAccountDto(row: typeof accounts.$inferSelect): Account {
  const limits = row.limitsJson === null ? null : platformLimitsSchema.safeParse(row.limitsJson)
  return {
    id: row.id,
    platform: row.platform,
    displayName: row.displayName,
    handle: row.handle,
    avatarUrl: row.avatarUrl,
    instanceUrl: row.instanceUrl,
    did: row.did,
    status: row.status,
    limits: limits !== null && limits.success ? limits.data : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function resolveAccount(row: typeof accounts.$inferSelect, encryptionKey: string): ResolvedAccount {
  const credentials = JSON.parse(decrypt(row.credentialsEncrypted, encryptionKey)) as Record<
    string,
    string
  >
  return { id: row.id, platform: row.platform, instanceUrl: row.instanceUrl, credentials }
}

async function getOrRegisterApp(
  db: Database,
  instanceUrl: string,
  config: AccountsConfig,
): Promise<{ clientId: string; clientSecret: string }> {
  const [cached] = await db.select().from(mastodonApps).where(eq(mastodonApps.instanceUrl, instanceUrl))
  if (cached !== undefined) {
    return { clientId: cached.clientId, clientSecret: decrypt(cached.clientSecretEncrypted, config.encryptionKey) }
  }
  const app = await registerApp(instanceUrl, config.apiOrigin)
  await db
    .insert(mastodonApps)
    .values({
      instanceUrl,
      clientId: app.clientId,
      clientSecretEncrypted: encrypt(app.clientSecret, config.encryptionKey),
    })
    .onConflictDoNothing()
  return app
}

export function accountsRoutes(db: Database, config: AccountsConfig): Hono {
  const routes = new Hono()
  const adapter = new MastodonAdapter()

  routes.get('/', async (c) => {
    const rows = await db.select().from(accounts)
    return c.json(rows.map(toAccountDto))
  })

  routes.post('/mastodon/start', async (c) => {
    const parsed = mastodonConnectStartSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return error(c, parsed.error.message)
    let instanceUrl: string
    try {
      instanceUrl = normalizeInstanceUrl(parsed.data.instanceUrl)
    } catch (err) {
      return error(c, (err as Error).message)
    }
    try {
      const app = await getOrRegisterApp(db, instanceUrl, config)
      const response = {
        authorizeUrl: authorizeUrl(instanceUrl, app.clientId, config.apiOrigin, instanceUrl),
      }
      const checked = mastodonConnectStartResponseSchema.parse(response)
      return c.json(checked)
    } catch (err) {
      if (err instanceof PlatformError && err.kind === 'retryable') {
        return error(c, `Instance did not respond, try again: ${err.message}`, 502)
      }
      return error(c, (err as Error).message)
    }
  })

  routes.delete('/:id', async (c) => {
    const [row] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, c.req.param('id')))
    if (row === undefined) return error(c, 'Account not found', 404)
    await db.delete(accounts).where(eq(accounts.id, c.req.param('id')))
    return c.json({ ok: true })
  })

  routes.post('/:id/refresh', async (c) => {
    const [row] = await db.select().from(accounts).where(eq(accounts.id, c.req.param('id')))
    if (row === undefined) return error(c, 'Account not found', 404)
    if (row.platform !== 'mastodon') return error(c, 'Only Mastodon accounts support refresh', 400)
    try {
      const resolved = resolveAccount(row, config.encryptionKey)
      const profile = await adapter.verifyCredentials(resolved)
      const limits = await adapter.getLimits(resolved)
      const [updated] = await db
        .update(accounts)
        .set({
          displayName: profile.displayName,
          handle: profile.handle,
          avatarUrl: profile.avatarUrl,
          limitsJson: limits,
          status: 'active',
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, row.id))
        .returning()
      return c.json(toAccountDto(updated))
    } catch (err) {
      if (err instanceof PlatformError && err.kind === 'auth') {
        const [updated] = await db
          .update(accounts)
          .set({ status: 'needs_reauth', updatedAt: new Date() })
          .where(eq(accounts.id, row.id))
          .returning()
        return c.json(toAccountDto(updated))
      }
      return error(c, (err as Error).message, 502)
    }
  })

  return routes
}

/** OAuth callback (mounted at `/oauth`, not `/api`). Redirects to the web app. */
export function oauthRoutes(db: Database, config: AccountsConfig): Hono {
  const routes = new Hono()
  const adapter = new MastodonAdapter()

  routes.get('/mastodon/callback', async (c) => {
    const code = c.req.query('code')
    const state = c.req.query('state')
    const fail = (message: string): Response =>
      c.redirect(`${config.webOrigin}/accounts?error=${encodeURIComponent(message)}`)
    if (typeof code !== 'string' || typeof state !== 'string') return fail('Missing code or state')
    let instanceUrl: string
    try {
      instanceUrl = normalizeInstanceUrl(state)
    } catch {
      return fail('Invalid instance in state')
    }
    try {
      const app = await getOrRegisterApp(db, instanceUrl, config)
      const accessToken = await exchangeCode(instanceUrl, app, code, config.apiOrigin)
      const resolved: ResolvedAccount = {
        id: '',
        platform: 'mastodon',
        instanceUrl,
        credentials: { accessToken },
      }
      const profile = await adapter.verifyCredentials(resolved)
      const limits = await adapter.getLimits(resolved)
      const credentialsEncrypted = encrypt(JSON.stringify({ accessToken }), config.encryptionKey)
      const [existing] = await db
        .select()
        .from(accounts)
        .where(
          and(
            eq(accounts.platform, 'mastodon'),
            eq(accounts.instanceUrl, instanceUrl),
            eq(accounts.handle, profile.handle),
          ),
        )
      if (existing === undefined) {
        await db.insert(accounts).values({
          platform: 'mastodon',
          displayName: profile.displayName,
          handle: profile.handle,
          avatarUrl: profile.avatarUrl,
          instanceUrl,
          credentialsEncrypted,
          limitsJson: limits,
          status: 'active',
        })
      } else {
        await db
          .update(accounts)
          .set({
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
            credentialsEncrypted,
            limitsJson: limits,
            status: 'active',
            updatedAt: new Date(),
          })
          .where(eq(accounts.id, existing.id))
      }
      return c.redirect(`${config.webOrigin}/accounts?connected=mastodon`)
    } catch (err) {
      return fail(err instanceof PlatformError ? err.message : 'Connection failed')
    }
  })

  return routes
}
