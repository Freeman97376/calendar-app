import { expect, test } from '@playwright/test'

test.describe('Desktop stability flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('exports a backup and previews it before import', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export backup' }).click()
    const download = await downloadPromise
    const backupPath = await download.path()
    expect(backupPath).not.toBeNull()

    await page.getByLabel('Choose Calendar backup').setInputFiles(backupPath!)
    await page.getByRole('button', { name: 'Preview merge' }).click()
    await expect(page.getByRole('heading', { name: 'Import preview' })).toBeVisible()
    /*
    await expect(page.getByText(/^v2 � [0-9a-f]{12}/)).toBeVisible()
    */
    await expect(page.getByText(/^v2 \u00b7 [0-9a-f]{12}/)).toBeVisible()
  })

  test('creates and explicitly skips a due Check-in', async ({ page }) => {
    const stamp = Date.now().toString()
    const projectId = `e2e-project-${stamp}`
    const goalId = `e2e-goal-${stamp}`
    const threadId = `e2e-thread-${stamp}`
    const futureDate = (days: number) => {
      const date = new Date()
      date.setDate(date.getDate() + days)
      return date.toISOString().slice(0, 10)
    }
    const created = await page.request.post('/api/goal-conversations', {
      data: { thread_id: threadId, title: 'E2E Check-in plan' },
    })
    expect(created.ok()).toBeTruthy()
    const activated = await page.request.post(`/api/goal-conversations/${threadId}/activate`, {
      data: {
        title: 'E2E Check-in plan',
        summary: 'Exercise the explicit Check-in skip flow.',
        target_date: futureDate(90),
        goal_id: goalId,
        project_id: projectId,
        template_id: 'e2e',
        template_label: 'E2E',
        metrics: [
          {
            metric_id: `metric-${stamp}`,
            name: 'Completion',
            role: 'leading',
            unit: '%',
            direction: 'increase',
            baseline_value: 0,
            target_value: 100,
            cadence: 'weekly',
            is_required: true,
          },
        ],
        milestones: [
          {
            milestone_id: `milestone-${stamp}`,
            title: 'First milestone',
            due_date: futureDate(30),
          },
        ],
        actions: [
          {
            action_id: `action-${stamp}`,
            title: 'First action',
            milestone_id: `milestone-${stamp}`,
            due_date: futureDate(7),
            estimated_minutes: 30,
            execution_tier: 'standard',
          },
        ],
        dependencies: [],
        policy: {
          weekly_capacity_minutes: 120,
          buffer_percent: 20,
          active_tier: 'standard',
          ai_usage_mode: 'economy',
        },
      },
    })
    expect(activated.ok(), await activated.text()).toBeTruthy()
    const ensured = await page.request.post('/api/check-ins/ensure')
    expect(ensured.ok()).toBeTruthy()

    await page.reload()
    const skip = page.getByRole('button', { name: 'Skip this Check-in' }).first()
    await expect(skip).toBeVisible()
    page.once('dialog', (dialog) => dialog.accept())
    await skip.click()
    await expect(skip).toHaveCount(0)
  })
})
