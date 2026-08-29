import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import GoalConversationPanel from '../../../src/components/ai/GoalConversationPanel'
import type {
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
})
