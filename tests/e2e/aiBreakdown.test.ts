import { expect, test } from '@playwright/test'

test.describe('AI Assistant - E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('open AI panel and show no-key setup state', async ({ page }) => {
    await page.getByRole('button', { name: 'AI Assistant' }).click()

    await expect(page.getByRole('complementary', { name: 'AI assistant' })).toBeVisible()
    await expect(page.getByText(/VITE_AI_API_KEY/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Break down goal' })).toBeDisabled()
  })
})
