import { useStore } from '@nanostores/react'
import { css, cx } from '../../../styled-system/css'
import { $accounts } from '../../stores/accounts'
import { $composer, toggleComposerAccount } from '../../stores/composer'
import Avatar from '../ui/Avatar'
import Badge from '../ui/Badge'

const groupStyle = css({ display: 'flex', flexDirection: 'column', gap: '2' })
const headingStyle = css({ fontSize: '2', fontWeight: 'medium', color: 'gray.10', textTransform: 'uppercase' })
const chipsStyle = css({ display: 'flex', flexWrap: 'wrap', gap: '2' })
const chipBase = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '2',
  px: '2',
  py: '1',
  fontSize: '2',
  borderRadius: 'full',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'gray.6',
  background: 'gray.1',
  color: 'gray.11',
  cursor: 'pointer',
  _disabled: { opacity: 0.5, cursor: 'not-allowed' },
})
const chipOn = css({ borderColor: 'gray.12', background: 'gray.3', color: 'gray.12' })

export default function AccountPicker(): JSX.Element {
  const accounts = useStore($accounts)
  const composer = useStore($composer)
  if (accounts.length === 0) {
    return <p>No connected accounts. Connect one on the Accounts page first.</p>
  }
  const platforms = ['mastodon', 'bluesky'] as const
  return (
    <div className={groupStyle}>
      {platforms.map((platform) => {
        const group = accounts.filter((account) => account.platform === platform)
        if (group.length === 0) return null
        return (
          <div key={platform} className={groupStyle}>
            <p className={headingStyle}>{platform}</p>
            <div className={chipsStyle}>
              {group.map((account) => {
                const selected = composer.accountIds.includes(account.id)
                const disabled = account.status === 'needs_reauth'
                return (
                  <span key={account.id} className={css({ display: 'inline-flex', alignItems: 'center', gap: '1' })}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      disabled={disabled}
                      title={disabled ? `${account.handle} needs re-authentication` : account.handle}
                      onClick={() => toggleComposerAccount(account.id)}
                      className={cx(chipBase, selected && chipOn)}
                    >
                      <Avatar src={account.avatarUrl ?? undefined} name={account.displayName} size="sm" />
                      {account.handle}
                    </button>
                    {disabled && <Badge colorPalette="red">re-auth</Badge>}
                  </span>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
