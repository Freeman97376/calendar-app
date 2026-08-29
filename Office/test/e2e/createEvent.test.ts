import { expect, test } from '@playwright/test'
import { openCreateEvent } from './helpers'

test.describe('Create Event - E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload({ waitUntil: 'domcontentloaded' })
  })

  test('navigate to a date, create event, verify it appears on calendar', async ({ page }) => {
    await openCreateEvent(page)
    await page.getByLabel('Title').fill('E2E planning session')
    await page.getByRole('button', { name: 'Save event' }).click()

    await expect(
      page.getByRole('button', { name: 'Edit event E2E planning session' }),
    ).toBeVisible()
  })

  test('created event persists after page reload', async ({ page }) => {
    await openCreateEvent(page)
    await page.getByLabel('Title').fill('Reload-safe planning')
    await page.getByRole('button', { name: 'Save event' }).click()
    await page.reload({ waitUntil: 'domcontentloaded' })

    await expect(
      page.getByRole('button', { name: 'Edit event Reload-safe planning' }),
    ).toBeVisible()
  })

  test('event appears in all three views', async ({ page }) => {
    await openCreateEvent(page)
    await page.getByLabel('Title').fill('Cross-view planning')
    await page.getByRole('button', { name: 'Save event' }).click()

    await page.getByRole('tab', { name: 'Week' }).click()
    await expect(page.getByRole('button', { name: 'Edit event Cross-view planning' })).toBeVisible()

    await page.getByRole('tab', { name: 'Day' }).click()
    await expect(page.getByRole('button', { name: 'Edit event Cross-view planning' })).toBeVisible()
  })
})
