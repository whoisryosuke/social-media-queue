import type { Post, TargetStatus } from '@social-scheduler/shared'
import { useStore } from '@nanostores/react'
import { css } from '../../../styled-system/css'
import { baseUrl } from '../../lib/api'
import { openComposer } from '../../stores/composer'
import { deletePost, duplicatePost, publishPostNow, retryPost, unschedulePost } from '../../stores/posts'
import Avatar from '../ui/Avatar'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Card from '../ui/Card'
import { $accounts } from '../../stores/accounts'

const snippetStyle = css({ fontSize: '3', color: 'gray.12', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' })
const metaStyle = css({ display: 'flex', alignItems: 'center', gap: '2', flexWrap: 'wrap' })
const timeStyle = css({ fontSize: '2', color: 'gray.10' })
const thumbsStyle = css({ display: 'flex', gap: '1' })
const thumbStyle = css({ width: '12', height: '12', objectFit: 'cover', borderRadius: '2' })
const actionsStyle = css({ display: 'flex', gap: '1', flexWrap: 'wrap', marginTop: '2' })
const errorStyle = css({ fontSize: '2', color: 'red.11' })

const statusDot: Record<TargetStatus, { symbol: string; label: string; color: 'green' | 'red' | 'blue' | 'gray' }> = {
  published: { symbol: '✓', label: 'published', color: 'green' },
  failed: { symbol: '✗', label: 'failed', color: 'red' },
  publishing: { symbol: '▶', label: 'publishing', color: 'blue' },
  pending: { symbol: '…', label: 'pending', color: 'gray' },
  cancelled: { symbol: '⊘', label: 'cancelled', color: 'gray' },
}

function fullUrl(url: string): string {
  return url.startsWith('/') ? `${baseUrl()}${url}` : url
}

function toLocalInputValue(iso: string | Date | null): string {
  if (iso === null) return ''
  const date = iso instanceof Date ? iso : new Date(iso)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export function editPost(post: Post): void {
  const overrides: Record<string, string> = {}
  for (const target of post.targets) {
    if (target.bodyOverride !== null && target.bodyOverride !== '') {
      overrides[target.accountId] = target.bodyOverride
    }
  }
  openComposer({
    editingPostId: post.id,
    editingPostStatus: post.status,
    body: post.body,
    accountIds: post.targets.map((target) => target.accountId),
    overrides,
    media: post.media.map((item) => ({
      mediaId: item.mediaId,
      url: item.url,
      mime: item.mime,
      altText: item.altText ?? '',
      progress: null,
    })),
    scheduledAt: post.scheduledAt === null ? null : toLocalInputValue(post.scheduledAt),
  })
}

export default function PostCard({ post, mode }: { post: Post; mode: 'queue' | 'drafts' }): JSX.Element {
  const accounts = useStore($accounts)
  const accountsById = new Map(accounts.map((account) => [account.id, account]))
  const failedTargets = post.targets.filter((target) => target.status === 'failed')
  const showRetry = (post.status === 'failed' || post.status === 'partial') && failedTargets.length > 0

  return (
    <Card>
      <p className={snippetStyle}>{post.body === '' ? <em>(no text)</em> : post.body}</p>
      {post.media.length > 0 && (
        <div className={thumbsStyle}>
          {post.media.map((item) =>
            item.mime.startsWith('video/') ? (
              <span key={item.mediaId} className={thumbStyle} role="img" aria-label="Video attached">
                ▶
              </span>
            ) : (
              <img key={item.mediaId} src={fullUrl(item.url)} alt={item.altText ?? ''} className={thumbStyle} />
            ),
          )}
        </div>
      )}
      <div className={metaStyle}>
        {post.targets.map((target) => {
          const account = accountsById.get(target.accountId)
          const dot = statusDot[target.status]
          return (
            <span key={target.id} title={`${account?.handle ?? target.accountId}: ${dot.label}`}>
              {account === undefined ? (
                <Badge colorPalette={dot.color}>{dot.symbol}</Badge>
              ) : (
                <>
                  <Avatar src={account.avatarUrl ?? undefined} name={account.displayName} size="sm" />
                  <Badge colorPalette={dot.color}>
                    {dot.symbol} {dot.label}
                  </Badge>
                </>
              )}
            </span>
          )
        })}
        <span className={timeStyle}>
          {mode === 'queue'
            ? post.scheduledAt === null
              ? 'Unscheduled'
              : new Date(post.scheduledAt).toLocaleString()
            : `Edited ${new Date(post.updatedAt).toLocaleString()}`}
        </span>
      </div>
      {failedTargets.map((target) => (
        <p key={target.id} className={errorStyle}>
          {accountsById.get(target.accountId)?.handle ?? 'A target'} failed: {target.lastError ?? 'unknown error'}
        </p>
      ))}
      <div className={actionsStyle}>
        <Button variant="outline" size="small" onClick={() => editPost(post)}>
          Edit
        </Button>
        <Button variant="ghost" size="small" onClick={() => void duplicatePost(post.id)}>
          Duplicate
        </Button>
        <Button variant="ghost" size="small" onClick={() => void deletePost(post.id)}>
          Delete
        </Button>
        {showRetry && (
          <Button variant="default" size="small" colorPalette="amber" onClick={() => void retryPost(post.id)}>
            Retry
          </Button>
        )}
        {mode === 'queue' ? (
          <>
            <Button variant="default" size="small" colorPalette="green" onClick={() => void publishPostNow(post.id)}>
              Post now
            </Button>
            <Button variant="ghost" size="small" onClick={() => void unschedulePost(post.id)}>
              Move to drafts
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="small" onClick={() => editPost(post)}>
            Open
          </Button>
        )}
      </div>
    </Card>
  )
}
