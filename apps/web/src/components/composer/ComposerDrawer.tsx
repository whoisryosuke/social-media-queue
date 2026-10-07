import { useStore } from '@nanostores/react'
import type { Account } from '@social-scheduler/shared'
import { useEffect } from 'react'
import { css } from '../../../styled-system/css'
import { $accounts, $accountsLoaded, loadAccounts } from '../../stores/accounts'
import {
  $composer,
  closeComposer,
  publishComposerNow,
  saveComposer,
  scheduleComposer,
  setComposerBody,
  setComposerOverride,
  setComposerScheduledAt,
  toggleOverridePlatform,
  unscheduleComposer,
} from '../../stores/composer'
import { $composerBlockers, $tightestLimit } from '../../stores/preview'
import { Dialog } from '../ui/Dialog'
import Button from '../ui/Button'
import Textarea from '../ui/Textarea'
import Input from '../ui/Input'
import AccountPicker from './AccountPicker'
import MediaEditor from './MediaEditor'
import PreviewPanel from './Previews'

const wideDrawer = css({ maxWidth: '7xl' })
const columns = css({
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: '4',
  lg: { gridTemplateColumns: '1fr 1fr' },
})
const fieldStyle = css({ display: 'flex', flexDirection: 'column', gap: '2' })
const labelStyle = css({ fontSize: '2', fontWeight: 'medium', color: 'gray.10' })
const counterStyle = (over: boolean) => css({ fontSize: '2', color: over ? 'red.11' : 'gray.10' })
const footerStyle = css({
  display: 'flex',
  gap: '2',
  flexWrap: 'wrap',
  alignItems: 'center',
  paddingTop: '3',
  borderTopWidth: '1px',
  borderTopStyle: 'solid',
  borderTopColor: 'gray.6',
})
const blockersStyle = css({ fontSize: '2', color: 'red.11' })
const tzStyle = css({ fontSize: '2', color: 'gray.10' })

function toLocalInputValue(iso: string | null): string {
  if (iso === null || iso === '') return ''
  const date = new Date(iso)
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60_000)
  return local.toISOString().slice(0, 16)
}

export default function ComposerDrawer(): JSX.Element {
  const composer = useStore($composer)
  const accountsLoaded = useStore($accountsLoaded)
  const blockers = useStore($composerBlockers)
  const tightest = useStore($tightestLimit)

  useEffect(() => {
    if (composer.open && !accountsLoaded) void loadAccounts()
  }, [composer.open, accountsLoaded])

  const editingScheduled = composer.editingPostStatus === 'scheduled'
  const canSchedule = blockers.length === 0 && composer.scheduledAt !== null && composer.scheduledAt !== ''
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const accountsById = new Map($accounts.get().map((account) => [account.id, account]))
  const selectedPlatforms = [...new Set(
    composer.accountIds
      .map((id) => accountsById.get(id)?.platform)
      .filter((platform): platform is 'mastodon' | 'bluesky' => platform !== undefined),
  )]
  const accountsOf = (platform: 'mastodon' | 'bluesky'): Account[] =>
    composer.accountIds
      .map((id) => accountsById.get(id))
      .filter((account): account is Account => account !== undefined && account.platform === platform)

  return (
    <Dialog
      open={composer.open}
      onOpenChange={(open) => {
        if (!open) closeComposer()
      }}
      placement="right"
      contentClassName={wideDrawer}
      title={composer.editingPostId === null ? 'New post' : 'Edit post'}
      description="Compose once, publish to Mastodon and Bluesky."
    >
      <div className={columns}>
        <div className={fieldStyle}>
          <div>
            <p className={labelStyle}>Accounts</p>
            <AccountPicker />
          </div>
          <div>
            <p className={labelStyle}>
              Text{tightest !== null && <span className={counterStyle(false)}> · up to {tightest}</span>}
            </p>
            <Textarea
              aria-label="Post text"
              value={composer.body}
              onChange={(event) => setComposerBody(event.target.value)}
              rows={6}
            />
          </div>
          {selectedPlatforms.map((platform) => (
            <div key={platform}>
              <label>
                <input
                  type="checkbox"
                  checked={composer.overridePlatforms.includes(platform)}
                  onChange={() => toggleOverridePlatform(platform)}
                />{' '}
                Customize for {platform}
              </label>
              {composer.overridePlatforms.includes(platform) &&
                accountsOf(platform).map((account) => (
                  <Textarea
                    key={account.id}
                    aria-label={`${platform} text for ${account.handle}`}
                    placeholder={`Custom text for ${account.handle} (empty = use main text)`}
                    value={composer.overrides[account.id] ?? ''}
                    onChange={(event) => setComposerOverride(account.id, event.target.value)}
                    rows={3}
                  />
                ))}
            </div>
          ))}
          <div>
            <p className={labelStyle}>Media</p>
            <MediaEditor />
          </div>
          <div>
            <p className={labelStyle}>
              Schedule <span className={tzStyle}>({timezone})</span>
            </p>
            <Input
              type="datetime-local"
              aria-label="Scheduled date and time"
              value={toLocalInputValue(composer.scheduledAt)}
              min={toLocalInputValue(new Date().toISOString())}
              onChange={(event) => setComposerScheduledAt(event.target.value === '' ? null : event.target.value)}
            />
          </div>
          {blockers.length > 0 && (
            <ul>
              {blockers.map((blocker) => (
                <li key={blocker} className={blockersStyle}>
                  {blocker}
                </li>
              ))}
            </ul>
          )}
          <div className={footerStyle}>
            <Button variant="ghost" onClick={closeComposer}>
              Cancel
            </Button>
            <Button variant="outline" disabled={composer.busy} onClick={() => void saveComposer()}>
              {composer.editingPostId === null ? 'Save draft' : 'Save changes'}
            </Button>
            {editingScheduled && (
              <Button variant="outline" disabled={composer.busy} onClick={() => void unscheduleComposer()}>
                Move to drafts
              </Button>
            )}
            <Button
              variant="default"
              colorPalette="blue"
              disabled={composer.busy || !canSchedule}
              title={!canSchedule && composer.scheduledAt === null ? 'Pick a date and time' : undefined}
              onClick={() => void scheduleComposer()}
            >
              {editingScheduled ? 'Reschedule' : 'Schedule'}
            </Button>
            <Button
              variant="default"
              colorPalette="green"
              disabled={composer.busy || blockers.length > 0}
              onClick={() => void publishComposerNow()}
            >
              Post now
            </Button>
          </div>
        </div>
        <PreviewPanel />
      </div>
    </Dialog>
  )
}
