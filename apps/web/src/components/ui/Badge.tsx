import type { ReactNode } from 'react'
import { css, cx } from '../../../styled-system/css'
import type { ColorPalette } from '../../../styled-system/tokens'

const badgeBase = css({
  display: 'inline-flex',
  alignItems: 'center',
  px: '2',
  py: '0.5',
  fontSize: '1',
  fontWeight: 'medium',
  borderRadius: 'full',
})

// Static declarations: resolved through the runtime `colorPalette` class
// (pre-generated for every palette via `staticCss` in panda.config.ts).
const badgeColors = css({
  background: 'colorPalette.3',
  color: 'colorPalette.11',
})

export default function Badge({
  children,
  colorPalette = 'gray',
  className,
}: {
  children: ReactNode
  colorPalette?: ColorPalette
  className?: string
}): JSX.Element {
  return (
    <span className={cx(badgeBase, badgeColors, css({ colorPalette }), className)}>{children}</span>
  )
}
