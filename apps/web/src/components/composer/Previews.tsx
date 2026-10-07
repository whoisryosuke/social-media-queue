import { useStore } from '@nanostores/react'
import type { ReactNode } from 'react'
import { css } from '../../../styled-system/css'
import { baseUrl } from '../../lib/api'
import { $preview, type PreviewModel } from '../../stores/preview'
import panelStyle from '../../theme/styles/panel.style'
import Avatar from '../ui/Avatar'
import Badge from '../ui/Badge'

const gridStyle = css({ display: 'flex', flexDirection: 'column', gap: '3' })
const cardStyle = css({ padding: '3', display: 'flex', flexDirection: 'column', gap: '2' })
const headStyle = css({ display: 'flex', alignItems: 'center', gap: '2' })
const nameStyle = css({ fontSize: '3', fontWeight: 'semibold', color: 'gray.12' })
const handleStyle = css({ fontSize: '2', color: 'gray.10' })
const textStyle = css({ fontSize: '3', color: 'gray.12', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' })
const entityStyle = css({ color: 'blue.11' })
const overStyle = css({ background: 'red.3', color: 'red.11' })
const counterStyle = (over: boolean) =>
  css({ fontSize: '2', color: over ? 'red.11' : 'gray.10', fontWeight: 'medium' })
const mediaGrid = (count: number) =>
  css({
    display: 'grid',
    gridTemplateColumns: count > 1 ? '1fr 1fr' : '1fr',
    gap: '1',
    borderRadius: '3',
    overflow: 'hidden',
  })
const mediaImg = css({ width: 'full', height: 'auto', aspectRatio: 'wide', objectFit: 'cover' })
const videoBadge = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  aspectRatio: 'wide',
  background: 'gray.4',
  color: 'gray.11',
  fontSize: '8',
})
const metaRow = css({ display: 'flex', alignItems: 'center', gap: '2', flexWrap: 'wrap' })

const URL_SPLIT_PATTERN = /(https?:\/\/[^\s<]+)/g
const ENTITY_PATTERN = /(https?:\/\/[^\s<]+|#[\p{L}\p{N}_-]+|@[\p{L}\p{N}._-]+)/gu

function renderEntities(text: string): ReactNode[] {
  return text.split(ENTITY_PATTERN).map((part, index) => {
    if (part === '') return null
    if (part.startsWith('http://') || part.startsWith('https://')) {
      return (
        <a key={index} href={part} target="_blank" rel="noreferrer" className={entityStyle}>
          {part}
        </a>
      )
    }
    if (part.startsWith('#') || part.startsWith('@')) {
      return (
        <span key={index} className={entityStyle}>
          {part}
        </span>
      )
    }
    return <span key={index}>{part}</span>
  })
}

/**
 * Splits text into within-budget and over-budget parts. URLs consume a fixed
 * budget (Mastodon counts them as 23 chars); everything else is grapheme
 * counted. Approximation is exact for Bluesky (budget 1 per grapheme).
 */
function splitOverLimit(text: string, limit: number, urlWeight: number): [ReactNode[], ReactNode[]] {
  const segments = text.split(URL_SPLIT_PATTERN)
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  let remaining = limit
  const within: ReactNode[] = []
  const over: ReactNode[] = []
  segments.forEach((segment, index) => {
    if (segment === '') return
    const isUrl = index % 2 === 1
    if (remaining <= 0) {
      over.push(<span key={index}>{renderEntities(segment)}</span>)
      return
    }
    if (isUrl) {
      if (urlWeight <= remaining) {
        remaining -= urlWeight
        within.push(<span key={index}>{renderEntities(segment)}</span>)
      } else {
        remaining = 0
        over.push(<span key={index}>{renderEntities(segment)}</span>)
      }
      return
    }
    const graphemes = [...segmenter.segment(segment)]
    if (graphemes.length <= remaining) {
      remaining -= graphemes.length
      within.push(<span key={index}>{renderEntities(segment)}</span>)
      return
    }
    const cut = graphemes.slice(0, remaining).map((g) => g.segment).join('')
    const rest = graphemes.slice(remaining).map((g) => g.segment).join('')
    remaining = 0
    within.push(<span key={index}>{renderEntities(cut)}</span>)
    over.push(<span key={over.length + segments.length}>{renderEntities(rest)}</span>)
  })
  return [within, over]
}

function PreviewText({ model, urlWeight }: { model: PreviewModel; urlWeight: number }): JSX.Element {
  if (!model.counter.over) return <p className={textStyle}>{renderEntities(model.text)}</p>
  const [within, over] = splitOverLimit(model.text, model.counter.limit, urlWeight)
  return (
    <p className={textStyle}>
      {within}
      <span className={overStyle}>{over}</span>
    </p>
  )
}

function PreviewMedia({ model }: { model: PreviewModel }): JSX.Element | null {
  if (model.media.length === 0) return null
  return (
    <div className={mediaGrid(model.media.length)}>
      {model.media.map((item) => {
        const src = item.url.startsWith('/') ? `${baseUrl()}${item.url}` : item.url
        return (
          <div key={item.mediaId}>
            {item.mime.startsWith('video/') || item.url === '' ? (
              <span className={videoBadge} role="img" aria-label="Video attached">
                ▶
              </span>
            ) : (
              <img src={src} alt={item.altText} className={mediaImg} />
            )}
            {item.altText !== '' && <Badge>ALT</Badge>}
          </div>
        )
      })}
    </div>
  )
}

function scheduledLabel(iso: string | null): string {
  if (iso === null || iso === '') return 'Not scheduled'
  return new Date(iso).toLocaleString()
}

function PreviewFrame({ model, urlWeight }: { model: PreviewModel; urlWeight: number }): JSX.Element {
  return (
    <article data-testid={`preview-${model.platform}`} className={`${panelStyle} ${cardStyle}`}>
      <div className={headStyle}>
        <Avatar src={model.avatarUrl} name={model.displayName} size="sm" />
        <div>
          <p className={nameStyle}>{model.displayName}</p>
          <p className={handleStyle}>{model.handle}</p>
        </div>
      </div>
      <PreviewText model={model} urlWeight={urlWeight} />
      <PreviewMedia model={model} />
      <div className={metaRow}>
        <span className={counterStyle(model.counter.over)}>
          {model.counter.used}/{model.counter.limit}
        </span>
        {model.overridden && <Badge colorPalette="blue">customized</Badge>}
        <span className={handleStyle}>{scheduledLabel(model.scheduledAt)}</span>
      </div>
      {model.issues.map((issue) => (
        <p key={issue} className={counterStyle(true)}>
          {issue}
        </p>
      ))}
    </article>
  )
}

export function MastodonPreview({ model }: { model: PreviewModel }): JSX.Element {
  return <PreviewFrame model={model} urlWeight={23} />
}

export function BlueskyPreview({ model }: { model: PreviewModel }): JSX.Element {
  return <PreviewFrame model={model} urlWeight={1} />
}

export default function PreviewPanel(): JSX.Element {
  const previews = useStore($preview)
  if (previews.length === 0) {
    return <p>Select at least one account to see live previews.</p>
  }
  return (
    <div className={gridStyle}>
      {previews.map((model) =>
        model.platform === 'bluesky' ? (
          <BlueskyPreview key={model.accountId} model={model} />
        ) : (
          <MastodonPreview key={model.accountId} model={model} />
        ),
      )}
    </div>
  )
}
