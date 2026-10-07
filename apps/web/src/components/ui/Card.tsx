import type { ReactNode } from 'react'
import { css, cx } from '../../../styled-system/css'
import panelStyle from '../../theme/styles/panel.style'

const bodyStyle = css({ padding: '4' })

export default function Card({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}): JSX.Element {
  return (
    <section className={cx(panelStyle, className)}>
      <div className={bodyStyle}>{children}</div>
    </section>
  )
}
