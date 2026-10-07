import { expect, test } from '@playwright/test'

test.describe('queue and drafts views', () => {
  test('drafts list drafts and queue shows the empty state', async ({ page, request }) => {
    const created = await request.post('http://localhost:4000/api/posts', {
      data: { body: 'e2e draft post', accountIds: ['127c16ff-c791-49fa-93d5-445bdaaed010'] },
    })
    expect(created.status()).toBe(201)
    const draft = (await created.json()) as { id: string }

    try {
      await page.goto('/drafts')
      await expect(page.getByText('e2e draft post')).toBeVisible()

      await page.goto('/queue')
      await expect(page.getByText('Nothing scheduled')).toBeVisible()
    } finally {
      await request.delete(`http://localhost:4000/api/posts/${draft.id}`)
    }
  })
})
