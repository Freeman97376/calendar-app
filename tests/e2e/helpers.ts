import type { Page } from '@playwright/test'

export async function localDate(page: Page, offsetDays = 0): Promise<string> {
  return page.evaluate((offset) => {
    const date = new Date()
    date.setDate(date.getDate() + offset)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }, offsetDays)
}

export async function sameWeekDate(page: Page): Promise<string> {
  return page.evaluate(() => {
    const date = new Date()
    date.setDate(date.getDate() + (date.getDay() === 1 ? 1 : -1))
    return date.toLocaleDateString('en-CA')
  })
}

export async function openCreateEvent(page: Page, offsetDays = 0): Promise<string> {
  const date = await localDate(page, offsetDays)
  await page.getByRole('button', { name: 'Today' }).click()
  await page.getByTestId(`date:${date}`).getByRole('button').first().click()
  return date
}
