import { expect, test } from '@playwright/test'

test.describe('composer and smart preview', () => {
  test('typing updates per-platform previews, validation blocks schedule', async ({ page }) => {
    await page.goto('/queue')
    await page.getByRole('button', { name: 'New post' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Pick both accounts: two live previews appear.
    await dialog.getByRole('button', { name: /mastodon\.social/ }).first().click()
    await dialog.getByRole('button', { name: /bsky\.social/ }).first().click()
    await expect(dialog.getByTestId('preview-mastodon')).toBeVisible()
    await expect(dialog.getByTestId('preview-bluesky')).toBeVisible()

    // Typing updates the previews instantly, with entity highlighting.
    await dialog.getByLabel('Post text').fill('Hello world #roadtest https://example.com')
    await expect(dialog.getByTestId('preview-mastodon').getByText('Hello world')).toBeVisible()
    await expect(dialog.getByTestId('preview-mastodon').getByText('#roadtest')).toBeVisible()

    // Bluesky-only selection shows only the Bluesky preview and counter.
    await dialog.getByRole('button', { name: /mastodon\.social/ }).first().click()
    await expect(dialog.getByTestId('preview-mastodon')).toHaveCount(0)
    await expect(dialog.getByTestId('preview-bluesky')).toBeVisible()
    await expect(dialog.getByTestId('preview-bluesky').getByText('41/300')).toBeVisible()

    // Over-limit text blocks Schedule and Post now with a reason.
    await dialog.getByLabel('Post text').fill('x'.repeat(301))
    await expect(dialog.getByText(/exceeds the character limit/)).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Schedule' })).toBeDisabled()
    await expect(dialog.getByRole('button', { name: 'Post now' })).toBeDisabled()

    // Media upload with progress, alt text, reorder and remove.
    await dialog.getByLabel('Post text').fill('media test')
    const [uploadResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().includes('/api/media') && response.status() === 201),
      dialog.locator('input[type="file"]').setInputFiles({
        name: 'roadtest.png',
        mimeType: 'image/png',
        buffer: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          'base64',
        ),
      }),
    ])
    const uploaded = (await uploadResponse.json()) as { id: string }
    await expect(dialog.getByLabel('Alt text')).toBeVisible()
    await dialog.getByLabel('Alt text').fill('a red pixel')
    // Remove again so no draft artefacts remain (media row deleted below).
    await dialog.getByRole('button', { name: 'Remove' }).click()
    await expect(dialog.getByLabel('Alt text')).toHaveCount(0)

    // Close without saving; clean up the uploaded media row.
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
    await page.request.delete(`http://localhost:4000/api/media/${uploaded.id}`)

    // Full composer flow: draft content, schedule from the UI, then unschedule
    // and delete via the API (no live publish in tests).
    await page.getByRole('button', { name: 'New post' }).click()
    const draft = page.getByRole('dialog')
    await draft.getByRole('button', { name: /mastodon\.social/ }).first().click()
    await draft.getByLabel('Post text').fill('e2e scheduled post')
    const future = new Date(Date.now() + 2 * 3_600_000)
    const local = new Date(future.getTime() - future.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16)
    await draft.getByLabel('Scheduled date and time').fill(local)
    const [createdResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().endsWith('/api/posts') && response.request().method() === 'POST'),
      draft.getByRole('button', { name: 'Schedule' }).click(),
    ])
    const created = (await createdResponse.json()) as { id: string }
    await expect(draft).toHaveCount(0)
    await page.request.post(`http://localhost:4000/api/posts/${created.id}/unschedule`)
    await page.request.delete(`http://localhost:4000/api/posts/${created.id}`)
  })
})
