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

test('a shared invitation registers two ordinary users, with invalid codes rejected', async ({
  page,
}) => {
  const inviteCode = process.env.CALENDAR_E2E_INVITE_CODE || 'Calendar-E2E-Shared-Invite'
  const suffix = Date.now()
  await page.goto('/')
  for (const index of [1, 2]) {
    const username = `e2e_invited_${suffix}_${index}`
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.getByLabel('Username', { exact: false }).fill(username)
    await page.getByLabel('Password', { exact: false }).first().fill(password)
    await page.getByLabel('Confirm password', { exact: true }).fill(password)
    await page
      .getByLabel('Invitation code', { exact: true })
      .fill(index === 1 ? 'invalid-invite' : inviteCode)
    await page.getByRole('button', { name: 'Create account', exact: true }).click()
    if (index === 1) {
      await expect(page.getByRole('alert')).toContainText('This invitation code is invalid.')
      await page.getByLabel('Password', { exact: false }).first().fill(password)
      await page.getByLabel('Confirm password', { exact: true }).fill(password)
      await page.getByLabel('Invitation code', { exact: false }).fill(inviteCode)
      await page.getByRole('button', { name: 'Create account', exact: true }).click()
    }
    await expect(page.getByRole('status')).toContainText('Account created.')
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByText(new RegExp(`^${username} `))).toBeVisible()
    const profile = await page.evaluate(
      async (url) => (await fetch(`${url}/api/auth/me`, { credentials: 'include' })).json(),
      apiUrl,
    )
    expect(profile.user.role).toBe('user')
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  }
})

test('personal API settings survive refresh, stay private and remain isolated after logout', async ({
  page,
}) => {
  await login(page, 'e2e_alice')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'AI API settings' })).toBeVisible()
  await page.getByLabel('API Key', { exact: true }).fill('synthetic-browser-alice-key')
  await page.getByRole('button', { name: 'Save API settings' }).click()
  await expect(page.getByText('Settings saved. Connection has not been tested.')).toBeVisible()
  await expect(page.getByLabel('API Key', { exact: true })).toHaveValue('')
  const status = await page.evaluate(
    async (url) => (await fetch(`${url}/api/ai/settings`, { credentials: 'include' })).json(),
    apiUrl,
  )
  expect(status.personalKeyConfigured).toBe(true)
  expect(JSON.stringify(status)).not.toContain('synthetic-browser-alice-key')
  await page.reload()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByText('Using your personal API key.')).toBeVisible()
  await expect(page.getByLabel('API Key', { exact: true })).toHaveValue('')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await login(page, 'e2e_bob')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByText('No API key configured. Add your key to enable AI.')).toBeVisible()
  await page.getByLabel('API Key', { exact: true }).fill('synthetic-browser-bob-key')
  await page.getByRole('button', { name: 'Save API settings' }).click()
  await expect(page.getByText('Settings saved. Connection has not been tested.')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('heading', { name: 'AI API settings' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({ path: 'test-results/personal-ai-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Remove personal key' }).click()
  await page.getByRole('button', { name: 'Confirm removal' }).click()
  await expect(page.getByText('Personal key removed.')).toBeVisible()
})
