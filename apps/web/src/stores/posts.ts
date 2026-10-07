import type { Post } from '@social-scheduler/shared'
import { atom, computed } from 'nanostores'
import { apiFetch } from '../lib/api'
import { pushToast } from './toasts'

export const $posts = atom<Post[]>([])
export const $postsLoaded = atom(false)

function byScheduledAsc(a: Post, b: Post): number {
  if (a.scheduledAt === null && b.scheduledAt === null) return 0
  if (a.scheduledAt === null) return 1
  if (b.scheduledAt === null) return -1
  return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
}

export const $queuePosts = computed($posts, (posts) =>
  posts.filter((post) => post.status === 'scheduled').sort(byScheduledAsc),
)

export const $draftPosts = computed($posts, (posts) =>
  posts
    .filter((post) => post.status === 'draft')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
)

async function refreshPosts(): Promise<void> {
  try {
    $posts.set(await apiFetch<Post[]>('/api/posts'))
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    $postsLoaded.set(true)
  }
}

export async function loadPosts(): Promise<void> {
  await refreshPosts()
}

export async function duplicatePost(id: string): Promise<void> {
  try {
    const source = await apiFetch<Post>(`/api/posts/${id}`)
    const bodyOverrides: Record<string, string> = {}
    for (const target of source.targets) {
      if (target.bodyOverride !== null && target.bodyOverride !== '') {
        bodyOverrides[target.accountId] = target.bodyOverride
      }
    }
    await apiFetch('/api/posts', {
      method: 'POST',
      body: JSON.stringify({
        body: source.body,
        accountIds: source.targets.map((target) => target.accountId),
        ...(Object.keys(bodyOverrides).length > 0 ? { bodyOverrides } : {}),
        media: source.media.map((item) => ({
          mediaId: item.mediaId,
          ...(item.altText === null || item.altText === '' ? {} : { altText: item.altText }),
        })),
      }),
    })
    pushToast('Post duplicated as draft', 'success')
    await refreshPosts()
  } catch (error) {
    pushToast((error as Error).message, 'error')
  }
}

export async function deletePost(id: string): Promise<void> {
  try {
    await apiFetch(`/api/posts/${id}`, { method: 'DELETE' })
    pushToast('Post deleted', 'success')
    await refreshPosts()
  } catch (error) {
    pushToast((error as Error).message, 'error')
  }
}

export async function retryPost(id: string): Promise<void> {
  try {
    await apiFetch(`/api/posts/${id}/retry`, { method: 'POST' })
    pushToast('Retrying failed targets', 'success')
    await refreshPosts()
  } catch (error) {
    pushToast((error as Error).message, 'error')
  }
}

export async function publishPostNow(id: string): Promise<void> {
  try {
    await apiFetch(`/api/posts/${id}/publish-now`, { method: 'POST' })
    pushToast('Queued for immediate publishing', 'success')
    await refreshPosts()
  } catch (error) {
    pushToast((error as Error).message, 'error')
  }
}

export async function unschedulePost(id: string): Promise<void> {
  try {
    await apiFetch(`/api/posts/${id}/unschedule`, { method: 'POST' })
    pushToast('Moved to drafts', 'success')
    await refreshPosts()
  } catch (error) {
    pushToast((error as Error).message, 'error')
  }
}

export async function refreshPostsAction(): Promise<void> {
  await refreshPosts()
}
