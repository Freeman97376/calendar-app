import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { AIBreakdownResult } from '../../../../src/domain/types'
import type { IAIService } from '../../../../src/services/ai/IAIService'
import { configureAIService, useAIStore } from '../../../../src/store/aiStore'

const suggestion: AIBreakdownResult = {
  goal: 'Old goal',
  steps: [
    {
      description: 'This result must not enter a newer conversation.',
      durationMinutes: 30,
      energyNeeded: 'medium',
      priority: 'medium',
      suggestedDayOffset: 0,
      suggestedHour: 9,
      title: 'Old result',
    },
  ],
  totalEstimatedHours: 0.5,
}

function deferredSuggestion() {
  let resolve!: (value: AIBreakdownResult) => void
  const promise = new Promise<AIBreakdownResult>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('aiStore request ordering', () => {
  let pending: ReturnType<typeof deferredSuggestion>

  beforeEach(() => {
    pending = deferredSuggestion()
    configureAIService({
      breakdownGoal: () => pending.promise,
      isAvailable: () => true,
    } as unknown as IAIService)
    useAIStore.getState().reset()
  })

  afterEach(() => {
    configureAIService(null)
    useAIStore.getState().reset()
  })

  it('does not append an old goal result to a newer todo-step conversation', async () => {
    const oldRequest = useAIStore.getState().sendGoal('Old goal')

    useAIStore.getState().startTodoStepConversation({
      kind: 'todo-step-refinement',
      selectedItems: [
        {
          completed: false,
          itemIndex: 0,
          itemLabel: 'Step',
          value: 'Keep this new conversation isolated',
        },
      ],
      todoId: 'todo-new',
      todoTitle: 'New task',
    })
    pending.resolve(suggestion)
    await oldRequest

    const state = useAIStore.getState()
    expect(state.conversationContext).toMatchObject({
      kind: 'todo-step-refinement',
      todoId: 'todo-new',
    })
    expect(state.messages).toHaveLength(2)
    expect(state.messages.map((message) => message.content).join('\n')).not.toContain(
      'Created 1 schedulable steps.',
    )
    expect(state.pendingSuggestion).toBeNull()
    expect(state.isLoading).toBe(false)
  })

  it('keeps history cleared when an invalidated goal request resolves', async () => {
    const oldRequest = useAIStore.getState().sendGoal('Old goal')
    useAIStore.getState().clearHistory()

    pending.resolve(suggestion)
    await oldRequest

    expect(useAIStore.getState()).toMatchObject({
      isLoading: false,
      messages: [],
      pendingSuggestion: null,
    })
  })
})
