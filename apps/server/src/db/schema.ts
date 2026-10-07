import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const platformEnum = pgEnum('platform', ['mastodon', 'bluesky'])
export const accountStatusEnum = pgEnum('account_status', ['active', 'needs_reauth'])
export const postStatusEnum = pgEnum('post_status', [
  'draft',
  'scheduled',
  'publishing',
  'published',
  'partial',
  'failed',
])
export const targetStatusEnum = pgEnum('target_status', [
  'pending',
  'publishing',
  'published',
  'failed',
  'cancelled',
])
export const mediaKindEnum = pgEnum('media_kind', ['image', 'video'])

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  platform: platformEnum('platform').notNull(),
  displayName: text('display_name').notNull(),
  handle: text('handle').notNull(),
  avatarUrl: text('avatar_url'),
  instanceUrl: text('instance_url'),
  did: text('did'),
  credentialsEncrypted: text('credentials_encrypted').notNull(),
  limitsJson: jsonb('limits_json'),
  status: accountStatusEnum('status').notNull().default('active'),
  ...timestamps,
})

export const mastodonApps = pgTable('mastodon_apps', {
  instanceUrl: text('instance_url').primaryKey(),
  clientId: text('client_id').notNull(),
  clientSecretEncrypted: text('client_secret_encrypted').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})

export const posts = pgTable(
  'posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    status: postStatusEnum('status').notNull().default('draft'),
    body: text('body').notNull().default(''),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (table) => [index('posts_status_scheduled_at_idx').on(table.status, table.scheduledAt)],
)

export const postTargets = pgTable(
  'post_targets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    bodyOverride: text('body_override'),
    rkey: text('rkey'),
    status: targetStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' }),
    lockedAt: timestamp('locked_at', { withTimezone: true, mode: 'date' }),
    remoteId: text('remote_id'),
    remoteUrl: text('remote_url'),
    lastError: text('last_error'),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [index('post_targets_status_next_attempt_at_idx').on(table.status, table.nextAttemptAt)],
)

export const media = pgTable('media', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: mediaKindEnum('kind').notNull(),
  mime: text('mime').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  width: integer('width'),
  height: integer('height'),
  durationMs: integer('duration_ms'),
  storagePath: text('storage_path').notNull(),
  originalFilename: text('original_filename').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})

export const postMedia = pgTable('post_media', {
  postId: uuid('post_id')
    .notNull()
    .references(() => posts.id, { onDelete: 'cascade' }),
  mediaId: uuid('media_id')
    .notNull()
    .references(() => media.id, { onDelete: 'cascade' }),
  position: integer('position').notNull().default(0),
  altText: text('alt_text'),
})

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
})
