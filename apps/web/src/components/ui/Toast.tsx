import { useStore } from '@nanostores/react'
import { useEffect } from 'react'
import { css, cx } from '../../../styled-system/css'
import type { ColorPalette } from '../../../styled-system/tokens'
import { $toasts, dismissToast, type ToastTone } from '../../stores/toasts'

const regionStyle = css({
  position: 'fixed',
  bottom: '4',
  right: '4',
  display: 'flex',
  flexDirection: 'column',
  gap: '2',
  zIndex: 'top',
  maxWidth: 'sm',
})

const toastBase = css({
  display: 'flex',
  gap: '3',
  alignItems: 'flex-start',
  padding: '3',
  borderRadius: '3',
  borderWidth: '1px',
  borderStyle: 'solid',
  background: 'colorPalette.3',
  borderColor: 'colorPalette.6',
  color: 'colorPalette.11',
  boxShadow: 'md',
})

const titleStyle = css({ fontSize: '3', fontWeight: 'semibold' })
const descriptionStyle = css({ fontSize: '2' })

const tonePalette: Record<ToastTone, ColorPalette> = {
  info: 'blue',
  success: 'green',
  error: 'red',
}

const DISMISS_MS = 5000

export default function ToastRegion(): JSX.Element {
  const toasts = useStore($toasts)

  useEffect(() => {
    if (toasts.length === 0) return
    const timer = setTimeout(() => dismissToast(toasts[0].id), DISMISS_MS)
    return () => clearTimeout(timer)
  }, [toasts])

  return (
    <div aria-live="polite" className={regionStyle}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={cx(toastBase, css({ colorPalette: tonePalette[toast.tone] }))}
        >
          <div>
            <p className={titleStyle}>{toast.title}</p>
            {toast.description === undefined ? null : (
              <p className={descriptionStyle}>{toast.description}</p>
            )}
          </div>
          <button
            type="button"
            aria-label={`Dismiss ${toast.title}`}
            onClick={() => dismissToast(toast.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
