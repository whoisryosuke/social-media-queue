import Button from './ui/Button'
import { pushToast } from '../stores/toasts'

export default function NewPostButton(): JSX.Element {
  return (
    <Button
      variant="default"
      colorPalette="blue"
      onClick={() => pushToast('Composer arrives in Phase 7', 'info')}
    >
      New post
    </Button>
  )
}
