import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import GoalConversationPanel from '../../../src/components/ai/GoalConversationPanel'
import type {
  GoalActivationPlan,
  GoalConversationMessage,
  GoalConversationThread,
} from '../../../src/domain/types/goalControl'
import { server } from '../support/mocks/server'

describe('long-term goal current-situation anchoring', () => {
  beforeEach(() => {
    const thread: GoalConversationThread = {
      thread_id: 'anchor-thread',
      kind: 'goal_draft',
      status: 'draft',
      title: 'Improve fitness',
      rolling_summary: '',
      metadata: {},
      created_at: '2026-07-14T00:00:00Z',
      updated_at: '2026-07-14T00:00:00Z',
    }
    const messages: GoalConversationMessage[] = []

    server.use(
      http.get('*/api/goal-conversations', () => HttpResponse.json({ success: true, threads: [] })),
      http.post('*/api/goal-conversations', () => HttpResponse.json({ success: true, thread })),
      http.post('*/api/goal-conversations/:threadId/messages', async ({ request }) => {
        const body = (await request.json()) as Pick<
          GoalConversationMessage,
          'role' | 'content' | 'structured'
        >
        const message: GoalConversationMessage = {
          ...body,
          message_id: `message-${messages.length + 1}`,
          thread_id: thread.thread_id,
          created_at: '2026-07-14T00:00:00Z',
          updated_at: '2026-07-14T00:00:00Z',
        }
        messages.push(message)
        return HttpResponse.json({ success: true, message })
      }),
    )
  })

  it('asks for the real starting point before targets and renders a reviewable anchor', async () => {
    const user = userEvent.setup()
    render(<GoalConversationPanel onClose={() => undefined} />)

    await user.type(screen.getByLabelText(/What long-term goal/), 'Improve fitness')
    await user.click(screen.getByRole('button', { name: /Start with current situation/ }))

    expect(await screen.findByText(/Where are you starting from right now/)).toBeInTheDocument()
    expect(screen.queryByText(/What result matters most/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Returning after a break/ }))
    await user.click(screen.getByRole('button', { name: /Recent measurements/ }))
    await user.type(screen.getByLabelText(/What current evidence.*custom answer/), 'Weight 82 kg')
    await user.click(screen.getByRole('button', { name: /Schedule or energy/ }))
    await user.click(screen.getByRole('button', { name: /Continue/ }))

    expect(
      await screen.findByRole('heading', { name: /Current situation anchor/ }),
    ).toBeInTheDocument()
    expect(screen.getAllByText(/Weight 82 kg/).length).toBeGreaterThan(0)
    expect(await screen.findByText(/What result matters most/)).toBeInTheDocument()
  })

  it('shows draft names without automatically opening the first draft', async () => {
    let detailRequests = 0
    const draft: GoalConversationThread = {
      thread_id: 'existing-draft',
      kind: 'goal_draft',
      status: 'draft',
      title: 'Existing draft',
      rolling_summary: '',
      metadata: {},
      created_at: '2026-07-14T00:00:00Z',
      updated_at: '2026-07-14T00:00:00Z',
    }
    server.use(
      http.get('*/api/goal-conversations', () =>
        HttpResponse.json({ success: true, threads: [draft] }),
      ),
      http.get('*/api/goal-conversations/:threadId', () => {
        detailRequests += 1
        return HttpResponse.json({ success: true, thread: draft, messages: [] })
      }),
    )
    render(<GoalConversationPanel onClose={() => undefined} />)

    expect(await screen.findByRole('button', { name: 'Existing draft' })).toBeInTheDocument()
    expect(screen.getByLabelText(/What long-term goal/)).toBeInTheDocument()
    expect(detailRequests).toBe(0)
  })

  it('asks one scheduling question and never calls activation for a capacity-invalid draft', async () => {
    const user = userEvent.setup()
    const targetDate = new Date(Date.now() + 28 * 86_400_000).toISOString().slice(0, 10)
    const draft: GoalConversationThread = {
      thread_id: 'capacity-draft',
      kind: 'goal_draft',
      status: 'draft',
      title: 'Capacity draft',
      rolling_summary: '',
      metadata: {},
      created_at: '2026-08-31T00:00:00Z',
      updated_at: '2026-08-31T00:00:00Z',
    }
    const plan: GoalActivationPlan = {
      actions: [
        {
          description: '',
          due_date: targetDate,
          energy_needed: 'medium',
          estimated_minutes: 10_080,
          execution_tier: 'standard',
          metadata: {
            due_date_flexibility: 'fixed',
            due_date_source: 'user_fixed',
          },
          priority: 'high',
          status: 'todo',
          title: 'Complete overloaded action',
        },
      ],
      assumptions: [],
      confidence: { level: 'high', reasons: [] },
      constraints: [],
      dependencies: [],
      metrics: [],
      milestones: [
        {
          description: '',
          due_date: targetDate,
          status: 'not_started',
          title: 'Capacity milestone',
        },
      ],
      missing_information: [],
      policy: {
        active_tier: 'standard',
        available_days: ['mon'],
        buffer_percent: 20,
        weekly_capacity_minutes: 30,
      },
      review_cadence: { frequency: 'weekly', timezone: 'UTC' },
      risks: [],
      safety_confirmation: true,
      summary: 'This plan cannot fit before its target date.',
      target_date: targetDate,
      template_id: 'goal-planner',
      title: 'Overloaded plan',
    }
    const preview: GoalConversationMessage = {
      message_id: 'capacity-preview',
      thread_id: draft.thread_id,
      role: 'assistant',
      content: 'Plan preview',
      structured: { kind: 'plan_preview', plan },
      created_at: '2026-08-31T00:00:00Z',
      updated_at: '2026-08-31T00:00:00Z',
    }
    let activationRequests = 0
    let scheduleQuestions = 0

    server.use(
      http.get('*/api/goal-conversations', () =>
        HttpResponse.json({ success: true, threads: [draft] }),
      ),
      http.get('*/api/goal-conversations/:threadId', () =>
        HttpResponse.json({ success: true, thread: draft, messages: [preview] }),
      ),
      http.post('*/api/goal-conversations/:threadId/messages', async ({ request }) => {
        const body = (await request.json()) as Pick<
          GoalConversationMessage,
          'role' | 'content' | 'structured'
        >
        if (
          body.structured.kind === 'question_batch' &&
          body.structured.context === 'action_schedule'
        ) {
          scheduleQuestions += 1
        }
        return HttpResponse.json({
          success: true,
          message: {
            ...body,
            message_id: 'capacity-message-' + scheduleQuestions,
            thread_id: draft.thread_id,
            created_at: '2026-08-31T00:00:00Z',
            updated_at: '2026-08-31T00:00:00Z',
          },
        })
      }),
      http.post('*/api/goal-conversations/:threadId/activate', () => {
        activationRequests += 1
        return HttpResponse.json({ success: false }, { status: 500 })
      }),
    )

    render(<GoalConversationPanel onClose={() => undefined} />)
    await user.click(await screen.findByRole('button', { name: 'Capacity draft' }))

    const activate = await screen.findByRole('button', {
      name: /Approve and create Active Tool/,
    })
    expect(activate).toBeEnabled()
    await user.click(activate)

    expect(
      await screen.findByRole('group', {
        name: /当前计划无法在容量和日期约束内完成/,
      }),
    ).toBeInTheDocument()
    expect(activate).toBeDisabled()
    expect(scheduleQuestions).toBe(1)
    expect(activationRequests).toBe(0)
  })
})
