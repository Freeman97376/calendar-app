import { expect, test, type Locator, type Page } from '@playwright/test'
import { localDate, openCreateEvent, sameWeekDate } from './helpers'

async function dragTo(page: Page, source: Locator, target: Locator) {
  await target.scrollIntoViewIfNeeded()
  await source.scrollIntoViewIfNeeded()
  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()

  if (!sourceBox || !targetBox) {
    throw new Error('Unable to locate drag source or target')
  }

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2 + 8,
    sourceBox.y + sourceBox.height / 2 + 8,
    {
      steps: 4,
    },
  )
  await page.waitForTimeout(100)
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 12,
  })
  await page.waitForTimeout(150)
  await page.mouse.up()
}

test.describe('Drag and Drop - E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload({ waitUntil: 'domcontentloaded' })
  })

  test('drag event to new date in month view updates the event date', async ({ page }) => {
    const sourceDate = await openCreateEvent(page, 4)
    const targetDate = await localDate(page, 5)
    await page.getByLabel('Title').fill('E2E draggable')
    await page.getByRole('button', { name: 'Save event' }).click()
    await expect(page.getByRole('button', { name: 'Edit event E2E draggable' })).toBeVisible()

    await dragTo(
      page,
      page.getByRole('button', { name: 'Edit event E2E draggable' }),
      page.getByTestId(`date:${targetDate}`),
    )

    await expect(
      page
        .getByTestId(`date:${targetDate}`)
        .getByRole('button', { name: 'Edit event E2E draggable' }),
    ).toBeVisible()
    await expect(
      page
        .getByTestId(`date:${sourceDate}`)
        .getByRole('button', { name: 'Edit event E2E draggable' }),
    ).toHaveCount(0)
  })

  test('drag event to new time slot in week view updates the event time', async ({ page }) => {
    await openCreateEvent(page)
    const targetDate = await sameWeekDate(page)
    await page.getByLabel('Title').fill('E2E timed drag')
    await page.getByRole('button', { name: 'Save event' }).click()
    await page.getByRole('tab', { name: 'Week' }).click()

    await dragTo(
      page,
      page.getByRole('button', { name: 'Edit event E2E timed drag' }),
      page.getByTestId(`time-slot:${targetDate}:11`),
    )

    await expect(
      page
        .getByTestId(`time-slot:${targetDate}:11`)
        .getByRole('button', { name: 'Edit event E2E timed drag' }),
    ).toBeVisible()
  })

  test('drag recurring event asks for recurrence scope', async ({ page }) => {
    await openCreateEvent(page)
    const targetDate = await localDate(page, 3)
    await page.getByLabel('Title').fill('E2E recurring drag')
    await page.getByLabel('Repeat frequency').selectOption('daily')
    await page.getByLabel('Ends').selectOption('count')
    await page.getByLabel('Occurrences').fill('3')
    await page.getByRole('button', { name: 'Save event' }).click()

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('Apply drag to')
      await dialog.accept('this')
    })

    await dragTo(
      page,
      page.getByRole('button', { name: 'Edit event E2E recurring drag' }).first(),
      page.getByTestId(`date:${targetDate}`),
    )

    await expect(
      page
        .getByTestId(`date:${targetDate}`)
        .getByRole('button', { name: 'Edit event E2E recurring drag' }),
    ).toBeVisible()
  })
})
