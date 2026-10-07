import type { ButtonHTMLAttributes } from 'react'
import { css, cx } from '../../../styled-system/css'
import { button } from '../../../styled-system/recipes'
import type { ColorPalette } from '../../../styled-system/tokens'

type ButtonVariant = 'default' | 'outline' | 'ghost'
type ButtonSize = 'small' | 'medium' | 'large' | 'xl'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  colorPalette?: ColorPalette
}

const paletteStyle = (colorPalette: ColorPalette | undefined) =>
  colorPalette === undefined ? '' : css({ colorPalette })

export default function Button({
  variant = 'default',
  size = 'medium',
  colorPalette,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps): JSX.Element {
  const classes = button({ variant, size })
  return (
    <button type={type} className={cx(classes.container, paletteStyle(colorPalette), className)} {...rest}>
      {children}
    </button>
  )
}
