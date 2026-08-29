import { describe, expect, it, vi } from 'vitest'

import type {
  AIBreakdownResult,
  AICalendarActionPlan,
  AICalendarContext,
  AIConversationResult,
  AIEnabledToolRouteRequest,
  AIEnabledToolRouteResult,
  AIProgressToolRequest,
  AIProgressToolResult,
  AIToolActivationRequest,
  AIToolActivationResult,
  ToolSessionRequest,
  ToolSessionResult,
} from '../../../../src/domain/types'
import type { AIConversationMessage, IAIService } from '../../../../src/services/ai/IAIService'
import { createAIService, modelForProvider } from '../../../../src/services/ai/aiServiceFactory'

const validBreakdown = {
  goal: 'Prepare for interview',
  steps: [
    {
      title: 'Research the company',
      durationMinutes: 45,
      energyNeeded: 'medium',
      suggestedDayOffset: 0,
      suggestedHour: 9,
      priority: 'high',
    },
  ],
  totalEstimatedHours: 0.75,
} satisfies AIBreakdownResult

function apiResponse(): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(validBreakdown) } }],
    }),
    { status: 200 },
  )
}

class MockLocalService implements IAIService {
  isAvailable(): boolean {
    return true
  }

  async breakdownGoal(): Promise<AIBreakdownResult> {
    return validBreakdown
  }

  async planCalendarActions(
    _command: string,
    _context: AICalendarContext,
  ): Promise<AICalendarActionPlan> {
    return {
      summary: 'Local action',
      actions: [
        {
          type: 'create_event',
          title: 'Local event',
          startAt: '2026-05-25T16:00:00.000Z',
          endAt: '2026-05-25T17:00:00.000Z',
          allDay: false,
        },
      ],
      warnings: [],
    }
  }

  async runToolSession(_request: ToolSessionRequest): Promise<ToolSessionResult> {
    return {
      summary: 'Local tool session',
      events: [
        {
          title: 'Generated event',
          startAt: '2026-05-25T16:00:00.000Z',
          endAt: '2026-05-25T17:00:00.000Z',
          allDay: false,
        },
      ],
      warnings: [],
    }
  }

  async runProgressTool(_request: AIProgressToolRequest): Promise<AIProgressToolResult> {
    return {
      actions: [],
      calendarEvents: [],
      confirmedRequirements: [],
      currentRecommendation: 'Use the local demo route.',
      milestones: [],
      needsUserConfirmation: false,
      summary: 'Local progress tool',
      warnings: [],
    }
  }

  async runToolActivation(_request: AIToolActivationRequest): Promise<AIToolActivationResult> {
    return {
      activationForm: {},
      activationSummary: 'Local activation',
      assistantReply: 'Local activation reply',
      needsMoreInfo: false,
      routeTags: [],
      suggestedInstanceAlias: 'Local tool',
      warnings: [],
    }
  }

  async routeEnabledTool(_request: AIEnabledToolRouteRequest): Promise<AIEnabledToolRouteResult> {
    return {
      confidence: 0,
      matchedProjectId: null,
      needsConfirmation: true,
      reason: 'No route',
      rewrittenInstruction: 'No route',
    }
  }

  async continueConversation(messages: AIConversationMessage[]): Promise<AIConversationResult> {
    return { reply: `Local reply: ${messages[messages.length - 1]?.content ?? ''}` }
  }
}

describe('aiServiceFactory', () => {
  it('defaults modelForProvider to API and local model values', () => {
    expect(modelForProvider('api', {})).toBe('deepseek-chat')
    expect(modelForProvider('local', {})).toBe('local')
  })

  it('selects the OpenAI-compatible API service when configured as api', async () => {
    const fetcher = vi.fn(async () => apiResponse())
    const service = createAIService(
      {
        aiApiBaseUrl: 'https://api.deepseek.com',
        aiApiKey: 'test-key',
        aiApiModel: 'deepseek-chat-test',
        aiProvider: 'api',
      },
      { fetcher },
    )

    await service.breakdownGoal('Prepare for interview')

    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>
    const request = JSON.parse(String(calls[0][1].body)) as { model: string }
    expect(calls[0][0]).toBe('https://api.deepseek.com/chat/completions')
    expect(request.model).toBe('deepseek-chat-test')
  })

  it('selects the local service without calling fetch when configured as local', async () => {
    const fetcher = vi.fn(async () => apiResponse())
    const service = createAIService(
      { aiProvider: 'local' },
      { fetcher, localService: new MockLocalService() },
    )

    await expect(service.breakdownGoal('Prepare for interview')).resolves.toEqual(validBreakdown)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('uses legacy DeepSeek key and model values as API fallbacks', async () => {
    const fetcher = vi.fn(async () => apiResponse())
    const service = createAIService(
      {
        aiProvider: 'api',
        deepseekApiKey: 'legacy-key',
        deepseekModel: 'legacy-model',
      },
      { fetcher },
    )

    await service.breakdownGoal('Prepare for interview')

    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>
    const request = JSON.parse(String(calls[0][1].body)) as { model: string }
    expect(calls[0][1].headers).toMatchObject({ authorization: 'Bearer legacy-key' })
    expect(request.model).toBe('legacy-model')
  })
})
