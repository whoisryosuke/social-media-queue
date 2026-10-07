import type { SelectHTMLAttributes } from 'react'
import { cx } from '../../../styled-system/css'
import { fieldStyle } from './Input'

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>

export default function Select({ className, children, ...rest }: SelectProps): JSX.Element {
  return (
    <select className={cx(fieldStyle, className)} {...rest}>
      {children}
    </select>
  )
}
