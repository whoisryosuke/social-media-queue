import type { Post } from '@social-scheduler/shared'
import { atom, computed } from 'nanostores'
import { $posts } from './posts'

export type CalendarViewMode = 'month' | 'week'

interface CalendarRange {
  view: CalendarViewMode
  /** ISO date (`YYYY-MM-DD`) inside the visible month/week. */
  cursor: string
}

export function todayKey(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const $calendarRange = atom<CalendarRange>({ view: 'month', cursor: todayKey() })

export function setCalendarView(view: CalendarViewMode): void {
  $calendarRange.set({ ...$calendarRange.get(), view })
}

export function moveCursor(direction: -1 | 1): void {
  const current = $calendarRange.get()
  const date = new Date(`${current.cursor}T12:00:00`)
  date.setDate(date.getDate() + direction * (current.view === 'month' ? 30 : 7))
  if (current.view === 'month') {
    date.setDate(1)
  }
  $calendarRange.set({ ...current, cursor: todayKey(date) })
}

export function goToday(): void {
  $calendarRange.set({ ...$calendarRange.get(), cursor: todayKey() })
}

/** Posts on the calendar: scheduled (or currently publishing) with a date. */
export const $calendarPosts = computed($posts, (posts) =>
  posts
    .filter(
      (post): post is Post & { scheduledAt: Date | string } =>
        post.scheduledAt !== null && (post.status === 'scheduled' || post.status === 'publishing'),
    )
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
);
