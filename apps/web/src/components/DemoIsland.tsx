import { useStore } from '@nanostores/react'
import { css } from '../../styled-system/css'
import { $demoMessage } from '../stores/demo'

// Layout-only Panda styling (no custom preset yet — see PLAN 9.7).
const box = css({
  padding: '4',
  display: 'flex',
  flexDirection: 'column',
  gap: '2',
})

export default function DemoIsland(): JSX.Element {
  const message = useStore($demoMessage)
  return (
    <div className={box}>
      <p>{message}</p>
      <button type="button" onClick={() => $demoMessage.set('Island is interactive')}>
        Ping store
      </button>
    </div>
  )
}
