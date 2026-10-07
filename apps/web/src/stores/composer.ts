import type { Media } from '@social-scheduler/shared'
import { atom } from 'nanostores'
import { apiFetch } from '../lib/api'
import { $accounts } from './accounts'
import { refreshPostsAction } from './posts'
import { pushToast } from './toasts'

export interface ComposerMedia {
  mediaId: string
  url: string
  mime: string
  altText: string
  progress: number | null
}

interface ComposerState {
  open: boolean
  editingPostId: string | null
  editingPostStatus: string | null
  body: string
  accountIds: string[]
  /** Per-account text override, keyed by account id. */
  overrides: Record<string, string>
  /** Which platforms show an override field. */
  overridePlatforms: string[]
  media: ComposerMedia[]
  /** Local datetime string (`YYYY-MM-DDTHH:mm`) or null for drafts. */
  scheduledAt: string | null
  busy: boolean
}

const initialState: ComposerState = {
  open: false,
  editingPostId: null,
  editingPostStatus: null,
  body: '',
  accountIds: [],
  overrides: {},
  overridePlatforms: [],
  media: [],
  scheduledAt: null,
  busy: false,
}

export const $composer = atom<ComposerState>(initialState)

export interface OpenComposerOptions {
  editingPostId?: string
  editingPostStatus?: string
  body?: string
  accountIds?: string[]
  overrides?: Record<string, string>
  media?: ComposerMedia[]
  scheduledAt?: string | null
}

export function openComposer(options: OpenComposerOptions = {}): void {
  $composer.set({
    ...initialState,
    open: true,
    editingPostId: options.editingPostId ?? null,
    editingPostStatus: options.editingPostStatus ?? null,
    body: options.body ?? '',
    accountIds: options.accountIds ?? [],
    overrides: options.overrides ?? {},
    media: options.media ?? [],
    scheduledAt: options.scheduledAt ?? null,
  })
}

export function closeComposer(): void {
  $composer.set({ ...$composer.get(), open: false })
}

function patch(state: Partial<ComposerState>): void {
  $composer.set({ ...$composer.get(), ...state })
}

export function setComposerBody(body: string): void {
  patch({ body })
}

export function toggleComposerAccount(accountId: string): void {
  const current = $composer.get()
  patch({
    accountIds: current.accountIds.includes(accountId)
      ? current.accountIds.filter((id) => id !== accountId)
      : [...current.accountIds, accountId],
  })
}

export function setComposerOverride(accountId: string, text: string): void {
  patch({ overrides: { ...$composer.get().overrides, [accountId]: text } })
}

export function toggleOverridePlatform(platform: string): void {
  const current = $composer.get().overridePlatforms
  patch({
    overridePlatforms: current.includes(platform) ? current.filter((p) => p !== platform) : [...current, platform],
  })
}

export function addComposerMedia(item: ComposerMedia): void {
  patch({ media: [...$composer.get().media, item] })
}

export function updateComposerMedia(mediaId: string, update: Partial<ComposerMedia>): void {
  patch({
    media: $composer.get().media.map((item) => (item.mediaId === mediaId ? { ...item, ...update } : item)),
  })
}

export function removeComposerMedia(mediaId: string): void {
  patch({ media: $composer.get().media.filter((item) => item.mediaId !== mediaId) })
}

export function moveComposerMedia(mediaId: string, direction: -1 | 1): void {
  const media = [...$composer.get().media]
  const index = media.findIndex((item) => item.mediaId === mediaId)
  const other = index + direction
  if (index < 0 || other < 0 || other >= media.length) return
  const [moved] = media.splice(index, 1)
  if (moved === undefined) return
  media.splice(other, 0, moved)
  patch({ media })
}

export function setComposerScheduledAt(scheduledAt: string | null): void {
  patch({ scheduledAt })
}

