import type { Account } from '@social-scheduler/shared'
import { atom } from 'nanostores'
import { apiFetch } from '../lib/api'
import { pushToast } from './toasts'

export const $accounts = atom<Account[]>([])
export const $accountsLoaded = atom(false)

export async function loadAccounts(): Promise<void> {
  try {
    $accounts.set(await apiFetch<Account[]>('/api/accounts'))
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    $accountsLoaded.set(true)
  }
}

export function activeAccounts(): Account[] {
  return $accounts.get().filter((account) => account.status === 'active')
}
