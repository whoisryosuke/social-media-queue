import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'
import type { Post } from '@social-scheduler/shared'
import { css, cx } from '../../../styled-system/css'
import { apiFetch } from '../../lib/api'
import { loadAccounts } from '../../stores/accounts'
import { $calendarPosts, $calendarRange, goToday, moveCursor, setCalendarView, todayKey } from '../../stores/calendar'
import { editPost } from '../posts/PostCard'
import { loadPosts, refreshPostsAction, updatePostScheduledAtLocal } from '../../stores/posts'
import { openComposer } from '../../stores/composer'
import { pushToast } from '../../stores/toasts'
import Badge from '../ui/Badge'
import Button from '../ui/Button'

const toolbarStyle = css({ display: 'flex', alignItems: 'center', gap: '2', marginBottom: '3', flexWrap: 'wrap' })
const titleStyle = css({ fontSize: '5', fontWeight: 'semibold', color: 'gray.12', flexGrow: 1 })
const monthGrid = css({
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: '1',
})
const weekdayStyle = css({ fontSize: '2', fontWeight: 'medium', color: 'gray.10', padding: '1', textAlign: 'center' })
const dayCell = (isToday: boolean, isPast: boolean, isOtherMonth: boolean) =>
  css({
    minHeight: '24',
    padding: '1',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: isToday ? 'gray.12' : 'gray.6',
    borderRadius: '3',
    background: isOtherMonth ? 'gray.1' : 'gray.2',
    opacity: isPast ? 0.55 : 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '1',
    overflow: 'hidden',
  })
const dateNum = css({ fontSize: '2', fontWeight: 'medium', color: 'gray.11' })
const chipStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '1',
  fontSize: '1',
  padding: '1',
  borderRadius: '2',
  background: 'gray.3',
  color: 'gray.12',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'gray.6',
  cursor: 'grab',
  textAlign: 'left',
  width: 'full',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
})
const snippetStyle = css({ overflow: 'hidden', textOverflow: 'ellipsis' })
const moreStyle = css({ fontSize: '1', color: 'gray.10', cursor: 'pointer', background: 'none', border: 'none' })
const weekGrid = css({ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1' })
const hourCell = (isPast: boolean) =>
  css({
    minHeight: '8',
    padding: '1',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'gray.6',
    borderRadius: '2',
    background: 'gray.2',
    opacity: isPast ? 0.55 : 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '1',
    overflow: 'hidden',
  })
const hourLabel = css({ fontSize: '1', color: 'gray.10' })

function keyOf(date: Date): string {
  return todayKey(date)
}

function parseKey(key: string): Date {
  return new Date(`${key}T12:00:00`)
}

function PostChip({ post }: { post: Post }): JSX.Element {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: post.id })
  const time =
    post.scheduledAt === null
      ? ''
      : new Date(post.scheduledAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const snippet = post.body === '' ? '(media)' : post.body.slice(0, 40)
  return (
    <button
      ref={setNodeRef}
      type="button"
      aria-label={`Edit scheduled post: ${snippet}`}
      className={chipStyle}
      style={isDragging ? { opacity: 0.5 } : undefined}
      onClick={() => editPost(post)}
      {...listeners}
      {...attributes}
    >
      <span>{time}</span>
      <span className={snippetStyle}>{snippet}</span>
    </button>
  )
}

function Droppable({
  id,
  disabled,
  className,
  label,
  onClick,
  children,
}: {
  id: string
  disabled: boolean
  className: string
  label: string
  onClick?: () => void
  children: React.ReactNode
}): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id, disabled })
  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-disabled={disabled}
      className={cx(className, isOver ? css({ borderColor: 'blue.8' }) : '')}
      onClick={onClick}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && onClick !== undefined) onClick()
      }}
    >
      {children}
    </div>
  )
}

function postsOnDay(posts: Post[], day: string): Post[] {
  return posts.filter(
    (post) => post.scheduledAt !== null && keyOf(new Date(post.scheduledAt)) === day,
  )
}

function DayCell({
  day,
  posts,
  otherMonth,
  expanded,
  onToggleMore,
  onCreate,
}: {
  day: string
  posts: Post[]
  otherMonth: boolean
  expanded: boolean
  onToggleMore: () => void
  onCreate: (day: string) => void
}): JSX.Element {
  const today = todayKey()
  const isPast = day < today
  const visible = expanded ? posts : posts.slice(0, 3)
  return (
    <Droppable
      id={`day:${day}`}
      disabled={isPast}
      className={dayCell(day === today, isPast, otherMonth)}
      label={isPast ? `${day} (past, cannot schedule)` : `Schedule on ${day}`}
      onClick={() => {
        if (!isPast) onCreate(day)
      }}
    >
      <span className={dateNum}>{Number(day.slice(8))}</span>
      {visible.map((post) => (
        <PostChip key={post.id} post={post} />
      ))}
      {posts.length > 3 && (
        <button type="button" className={moreStyle} onClick={(event) => {
          event.stopPropagation()
          onToggleMore()
        }}>
          {expanded ? 'Show less' : `+${posts.length - 3} more`}
        </button>
      )}
    </Droppable>
  )
}

