import type { TextareaHTMLAttributes } from 'react'
import { cx } from '../../../styled-system/css'
import { fieldStyle } from './Input'

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export default function Textarea({ className, rows = 4, ...rest }: TextareaProps): JSX.Element {
  return <textarea rows={rows} className={cx(fieldStyle, className)} {...rest} />
}
