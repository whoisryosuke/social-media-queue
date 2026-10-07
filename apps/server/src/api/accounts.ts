import { Hono, type Context } from 'hono'
import {
  mastodonConnectStartResponseSchema,
  mastodonConnectStartSchema,
  platformLimitsSchema,
  BLUESKY_LIMITS,
  DEFAULT_MASTODON_LIMITS,
  blueskyConnectSchema,
  type Account,
} from '@social-scheduler/shared'
import { and, eq } from 'drizzle-orm'
import { decrypt, encrypt } from '../crypto.js'
import type { Database } from '../db/client.js'
import { accounts, mastodonApps } from '../db/schema.js'
import { BlueskyAdapter } from '../platforms/bluesky/adapter.js'
import { connect as connectBluesky, normalizeHandle } from '../platforms/bluesky/client.js'
import { MastodonAdapter } from '../platforms/mastodon/adapter.js'
import {
  MockPlatformAdapter,
  isMockMode,
  mockAuthorizeUrl,
  mockBlueskyProfile,
  mockMastodonAccount,
} from '../platforms/mock.js'
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

/** Split a comma-separated origin list (see `createApp`). */
export function parseWebOrigins(webOrigin: string): string[] {
  return webOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '')
}

/** Redirect base: the origin the flow started from, else the first configured. */
function redirectBase(origins: string[], candidate: string | null): string {
  if (candidate !== null && origins.includes(candidate)) return candidate
  return origins[0] ?? 'http://localhost:4321'
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
  if (isMockMode()) return { clientId: 'mock-client', clientSecret: 'mock-secret' }
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

async function refreshBluesky(
  c: Context,
  db: Database,
  config: AccountsConfig,
  row: typeof accounts.$inferSelect,
): Promise<Response> {
  const adapter = new BlueskyAdapter()
  try {
    const profile = await adapter.verifyCredentials(resolveAccount(row, config.encryptionKey))
    const [updated] = await db
      .update(accounts)
      .set({
        displayName: profile.displayName,
        handle: profile.handle,
        avatarUrl: profile.avatarUrl,
        limitsJson: BLUESKY_LIMITS,
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
}

export function accountsRoutes(db: Database, config: AccountsConfig): Hono {
  const routes = new Hono()
  const adapter = new MastodonAdapter()
  const origins = parseWebOrigins(config.webOrigin)

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
      // Remember which web origin started the flow so the callback can
      // redirect back to it (the raw list is not a valid redirect base).
      const requestOrigin = c.req.header('Origin')
      const state =
        requestOrigin !== undefined && origins.includes(requestOrigin)
          ? `${instanceUrl}|${requestOrigin}`
          : instanceUrl
      const response = isMockMode()
        ? { authorizeUrl: mockAuthorizeUrl(config.apiOrigin, state) }
        : {
            authorizeUrl: authorizeUrl(instanceUrl, app.clientId, config.apiOrigin, state),
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

  routes.post('/bluesky', async (c) => {
    const parsed = blueskyConnectSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return error(c, parsed.error.message)
    let handle: string
    try {
      handle = normalizeHandle(parsed.data.handle)
    } catch (err) {
      return error(c, (err as Error).message)
    }
    const credentials = {
      handle,
      appPassword: parsed.data.appPassword,
      ...(parsed.data.service === undefined ? {} : { service: parsed.data.service }),
    }
    try {
      let did: string
      let displayName: string
      let remoteHandle: string
      let avatarUrl: string | null
      if (isMockMode()) {
        const profile = mockBlueskyProfile(handle)
        did = profile.did
        displayName = profile.displayName
        remoteHandle = profile.handle
        avatarUrl = null
      } else {
        const agent = await connectBluesky(credentials)
        const sessionDid = agent.session?.did
        if (sessionDid === undefined) return error(c, 'Bluesky login returned no session', 502)
        const profile = await agent.getProfile({ actor: sessionDid })
        did = sessionDid
        displayName = profile.data.displayName ?? profile.data.handle
        remoteHandle = profile.data.handle
        avatarUrl = profile.data.avatar ?? null
      }
      const credentialsEncrypted = encrypt(JSON.stringify(credentials), config.encryptionKey)
      const [existing] = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.platform, 'bluesky'), eq(accounts.did, did)))
      if (existing === undefined) {
        const [created] = await db
          .insert(accounts)
          .values({
            platform: 'bluesky',
            displayName,
            handle: `@${remoteHandle}`,
            avatarUrl,
            did,
            credentialsEncrypted,
            limitsJson: BLUESKY_LIMITS,
            status: 'active',
          })
          .returning()
        return c.json(toAccountDto(created), 201)
      }
      const [updated] = await db
        .update(accounts)
        .set({
          displayName,
          handle: `@${remoteHandle}`,
          avatarUrl,
          credentialsEncrypted,
          limitsJson: BLUESKY_LIMITS,
          status: 'active',
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, existing.id))
        .returning()
      return c.json(toAccountDto(updated))
    } catch (err) {
      if (err instanceof PlatformError && err.kind === 'auth') {
        return error(c, 'Bluesky login failed: check the handle and app password', 401)
      }
      return error(c, (err as Error).message, 502)
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
    if (isMockMode()) {
      const [updated] = await db
        .update(accounts)
        .set({ status: 'active', updatedAt: new Date() })
        .where(eq(accounts.id, row.id))
        .returning()
      return c.json(toAccountDto(updated))
    }
    if (row.platform === 'bluesky') return refreshBluesky(c, db, config, row)
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
  const origins = parseWebOrigins(config.webOrigin)

  routes.get('/mastodon/callback', async (c) => {
    const code = c.req.query('code')
    const state = c.req.query('state')
    // State is `<instanceUrl>` or `<instanceUrl>|<webOrigin>` (see start).
    const [instancePart, originPart] = (state ?? '').split('|')
    const base = redirectBase(origins, originPart ?? null)
    const fail = (message: string): Response =>
      c.redirect(`${base}/accounts?error=${encodeURIComponent(message)}`)
    if (typeof code !== 'string' || typeof instancePart !== 'string' || instancePart === '') {
      return fail('Missing code or state')
    }
    let instanceUrl: string
    try {
      instanceUrl = normalizeInstanceUrl(instancePart)
    } catch {
      return fail('Invalid instance in state')
    }
    try {
      let accessToken: string
      let profile: { remoteId: string; displayName: string; handle: string; avatarUrl: string | null }
      let limits: typeof DEFAULT_MASTODON_LIMITS
      if (isMockMode() && code === 'mock-code') {
        accessToken = 'mock-token'
        profile = {
          remoteId: mockMastodonAccount.id,
          displayName: mockMastodonAccount.display_name,
          handle: `@${mockMastodonAccount.acct}@${new URL(instanceUrl).hostname}`,
          avatarUrl: null,
        }
        limits = DEFAULT_MASTODON_LIMITS
      } else {
        const app = await getOrRegisterApp(db, instanceUrl, config)
        accessToken = await exchangeCode(instanceUrl, app, code, config.apiOrigin)
        const resolved: ResolvedAccount = {
          id: '',
          platform: 'mastodon',
          instanceUrl,
          credentials: { accessToken },
        }
        profile = await adapter.verifyCredentials(resolved)
        limits = await adapter.getLimits(resolved)
      }
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
      return c.redirect(`${base}/accounts?connected=mastodon`)
    } catch (err) {
      return fail(err instanceof PlatformError ? err.message : 'Connection failed')
    }
  })

  return routes
}