export default function CalendarView(): JSX.Element {
  const range = useStore($calendarRange)
  const posts = useStore($calendarPosts)
  const [expandedDays, setExpandedDays] = useState<string[]>([])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  useEffect(() => {
    void loadPosts()
    void loadAccounts()
    const interval = setInterval(() => void refreshPostsAction(), 30_000)
    const onFocus = (): void => {
      void refreshPostsAction()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  function toggleMore(day: string): void {
    setExpandedDays((days) => (days.includes(day) ? days.filter((d) => d !== day) : [...days, day]))
  }

  function createOn(day: string): void {
    openComposer({ scheduledAt: `${day}T${new Date().toTimeString().slice(0, 5)}` })
  }

  async function handleDragEnd(event: DragEndEvent): Promise<void> {
    const over = event.over?.id
    if (typeof over !== 'string') return
    const post = posts.find((candidate) => candidate.id === event.active.id)
    if (post?.scheduledAt === null || post?.scheduledAt === undefined) return
    const previous = new Date(post.scheduledAt)
    let next: Date | null = null
    if (over.startsWith('day:')) {
      const day = parseKey(over.slice(4))
      next = new Date(day.getFullYear(), day.getMonth(), day.getDate(), previous.getHours(), previous.getMinutes())
    } else if (over.startsWith('slot:')) {
      const [dayPart, hourPart] = over.slice(5).split('T')
      const day = parseKey(dayPart)
      next = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(hourPart), previous.getMinutes())
    }
    if (next === null) return
    if (next.getTime() === previous.getTime()) return
    if (next.getTime() <= Date.now()) {
      pushToast('Cannot schedule in the past', 'error')
      return
    }
    updatePostScheduledAtLocal(post.id, next.toISOString())
    try {
      await apiFetch(`/api/posts/${post.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ scheduledAt: next.toISOString() }),
      })
      await refreshPostsAction()
      pushToast(`Rescheduled to ${next.toLocaleString()}`, 'success')
    } catch (error) {
      await refreshPostsAction()
      pushToast((error as Error).message, 'error')
    }
  }

  const cursor = parseKey(range.cursor)
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const monthTitle = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  // Month cells: leading blanks + days.
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthCells: (string | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => keyOf(new Date(year, month, i + 1))),
  ]

  // Week columns: Sunday-start week containing the cursor.
  const weekStart = new Date(cursor)
  weekStart.setDate(cursor.getDate() - cursor.getDay())
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart)
    date.setDate(weekStart.getDate() + i)
    return keyOf(date)
  })
  const hours = Array.from({ length: 24 }, (_, hour) => hour)

  return (
    <div>
      <h1>Calendar</h1>
      <div className={toolbarStyle}>
        <Button variant="outline" size="small" onClick={() => moveCursor(-1)}>
          ← Prev
        </Button>
        <Button variant="outline" size="small" onClick={goToday}>
          Today
        </Button>
        <Button variant="outline" size="small" onClick={() => moveCursor(1)}>
          Next →
        </Button>
        <span className={titleStyle}>{range.view === 'month' ? monthTitle : `Week of ${weekDays[0]}`}</span>
        <Button
          variant={range.view === 'month' ? 'default' : 'outline'}
          size="small"
          onClick={() => setCalendarView('month')}
        >
          Month
        </Button>
        <Button
          variant={range.view === 'week' ? 'default' : 'outline'}
          size="small"
          onClick={() => setCalendarView('week')}
        >
          Week
        </Button>
      </div>
      <DndContext sensors={sensors} onDragEnd={(event) => void handleDragEnd(event)}>
        {range.view === 'month' ? (
          <div className={monthGrid} role="grid" aria-label="Month calendar">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className={weekdayStyle}>
                {day}
              </div>
            ))}
            {monthCells.map((day, index) =>
              day === null ? (
                <div key={`blank-${index}`} />
              ) : (
                <DayCell
                  key={day}
                  day={day}
                  posts={postsOnDay(posts, day)}
                  otherMonth={false}
                  expanded={expandedDays.includes(day)}
                  onToggleMore={() => toggleMore(day)}
                  onCreate={createOn}
                />
              ),
            )}
          </div>
        ) : (
          <div className={weekGrid} role="grid" aria-label="Week calendar">
            {weekDays.map((day) => (
              <div key={day} className={css({ display: 'flex', flexDirection: 'column', gap: '1' })}>
                <div className={weekdayStyle}>
                  {parseKey(day).toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' })}
                </div>
                {hours.map((hour) => {
                  const slotPosts = postsOnDay(posts, day).filter((post) => {
                    if (post.scheduledAt === null) return false
                    return new Date(post.scheduledAt).getHours() === hour
                  })
                  const isPastSlot = new Date(
                    parseKey(day).getFullYear(),
                    parseKey(day).getMonth(),
                    parseKey(day).getDate(),
                    hour + 1,
                  ).getTime() <= Date.now()
                  return (
                    <Droppable
                      key={`${day}T${hour}`}
                      id={`slot:${day}T${hour}`}
                      disabled={isPastSlot}
                      className={hourCell(isPastSlot)}
                      label={`Schedule at ${hour}:00 on ${day}`}
                      onClick={() => {
                        if (!isPastSlot) {
                          openComposer({
                            scheduledAt: `${day}T${String(hour).padStart(2, '0')}:00`,
                          })
                        }
                      }}
                    >
                      <span className={hourLabel}>
                        {String(hour).padStart(2, '0')}:00
                      </span>
                      {slotPosts.map((post) => (
                        <PostChip key={post.id} post={post} />
                      ))}
                    </Droppable>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </DndContext>
      <p className={css({ fontSize: '2', color: 'gray.10', marginTop: '3' })}>
        Drag a post to another day to reschedule. Past times are disabled. <Badge>Tip</Badge> Click an empty
        slot to compose a post for that time.
      </p>
    </div>
  )
}
