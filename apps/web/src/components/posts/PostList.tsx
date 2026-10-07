import type { Post } from '@social-scheduler/shared'
import { css } from '../../../styled-system/css'
import PostCard from './PostCard'

const listStyle = css({ display: 'flex', flexDirection: 'column', gap: '3' })
const groupHeading = css({ fontSize: '4', fontWeight: 'semibold', color: 'gray.12', marginTop: '2' })

function dayLabel(iso: string | Date): string {
  const date = iso instanceof Date ? iso : new Date(iso)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  const sameDay = (a: Date, b: Date): boolean =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (sameDay(date, today)) return 'Today'
  if (sameDay(date, tomorrow)) return 'Tomorrow'
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

export default function PostList({ posts, mode }: { posts: Post[]; mode: 'queue' | 'drafts' }): JSX.Element {
  if (mode === 'drafts') {
    return (
      <div className={listStyle}>
        {posts.map((post) => (
          <PostCard key={post.id} post={post} mode={mode} />
        ))}
      </div>
    )
  }
  // Queue: failed/partial first, then chronological day groups.
  const attention = posts.filter((post) => post.status === 'failed' || post.status === 'partial')
  const rest = posts.filter((post) => post.status !== 'failed' && post.status !== 'partial')
  const groups = new Map<string, Post[]>()
  for (const post of rest) {
    const key = post.scheduledAt === null ? 'Unscheduled' : dayLabel(post.scheduledAt)
    const group = groups.get(key) ?? []
    group.push(post)
    groups.set(key, group)
  }
  return (
    <div className={listStyle}>
      {attention.length > 0 && (
        <>
          <h2 className={groupHeading}>Needs attention</h2>
          {attention.map((post) => (
            <PostCard key={post.id} post={post} mode={mode} />
          ))}
        </>
      )}
      {[...groups.entries()].map(([label, group]) => (
        <div key={label} className={listStyle}>
          <h2 className={groupHeading}>{label}</h2>
          {group.map((post) => (
            <PostCard key={post.id} post={post} mode={mode} />
          ))}
        </div>
      ))}
    </div>
  )
}
