import { css, cx } from '../../../styled-system/css'

const spinnerStyle = css({
  width: '5',
  height: '5',
  borderRadius: 'full',
  borderWidth: '2px',
  borderStyle: 'solid',
  borderColor: 'gray.6',
  borderTopColor: 'gray.11',
  animation: 'spin',
})

export default function Spinner({ label = 'Loading', className }: { label?: string; className?: string }): JSX.Element {
  return <span role="status" aria-label={label} className={cx(spinnerStyle, className)} />
}
