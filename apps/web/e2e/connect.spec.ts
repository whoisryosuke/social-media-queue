import { expect, test } from '@playwright/test'

const MOCK_API = 'http://localhost:4001'

test.describe('connect accounts (mock platforms)', () => {
  test('connects bluesky and mastodon accounts without network', async ({ page, request }) => {
    await page.goto('/accounts')

    // Bluesky with fake credentials.
    await page.getByPlaceholder('you.bsky.social').fill('mock.test')
    await page.getByLabel('App password').fill('fake-password')
    await page.getByRole('button', { name: 'Connect', exact: true }).last().click()
    await expect(page.getByText('@mock.test')).toBeVisible()

    // Mastodon: start redirects straight to the local callback in mock mode.
    await page.getByPlaceholder('mastodon.social').fill('mock.instance')
    await page.getByRole('button', { name: 'Connect', exact: true }).first().click()
    await expect(page).toHaveURL(/\/accounts\?connected=mastodon/)
    await expect(page.getByText('@mockuser@mock.instance')).toBeVisible()

    // Both accounts listed via the API; clean up afterwards.
    const listed = (await (await request.get(`${MOCK_API}/api/accounts`)).json()) as { id: string }[]
    expect(listed).toHaveLength(2)
    for (const account of listed) {
      await request.delete(`${MOCK_API}/api/accounts/${account.id}`)
    }
    await page.reload()
    await expect(page.getByText('No accounts connected')).toBeVisible()
  })
})
