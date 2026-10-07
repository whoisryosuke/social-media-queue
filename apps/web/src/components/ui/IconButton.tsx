import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { css, cx } from '../../../styled-system/css'
import { button } from '../../../styled-system/recipes'
import type { ColorPalette } from '../../../styled-system/tokens'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible label (rendered as aria-label). Required. */
  label: string
  /** The icon to render. */
  children: ReactNode
  variant?: 'default' | 'outline' | 'ghost'
  colorPalette?: ColorPalette
}

const square = css({
  width: '8',
  height: '8',
  padding: '0',
  justifyContent: 'center',
})

export default function IconButton({
  label,
  children,
  variant = 'ghost',
  colorPalette,
  className,
  ...rest
}: IconButtonProps): JSX.Element {
  const classes = button({ variant, size: 'small' })
  return (
    <button
      type="button"
      aria-label={label}
      className={cx(
        classes.container,
        colorPalette === undefined ? '' : css({ colorPalette }),
        square,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
