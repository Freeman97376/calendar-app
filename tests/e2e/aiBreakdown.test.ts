import { expect, test } from '@playwright/test'

test.describe('AI Assistant - E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('open AI panel and show no-key setup state', async ({ page }) => {
    await page.getByRole('button', { name: 'AI Assistant' }).click()

    await expect(page.getByRole('heading', { name: 'AI Assistant' })).toBeVisible()
    await expect(page.getByText('API / deepseek-chat')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled()
  })
})
