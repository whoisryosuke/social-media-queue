import { Dialog as ArkDialog } from '@ark-ui/react'
import type { ReactNode } from 'react'
import { css } from '../../../styled-system/css'
import panelStyle from '../../theme/styles/panel.style'
import Button from './Button'

const backdropStyle = css({
  position: 'fixed',
  inset: '0',
  background: 'black',
  opacity: '0.5',
  zIndex: 'popup',
})

const positionerCenter = css({
  position: 'fixed',
  inset: '0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '4',
  zIndex: 'popup',
})

const positionerRight = css({
  position: 'fixed',
  inset: '0',
  display: 'flex',
  justifyContent: 'flex-end',
  zIndex: 'popup',
})

const contentCenter = css({ width: 'full', maxWidth: 'md', maxHeight: '90vh', overflow: 'auto' })

const contentRight = css({ height: '100vh', width: 'full', maxWidth: 'md', borderRadius: '0' })

const headerStyle = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '3',
})

const titleStyle = css({ fontSize: '5', fontWeight: 'semibold', color: 'gray.12' })

const descriptionStyle = css({ fontSize: '3', color: 'gray.10' })

export interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  /** 'center' = modal dialog, 'right' = drawer. */
  placement?: 'center' | 'right'
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  placement = 'center',
}: DialogProps): JSX.Element {
  const right = placement === 'right'
  return (
    <ArkDialog.Root open={open} onOpenChange={(details) => onOpenChange(details.open)}>
      <ArkDialog.Backdrop className={backdropStyle} />
      <ArkDialog.Positioner className={right ? positionerRight : positionerCenter}>
        <ArkDialog.Content className={`${panelStyle} ${right ? contentRight : contentCenter}`}>
          <div className={headerStyle}>
            <div>
              <ArkDialog.Title className={titleStyle}>{title}</ArkDialog.Title>
              {description === undefined ? null : (
                <ArkDialog.Description className={descriptionStyle}>{description}</ArkDialog.Description>
              )}
            </div>
            <ArkDialog.CloseTrigger asChild>
              <Button variant="ghost">Close</Button>
            </ArkDialog.CloseTrigger>
          </div>
          {children}
        </ArkDialog.Content>
      </ArkDialog.Positioner>
    </ArkDialog.Root>
  )
}

export function Drawer(props: Omit<DialogProps, 'placement'>): JSX.Element {
  return <Dialog {...props} placement="right" />
}