function payload(includeScheduledAt: boolean): Record<string, unknown> {
  const state = $composer.get()
  const accountsById = new Map($accounts.get().map((account) => [account.id, account]))
  const bodyOverrides: Record<string, string> = {}
  for (const accountId of state.accountIds) {
    const text = (state.overrides[accountId] ?? '').trim()
    if (text === '') continue
    const platform = accountsById.get(accountId)?.platform
    if (platform !== undefined && state.overridePlatforms.includes(platform)) {
      bodyOverrides[accountId] = state.overrides[accountId]
    }
  }
  return {
    body: state.body,
    accountIds: state.accountIds,
    ...(Object.keys(bodyOverrides).length > 0 ? { bodyOverrides } : {}),
    media: state.media
      .filter((item) => !item.mediaId.startsWith('uploading-') && item.progress === null)
      .map((item) => ({
        mediaId: item.mediaId,
        ...(item.altText === '' ? {} : { altText: item.altText }),
      })),
    ...(includeScheduledAt && state.scheduledAt !== null && state.scheduledAt !== ''
      ? { scheduledAt: new Date(state.scheduledAt).toISOString() }
      : {}),
  }
}

async function runSave(label: string, task: () => Promise<void>): Promise<boolean> {
  patch({ busy: true })
  try {
    await task()
    pushToast(label, 'success')
    await refreshPostsAction()
    closeComposer()
    return true
  } catch (error) {
    pushToast((error as Error).message, 'error')
    return false
  } finally {
    patch({ busy: false })
  }
}

/** New post → draft; editing → save field changes, keep current status. */
export async function saveComposer(): Promise<boolean> {
  const state = $composer.get()
  return runSave(state.editingPostId === null ? 'Draft saved' : 'Changes saved', async () => {
    if (state.editingPostId === null) {
      await apiFetch('/api/posts', { method: 'POST', body: JSON.stringify(payload(false)) })
    } else {
      await apiFetch(`/api/posts/${state.editingPostId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload(false)),
      })
    }
  })
}

/**
 * New post or draft → scheduled (creates or promotes). Editing a scheduled
 * post → reschedules via PATCH. Requires a date and ≥1 account (API enforces).
 */
export async function scheduleComposer(): Promise<boolean> {
  const state = $composer.get()
  return runSave('Post scheduled', async () => {
    if (state.editingPostId === null) {
      await apiFetch('/api/posts', { method: 'POST', body: JSON.stringify(payload(true)) })
    } else if (state.editingPostStatus === 'scheduled') {
      await apiFetch(`/api/posts/${state.editingPostId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload(true)),
      })
    } else {
      await apiFetch(`/api/posts/${state.editingPostId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload(false)),
      })
      const scheduledAt = $composer.get().scheduledAt
      if (scheduledAt === null || scheduledAt === '') throw new Error('Pick a date and time to schedule')
      await apiFetch(`/api/posts/${state.editingPostId}/schedule`, {
        method: 'POST',
        body: JSON.stringify({ scheduledAt: new Date(scheduledAt).toISOString() }),
      })
    }
  })
}

/** Editing a scheduled post → back to drafts. */
export async function unscheduleComposer(): Promise<boolean> {
  const state = $composer.get()
  if (state.editingPostId === null) return false
  return runSave('Moved to drafts', async () => {
    await apiFetch(`/api/posts/${state.editingPostId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload(false)),
    })
    await apiFetch(`/api/posts/${state.editingPostId}/unschedule`, { method: 'POST' })
  })
}

export async function publishComposerNow(): Promise<boolean> {
  const state = $composer.get()
  patch({ busy: true })
  try {
    const body = payload(false)
    const created = await apiFetch<{ id: string }>('/api/posts', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const id = state.editingPostId ?? created.id
    if (state.editingPostId !== null) {
      await apiFetch(`/api/posts/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
    }
    await apiFetch(`/api/posts/${id}/publish-now`, { method: 'POST' })
    pushToast('Queued for immediate publishing', 'success')
    await refreshPostsAction()
    closeComposer()
    return true
  } catch (error) {
    pushToast((error as Error).message, 'error')
    return false
  } finally {
    patch({ busy: false })
  }
}

export async function uploadComposerFile(file: File): Promise<void> {
  const { apiUploadMedia } = await import('../lib/api')
  const tempId = `uploading-${Date.now()}`
  addComposerMedia({ mediaId: tempId, url: '', mime: file.type, altText: '', progress: 0 })
  try {
    const created: Media = await apiUploadMedia(file, (fraction) =>
      updateComposerMedia(tempId, { progress: fraction }),
    )
    updateComposerMedia(tempId, {
      mediaId: created.id,
      url: created.url,
      mime: created.mime,
      progress: null,
    })
  } catch (error) {
    removeComposerMedia(tempId)
    pushToast((error as Error).message, 'error')
  }
}
