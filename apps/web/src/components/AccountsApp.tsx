import type { Account } from '@social-scheduler/shared'
import { useCallback, useEffect, useState } from 'react'
import { css } from '../../styled-system/css'
import { apiFetch } from '../lib/api'
import { pushToast } from '../stores/toasts'
import Avatar from './ui/Avatar'
import Badge from './ui/Badge'
import Button from './ui/Button'
import Card from './ui/Card'
import EmptyState from './ui/EmptyState'
import Input from './ui/Input'
import Spinner from './ui/Spinner'

const sectionStyle = css({ display: 'flex', flexDirection: 'column', gap: '4' })
const rowStyle = css({ display: 'flex', alignItems: 'center', gap: '3' })
const growStyle = css({ flexGrow: 1, minWidth: '0' })
const handleStyle = css({ fontSize: '2', color: 'gray.10' })
const nameStyle = css({ fontSize: '3', fontWeight: 'medium', color: 'gray.12' })
const formStyle = css({ display: 'flex', gap: '2', alignItems: 'flex-end' })
const fieldStyle = css({ flexGrow: 1 })
const h2Style = css({ fontSize: '5', fontWeight: 'semibold', color: 'gray.12' })
const bannerStyle = (tone: 'ok' | 'bad') =>
  css({
    padding: '3',
    borderRadius: '3',
    fontSize: '3',
    background: tone === 'ok' ? 'green.3' : 'red.3',
    color: tone === 'ok' ? 'green.11' : 'red.11',
  })

async function loadAccounts(setAccounts: (accounts: Account[]) => void): Promise<void> {
  setAccounts(await apiFetch<Account[]>('/api/accounts'))
}

export default function AccountsApp({
  connected,
  connectError,
}: {
  connected: string | null
  connectError: string | null
}): JSX.Element {
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [instanceUrl, setInstanceUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [bskyHandle, setBskyHandle] = useState('')
  const [bskyPassword, setBskyPassword] = useState('')
  const [bskyBusy, setBskyBusy] = useState(false)

  const refresh = useCallback(() => {
    void loadAccounts(setAccounts).catch((error: Error) => pushToast(error.message, 'error'))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (connected !== null) pushToast(`Connected ${connected} account`, 'success')
    if (connectError !== null) pushToast(`Connection failed: ${connectError}`, 'error')
  }, [connected, connectError])

  async function connectMastodon(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (instanceUrl.trim() === '') return
    setBusy(true)
    try {
      const result = await apiFetch<{ authorizeUrl: string }>('/api/accounts/mastodon/start', {
        method: 'POST',
        body: JSON.stringify({ instanceUrl: instanceUrl.trim() }),
      })
      window.location.href = result.authorizeUrl
    } catch (error) {
      pushToast((error as Error).message, 'error')
      setBusy(false)
    }
  }

  async function connectBluesky(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (bskyHandle.trim() === '' || bskyPassword === '') return
    setBskyBusy(true)
    try {
      await apiFetch('/api/accounts/bluesky', {
        method: 'POST',
        body: JSON.stringify({ handle: bskyHandle.trim(), appPassword: bskyPassword }),
      })
      setBskyHandle('')
      setBskyPassword('')
      pushToast('Bluesky account connected', 'success')
      refresh()
    } catch (error) {
      pushToast((error as Error).message, 'error')
    } finally {
      setBskyBusy(false)
    }
  }

  async function refreshAccount(id: string): Promise<void> {
    try {
      await apiFetch(`/api/accounts/${id}/refresh`, { method: 'POST' })
      pushToast('Account refreshed', 'success')
      refresh()
    } catch (error) {
      pushToast((error as Error).message, 'error')
    }
  }

  async function deleteAccount(id: string): Promise<void> {
    try {
      await apiFetch(`/api/accounts/${id}`, { method: 'DELETE' })
      pushToast('Account removed', 'success')
      refresh()
    } catch (error) {
      pushToast((error as Error).message, 'error')
    }
  }

  return (
    <div className={sectionStyle}>
      <h1>Accounts</h1>
      {connected !== null && <p className={bannerStyle('ok')}>Connected {connected} account.</p>}
      {connectError !== null && <p className={bannerStyle('bad')}>Connection failed: {connectError}</p>}

      <Card>
        <h2 className={h2Style}>Connected accounts</h2>
        {accounts === null ? (
          <Spinner label="Loading accounts" />
        ) : accounts.length === 0 ? (
          <EmptyState
            title="No accounts connected"
            description="Connect a Mastodon account below to start scheduling."
          />
        ) : (
          accounts.map((account) => (
            <div key={account.id} className={rowStyle}>
              <Avatar src={account.avatarUrl ?? undefined} name={account.displayName} />
              <div className={growStyle}>
                <p className={nameStyle}>{account.displayName}</p>
                <p className={handleStyle}>{account.handle}</p>
              </div>
              <Badge colorPalette={account.platform === 'mastodon' ? 'purple' : 'blue'}>
                {account.platform}
              </Badge>
              {account.status === 'needs_reauth' && <Badge colorPalette="red">needs re-auth</Badge>}
              <Button variant="outline" size="small" onClick={() => void refreshAccount(account.id)}>
                Refresh
              </Button>
              <Button variant="ghost" size="small" onClick={() => void deleteAccount(account.id)}>
                Remove
              </Button>
            </div>
          ))
        )}
      </Card>

      <Card>
        <h2 className={h2Style}>Connect Mastodon</h2>
        <form className={formStyle} onSubmit={(event) => void connectMastodon(event)}>
          <label className={fieldStyle}>
            Instance URL
            <Input
              placeholder="mastodon.social"
              value={instanceUrl}
              onChange={(event) => setInstanceUrl(event.target.value)}
              autoComplete="url"
            />
          </label>
          <Button type="submit" disabled={busy || instanceUrl.trim() === ''}>
            {busy ? 'Connecting…' : 'Connect'}
          </Button>
        </form>
      </Card>
      <Card>
        <h2 className={h2Style}>Connect Bluesky</h2>
        <p className={handleStyle}>
          Use an app password (not your main password). Create one in Bluesky under Settings → Privacy and
          Security →{' '}
          <a href="https://bsky.app/settings/app-passwords" target="_blank" rel="noreferrer">
            App passwords
          </a>
          .
        </p>
        <form className={formStyle} onSubmit={(event) => void connectBluesky(event)}>
          <label className={fieldStyle}>
            Handle
            <Input
              placeholder="you.bsky.social"
              value={bskyHandle}
              onChange={(event) => setBskyHandle(event.target.value)}
              autoComplete="username"
            />
          </label>
          <label className={fieldStyle}>
            App password
            <Input
              type="password"
              value={bskyPassword}
              onChange={(event) => setBskyPassword(event.target.value)}
              autoComplete="new-password"
            />
          </label>
          <Button type="submit" disabled={bskyBusy || bskyHandle.trim() === '' || bskyPassword === ''}>
            {bskyBusy ? 'Connecting…' : 'Connect'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
