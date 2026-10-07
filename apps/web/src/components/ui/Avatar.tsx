import { Avatar as ArkAvatar } from '@ark-ui/react'
import { css } from '../../../styled-system/css'

const sizes = {
  sm: css({ width: '8', height: '8', fontSize: '2' }),
  md: css({ width: '10', height: '10', fontSize: '3' }),
  lg: css({ width: '12', height: '12', fontSize: '4' }),
} as const

type AvatarSize = keyof typeof sizes

const rootStyle = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  borderRadius: 'full',
  overflow: 'hidden',
  background: 'gray.4',
  color: 'gray.11',
  fontWeight: 'medium',
})

const imageStyle = css({ width: 'full', height: 'full', objectFit: 'cover' })

export default function Avatar({
  src,
  name,
  size = 'md',
}: {
  src?: string
  name: string
  size?: AvatarSize
}): JSX.Element {
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  return (
    <ArkAvatar.Root className={`${rootStyle} ${sizes[size]}`}>
      <ArkAvatar.Fallback>{initial}</ArkAvatar.Fallback>
      {src === undefined ? null : <ArkAvatar.Image src={src} alt={name} className={imageStyle} />}
    </ArkAvatar.Root>
  )
}
