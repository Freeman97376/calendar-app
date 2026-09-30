import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import { AICalendarActionPlanSchema } from '../../../../src/domain/schemas/ai.schema'
import { goalControlClient } from '../../../../src/services/goalControlClient'
import {
  dismissAIActionPlan,
  persistAIConversationMessages,
  restoreLatestAIConversation,
  retryAIConversationSave,
  useAIStore,
} from '../../../../src/store/aiStore'

const plan = AICalendarActionPlanSchema.parse({
  summary: 'Synthetic plan',
  actions: [{ type: 'create_todo', title: 'One task' }],
})
const review = {
  version: 1,
  dismissed: false,
  operations: { apply: { status: 'pending' }, copy_to_todos: { status: 'pending' } },
}
const message = {
  id: 'stable-message',
  role: 'assistant' as const,
  content: 'One task',
  timestamp: '2026-09-20T00:00:00Z',
}

describe('durable AI plan review', () => {
  beforeEach(() => useAIStore.getState().reset())
  afterEach(() => vi.restoreAllMocks())

  function mockHistory(structured: Record<string, unknown>) {
    vi.spyOn(goalControlClient, 'listAIConversations').mockResolvedValue([
      { thread_id: 'chat', title: 'Synthetic' },
    ] as never)
    vi.spyOn(goalControlClient, 'getAIConversation').mockResolvedValue({
      messages: [
        {
          role: 'assistant',
          message_id: 'stable-message',
          content: 'One task',
          created_at: message.timestamp,
          structured,
        },
      ],
    } as never)
  }

  it('restores legacy plans as read-only and never pending', async () => {
    mockHistory({ actionPlan: plan })
    await restoreLatestAIConversation()
    expect(useAIStore.getState().pendingActionPlan).toBeNull()
    expect(useAIStore.getState().actionPlanRecord).toMatchObject({ plan, review: null })
  })

  it('restores applied plans with the independent task-copy operation still available', async () => {
    mockHistory({
      actionPlan: plan,
      actionPlanReview: {
        ...review,
        operations: { ...review.operations, apply: { status: 'applied', batchId: 'batch' } },
      },
    })
    await restoreLatestAIConversation()
    expect(useAIStore.getState().pendingActionPlan).toBeNull()
    expect(useAIStore.getState().actionPlanRecord?.review?.operations.copy_to_todos.status).toBe(
      'pending',
    )
  })

  it('retries failed saves with the same message identity and opens review only after saving', async () => {
    vi.spyOn(goalControlClient, 'createAIConversation').mockResolvedValue({
      thread_id: 'chat',
    } as never)
    const save = vi
      .spyOn(goalControlClient, 'addAIConversationMessage')
      .mockRejectedValueOnce(new Error('Response lost'))
      .mockResolvedValue({
        message_id: message.id,
        structured: { actionPlan: plan, actionPlanReview: review },
      } as never)
    useAIStore.setState({ pendingActionPlan: plan, messages: [message] })
    await persistAIConversationMessages([message], 'Synthetic', { actionPlan: plan })
    expect(useAIStore.getState().conversationSaveFailed).toBe(true)
    expect(useAIStore.getState().actionPlanRecord).toBeNull()
    await retryAIConversationSave()
    expect(save.mock.calls.map((call) => call[1].message_id)).toEqual([message.id, message.id])
    expect(useAIStore.getState().actionPlanRecord?.review?.version).toBe(1)
    expect(useAIStore.getState().conversationSaveFailed).toBe(false)
  })

  it('does not restore the previous user history after a session reset', async () => {
    mockHistory({ actionPlan: plan, actionPlanReview: review })
    let complete!: (value: never) => void
    vi.mocked(goalControlClient.getAIConversation).mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    const pending = restoreLatestAIConversation()
    await vi.waitFor(() => expect(complete).toBeDefined())
    useAIStore.getState().reset()
    complete({
      messages: [
        {
          ...message,
          message_id: message.id,
          structured: { actionPlan: plan, actionPlanReview: review },
        },
      ],
    } as never)
    await pending
    expect(useAIStore.getState().messages).toEqual([])
    expect(useAIStore.getState().actionPlanRecord).toBeNull()
  })

  it('stops an old user save before writing messages after a session change', async () => {
    let finish!: (value: never) => void
    vi.spyOn(goalControlClient, 'createAIConversation').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const save = vi.spyOn(goalControlClient, 'addAIConversationMessage')
    useAIStore.setState({ pendingActionPlan: plan, messages: [message] })
    const pending = persistAIConversationMessages([message], 'Synthetic', { actionPlan: plan })
    await vi.waitFor(() => expect(finish).toBeDefined())
    useAIStore.getState().reset()
    finish({ thread_id: 'old-user-chat' } as never)
    await pending
    expect(save).not.toHaveBeenCalled()
    expect(useAIStore.getState()).toMatchObject({
      actionPlanRecord: null,
      messages: [],
      isSavingConversation: false,
    })
  })

  it('persists dismissal and clears only the matching current plan', async () => {
    mockHistory({ actionPlan: plan, actionPlanReview: review })
    await restoreLatestAIConversation()
    const dismiss = vi.spyOn(goalControlClient, 'dismissAIActionPlan').mockResolvedValue({
      structured: { actionPlan: plan, actionPlanReview: { ...review, dismissed: true } },
    } as never)
    await dismissAIActionPlan()
    expect(dismiss).toHaveBeenCalledWith('chat', 'stable-message')
    expect(useAIStore.getState().pendingActionPlan).toBeNull()
    expect(useAIStore.getState().actionPlanRecord?.review?.dismissed).toBe(true)
  })
})
