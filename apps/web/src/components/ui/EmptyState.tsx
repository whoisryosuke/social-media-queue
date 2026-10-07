import type { ReactNode } from 'react'
import { css } from '../../../styled-system/css'

const wrapStyle = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '3',
  padding: '8',
  textAlign: 'center',
})

const titleStyle = css({ fontSize: '5', fontWeight: 'semibold', color: 'gray.12' })
const descriptionStyle = css({ fontSize: '3', color: 'gray.10', maxWidth: 'prose' })

export default function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}): JSX.Element {
  return (
    <div className={wrapStyle}>
      <p className={titleStyle}>{title}</p>
      {description === undefined ? null : <p className={descriptionStyle}>{description}</p>}
      {action}
    </div>
  )
}
