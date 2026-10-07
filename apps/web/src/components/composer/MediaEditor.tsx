import { useStore } from '@nanostores/react'
import { useRef, useState } from 'react'
import { css } from '../../../styled-system/css'
import { baseUrl } from '../../lib/api'
import {
  $composer,
  moveComposerMedia,
  removeComposerMedia,
  updateComposerMedia,
  uploadComposerFile,
} from '../../stores/composer'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Input from '../ui/Input'

const listStyle = css({ display: 'flex', flexDirection: 'column', gap: '2' })
const itemStyle = css({
  display: 'flex',
  gap: '3',
  alignItems: 'flex-start',
  padding: '2',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'gray.6',
  borderRadius: '3',
  background: 'gray.1',
})
const thumbStyle = css({ width: '16', height: '16', objectFit: 'cover', borderRadius: '2', flexShrink: 0 })
const growStyle = css({ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '1', minWidth: '0' })
const progressStyle = css({ height: '1', background: 'gray.4', borderRadius: 'full', overflow: 'hidden' })
const progressFill = css({ height: 'full', background: 'blue.9' })
const dropStyle = (active: boolean) =>
  css({
    borderWidth: '1px',
    borderStyle: 'dashed',
    borderColor: active ? 'blue.8' : 'gray.6',
    borderRadius: '3',
    padding: '4',
    textAlign: 'center',
    color: 'gray.10',
    fontSize: '2',
    cursor: 'pointer',
  })
const rowButtons = css({ display: 'flex', gap: '1' })

function fullUrl(url: string): string {
  return url.startsWith('/') ? `${baseUrl()}${url}` : url
}

export default function MediaEditor(): JSX.Element {
  const composer = useStore($composer)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function addFiles(files: FileList | null): void {
    if (files === null) return
    for (const file of files) void uploadComposerFile(file)
  }

  return (
    <div className={listStyle}>
      <div
        role="button"
        tabIndex={0}
        aria-label="Add media"
        className={dropStyle(dragging)}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click()
        }}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          addFiles(event.dataTransfer.files)
        }}
      >
        Drag images or video here, or click to choose files
        <input
          ref={inputRef}
          type="file"
          hidden
          multiple
          accept="image/*,video/*"
          onChange={(event) => {
            addFiles(event.target.files)
            event.target.value = ''
          }}
        />
      </div>
      {composer.media.map((item) => (
        <div key={item.mediaId} className={itemStyle}>
          {item.progress !== null || item.url === '' ? (
            <div className={thumbStyle} aria-label="Uploading" />
          ) : item.mime.startsWith('video/') ? (
            <span className={thumbStyle} aria-label="Video attached">
              ▶
            </span>
          ) : (
            <img src={fullUrl(item.url)} alt="" className={thumbStyle} />
          )}
          <div className={growStyle}>
            {item.progress !== null ? (
              <div className={progressStyle} role="progressbar" aria-valuenow={Math.round(item.progress * 100)}>
                <div className={progressFill} style={{ width: `${Math.round(item.progress * 100)}%` }} />
              </div>
            ) : (
              <>
                {item.mime.startsWith('video/') && <Badge>video</Badge>}
                <Input
                  aria-label="Alt text"
                  placeholder="Alt text (accessibility)"
                  value={item.altText}
                  onChange={(event) => updateComposerMedia(item.mediaId, { altText: event.target.value })}
                />
              </>
            )}
            <div className={rowButtons}>
              <Button variant="ghost" size="small" aria-label="Move earlier" onClick={() => moveComposerMedia(item.mediaId, -1)}>
                ←
              </Button>
              <Button variant="ghost" size="small" aria-label="Move later" onClick={() => moveComposerMedia(item.mediaId, 1)}>
                →
              </Button>
              <Button variant="ghost" size="small" onClick={() => removeComposerMedia(item.mediaId)}>
                Remove
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
