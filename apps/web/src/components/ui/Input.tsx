import type { InputHTMLAttributes } from 'react'
import { css, cx } from '../../../styled-system/css'

export const fieldStyle = css({
  width: 'full',
  px: '3',
  py: '2',
  fontSize: '3',
  color: 'gray.12',
  background: 'gray.1',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'gray.6',
  borderRadius: '3',
  _placeholder: { color: 'gray.8' },
  _focus: { outline: 'none', borderColor: 'gray.8' },
  _disabled: { color: 'gray.8', cursor: 'not-allowed' },
})

export type InputProps = InputHTMLAttributes<HTMLInputElement>

export default function Input({ className, ...rest }: InputProps): JSX.Element {
  return <input className={cx(fieldStyle, className)} {...rest} />
}
