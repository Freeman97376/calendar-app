import { expect, test } from '@playwright/test'

test.describe('Active Tool review-first onboarding', () => {
  test('request to reviewed plan to transactional activation opens the workspace', async ({
    page,
  }) => {
    const futureDate = (days: number) => {
      const value = new Date()
      value.setDate(value.getDate() + days)
      return value.toISOString().slice(0, 10)
    }
    const plan = {
      title: 'E2E launch plan',
      summary: 'Launch a reviewed project within the confirmed capacity.',
      target_date: futureDate(56),
      template_id: 'goal-planner',
      template_label: 'Goal Planner',
      tool_name: 'Goal Planner',
      adapter_id: 'ai-progress',
      activation_form: {},
      tool_features: [],
      route_tags: ['goal-planning'],
      assumptions: ['Four hours per week remains available.'],
      missing_information: [],
      constraints: ['Stay within the confirmed budget.'],
      risks: [
        {
          label: 'Scope expansion',
          severity: 'medium',
          mitigation: 'Review scope weekly.',
        },
      ],
      review_cadence: { frequency: 'weekly', local_time: '20:00', timezone: 'UTC' },
      confidence: { level: 'high', reasons: ['Capacity and horizon were explicit.'] },
      safety_confirmation: false,
      metrics: [
        {
          name: 'Launch actions completed',
          role: 'leading',
          unit: 'actions',
          direction: 'increase',
          cadence: 'weekly',
          is_required: true,
        },
      ],
      milestones: [
        {
          title: 'Validate launch scope',
          description: 'Confirm the first release boundary.',
          due_date: futureDate(28),
          status: 'not_started',
        },
      ],
      actions: [
        {
          title: 'Write the launch brief',
          description: 'Capture scope, owner, and acceptance evidence.',
          milestone_title: 'Validate launch scope',
          due_date: futureDate(7),
          estimated_minutes: 60,
          priority: 'high',
          energy_needed: 'medium',
          execution_tier: 'standard',
          status: 'todo',
        },
      ],
      dependencies: [],
      policy: {
        weekly_capacity_minutes: 240,
        buffer_percent: 20,
        active_tier: 'standard',
        available_days: [],
        replan_thresholds: {},
        stop_rules: [],
        planning_brief: {},
      },
    }
    let calendarWrites = 0
    page.on('request', (request) => {
      if (
        request.url().includes('/api/calendar/events') &&
        ['POST', 'PATCH', 'DELETE'].includes(request.method())
      ) {
        calendarWrites += 1
      }
    })
    await page.route('**/api/config', async (route) => {
      const response = await route.fetch()
      const body = (await response.json()) as Record<string, unknown> & {
        deepseek?: Record<string, unknown>
      }
      await route.fulfill({
        response,
        json: {
          ...body,
          deepseek: { ...(body.deepseek ?? {}), configured: true, model: 'e2e-model' },
        },
      })
    })
    await page.route('**/api/ai/chat/completions', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: {
          choices: [{ message: { content: JSON.stringify(plan), role: 'assistant' } }],
          model: 'e2e-model',
          usage: { completion_tokens: 200, prompt_tokens: 300, total_tokens: 500 },
        },
        status: 200,
      })
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'AI Assistant' }).click()
    await page.getByRole('button', { name: 'Mode: Tools' }).click()
    await page
      .getByLabel('AI message')
      .fill(
        'Create a long-term goal plan to launch a project in 8 weeks with 4 hours per week; budget is the main constraint.',
      )
    await page.getByRole('button', { name: 'Find tool' }).click()

    await expect(page.getByRole('heading', { name: 'Enable Goal Planner?' })).toBeVisible()
    await page.getByRole('button', { name: 'Review initial plan' }).click()
    await expect(
      page.getByRole('heading', { name: 'Goal Planner · Initial plan / 初始计划' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Generate initial plan / 生成初始计划' }).click()

    await expect(page.getByText('E2E launch plan').first()).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Risk / 风险' })).toHaveValue('Scope expansion')
    await expect(page.locator('input[value="Write the launch brief"]')).toBeVisible()
    await page.getByRole('button', { name: 'Approve and create Active Tool / 批准并创建' }).click()

    await expect(page.getByRole('heading', { name: 'Active Tools' })).toBeVisible()
    await expect(page.getByText('Resume summary / 恢复摘要')).toBeVisible()
    await expect(page.getByText(/One next step \/ 唯一下一步/)).toBeVisible()
    await expect(page.getByTestId('goal-control-dashboard')).toBeVisible()
    expect(calendarWrites).toBe(0)
  })
})
