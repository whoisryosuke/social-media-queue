import { atom } from 'nanostores'

export type ToastTone = 'info' | 'success' | 'error'

export interface Toast {
  id: string
  title: string
  description?: string
  tone: ToastTone
}

export const $toasts = atom<Toast[]>([])

let nextId = 0

export function pushToast(title: string, tone: ToastTone = 'info', description?: string): string {
  const id = `toast-${Date.now()}-${(nextId += 1)}`
  $toasts.set([...$toasts.get(), { id, title, description, tone }])
  return id
}

export function dismissToast(id: string): void {
  $toasts.set($toasts.get().filter((toast) => toast.id !== id))
}
