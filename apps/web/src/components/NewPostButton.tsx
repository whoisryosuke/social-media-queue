import Button from './ui/Button'
import { openComposer } from '../stores/composer'

export default function NewPostButton(): JSX.Element {
  return (
    <Button variant="default" colorPalette="blue" onClick={() => openComposer()}>
      New post
    </Button>
  )
}
