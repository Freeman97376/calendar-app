import { expect, test, type Page } from '@playwright/test'
import { openCreateEvent } from './helpers'

const password = process.env.CALENDAR_E2E_PASSWORD || 'Calendar-E2E-Password-123!'
const apiPort = process.env.CALENDAR_E2E_API_PORT || '8787'
const apiUrl = `http://127.0.0.1:${apiPort}`

async function login(page: Page, username: string) {
  await page.goto('/')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText(new RegExp(`^${username} `))).toBeVisible()
}

test.describe('Server authentication and account isolation', () => {
  test('CSRF write succeeds, expiry preserves draft, reauth requires a manual retry, and logout is real', async ({
    page,
  }) => {
    await login(page, 'e2e_alice')
    await openCreateEvent(page)
    const title = `Server reauth event ${Date.now()}`
    await page.getByLabel('Title').fill(title)

    const logoutStatus = await page.evaluate(async (serverApiUrl) => {
      const csrf = document.cookie
        .split('; ')
        .find((part) => part.startsWith('calendar_csrf='))
        ?.split('=')[1]
      const response = await fetch(`${serverApiUrl}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : {},
      })
      const saveButton = [...document.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === 'Save event',
      )
      if (!(saveButton instanceof HTMLButtonElement)) {
        throw new Error('Unable to locate the pending event form submit button.')
      }
      saveButton.click()
      return response.status
    }, apiUrl)
    expect(logoutStatus).toBe(200)

    const overlay = page.getByRole('dialog')
    await expect(overlay.getByText('Session expired', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Title')).toHaveValue(title)
    await overlay.getByLabel('Password').fill(password)
    await overlay.getByRole('button', { name: 'Sign in' }).click()
    await expect(overlay).toHaveCount(0)

    await expect(page.getByLabel('Title')).toHaveValue(title)
    await expect(page.getByRole('button', { name: `Edit event ${title}` })).toHaveCount(0)
    await page.getByRole('button', { name: 'Save event' }).click()
    await expect(page.getByRole('button', { name: `Edit event ${title}` })).toBeVisible()
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })

  test('two accounts cannot see one another calendar data', async ({ page }) => {
    await login(page, 'e2e_alice')
    await openCreateEvent(page)
    const privateTitle = `Alice private ${Date.now()}`
    await page.getByLabel('Title').fill(privateTitle)
    await page.getByRole('button', { name: 'Save event' }).click()
    await expect(page.getByRole('button', { name: `Edit event ${privateTitle}` })).toBeVisible()
    await page.getByRole('button', { name: 'Sign out' }).click()

    await page.getByLabel('Username').fill('e2e_bob')
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText(/^e2e_bob /)).toBeVisible()
    await expect(page.getByRole('button', { name: `Edit event ${privateTitle}` })).toHaveCount(0)
  })
})
