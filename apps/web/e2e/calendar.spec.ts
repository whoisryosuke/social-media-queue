import { expect, test } from '@playwright/test'

function dayKey(offsetDays: number): string {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

test.describe('calendar', () => {
  test('dragging a chip reschedules the post persistently', async ({ page, request }) => {
    // Seed a scheduled post 1 day out (Mastodon test account).
    const scheduledAt = new Date(Date.now() + 1 * 24 * 3_600_000).toISOString()
    const created = await request.post('http://localhost:4000/api/posts', {
      data: {
        body: 'calendar drag test',
        accountIds: ['127c16ff-c791-49fa-93d5-445bdaaed010'],
        scheduledAt,
      },
    })
    expect(created.status()).toBe(201)
    const post = (await created.json()) as { id: string }

    try {
      await page.goto('/calendar')
      const chip = page.getByRole('button', { name: /calendar drag test/ })
      await expect(chip).toBeVisible()

      const targetDay = dayKey(2)
      const cell = page.getByLabel(`Schedule on ${targetDay}`)
      await expect(cell).toBeVisible()
      const from = await chip.boundingBox()
      const to = await cell.boundingBox()
      if (from === null || to === null) throw new Error('missing drag geometry')
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
      await page.mouse.down()
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 25 })
      await page.mouse.up()
      await expect(page.getByText('Rescheduled to')).toBeVisible()

      const fetched = await request.get(`http://localhost:4000/api/posts/${post.id}`)
      const updated = (await fetched.json()) as { scheduledAt: string }
      const localDate = new Date(updated.scheduledAt)
      const localKey = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`
      expect(localKey).toBe(targetDay)

      // Week view shows the chip; clicking an empty future slot pre-fills the composer.
      await page.getByRole('button', { name: 'Week', exact: true }).click()
      await expect(page.getByRole('button', { name: /calendar drag test/ })).toBeVisible()
      const slotDay = dayKey(2)
      await page.getByLabel(`Schedule at 10:00 on ${slotDay}`).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByLabel('Scheduled date and time')).toHaveValue(`${slotDay}T10:00`)
      await dialog.getByRole('button', { name: 'Cancel' }).click()
    } finally {
      await request.delete(`http://localhost:4000/api/posts/${post.id}`)
    }
  })
})
