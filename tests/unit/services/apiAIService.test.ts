import { describe, expect, it, vi } from 'vitest'

import {
  ApiAIService,
  chatCompletionsEndpoint,
} from '../../../src/services/ai/apiAIService'

const validBreakdown = {
  goal: 'Prepare for interview',
  steps: [
    {
      title: 'Research the company',
      durationMinutes: 45,
      suggestedDayOffset: 0,
      suggestedHour: 9,
      priority: 'high',
    },
  ],
  totalEstimatedHours: 0.75,
}

function apiResponse(content: unknown): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: typeof content === 'string' ? content : JSON.stringify(content),
          },
        },
      ],
    }),
    { status: 200 },
  )
}

describe('ApiAIService', () => {
  it('normalizes base URLs to chat completion endpoints', () => {
    expect(chatCompletionsEndpoint('https://api.deepseek.com')).toBe(
      'https://api.deepseek.com/chat/completions',
    )
    expect(chatCompletionsEndpoint('https://api.example.com/v1/chat/completions')).toBe(
      'https://api.example.com/v1/chat/completions',
    )
  })

  it('isAvailable returns false when the API key is missing', () => {
    expect(new ApiAIService({ apiKey: '' }).isAvailable()).toBe(false)
  })

  it('breakdownGoal sends an OpenAI-compatible chat completion request', async () => {
    const fetcher = vi.fn(async () => apiResponse(validBreakdown))
    const service = new ApiAIService({
      apiKey: 'test-key',
      baseUrl: 'https://api.deepseek.com',
      fetcher,
      model: 'deepseek-chat',
    })

    await expect(service.breakdownGoal('Prepare for interview')).resolves.toEqual(validBreakdown)

    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>
    const request = JSON.parse(String(calls[0][1].body)) as {
      messages: Array<{ role: string; content: string }>
      model: string
      response_format: { type: string }
    }

    expect(calls[0][0]).toBe('https://api.deepseek.com/chat/completions')
    expect(calls[0][1].headers).toMatchObject({ authorization: 'Bearer test-key' })
    expect(request.model).toBe('deepseek-chat')
    expect(request.response_format).toEqual({ type: 'json_object' })
    expect(request.messages.map((message) => message.role)).toEqual(['system', 'user'])
  })

  it('breakdownGoal throws a helpful error when the API key is missing', async () => {
    const fetcher = vi.fn()
    const service = new ApiAIService({ apiKey: '', fetcher })

    await expect(service.breakdownGoal('Prepare for interview')).rejects.toThrow('VITE_AI_API_KEY')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('breakdownGoal throws when the model returns invalid JSON', async () => {
    const service = new ApiAIService({
      apiKey: 'test-key',
      fetcher: vi.fn(async () => apiResponse('{not-json')),
    })

    await expect(service.breakdownGoal('Prepare for interview')).rejects.toThrow(
      'AI API returned invalid JSON',
    )
  })

  it('breakdownGoal throws when the JSON fails schema validation', async () => {
    const service = new ApiAIService({
      apiKey: 'test-key',
      fetcher: vi.fn(async () => apiResponse({ goal: 'Missing steps' })),
    })

    await expect(service.breakdownGoal('Prepare for interview')).rejects.toThrow(
      'AI API response failed schema validation: steps: Required',
    )
  })

  it('breakdownGoal normalizes common scalar values returned by API models', async () => {
    const service = new ApiAIService({
      apiKey: 'test-key',
      fetcher: vi.fn(async () =>
        apiResponse({
          goal: 'Prepare for interview',
          steps: [
            {
              title: 'Research the company',
              description: null,
              durationMinutes: '45',
              suggestedDayOffset: '0',
              suggestedHour: '9',
              priority: 'High',
            },
          ],
          totalEstimatedHours: '0.75',
        }),
      ),
    })

    await expect(service.breakdownGoal('Prepare for interview')).resolves.toEqual(validBreakdown)
  })

  it('planCalendarActions normalizes offsetless datetime strings', async () => {
    const service = new ApiAIService({
      apiKey: 'test-key',
      fetcher: vi.fn(async () =>
        apiResponse({
          summary: 'Create dinner',
          actions: [
            {
              type: 'create_event',
              title: 'Dinner',
              startAt: '2026-06-18T19:00:00',
              endAt: '2026-06-18T20:00:00',
              allDay: 'false',
            },
          ],
          warnings: '',
        }),
      ),
    })

    const result = await service.planCalendarActions('add dinner', {
      today: '2026-06-18',
      timezone: 'America/Los_Angeles',
      events: [],
      todos: [],
      eventTypes: [],
    })

    expect(result.actions[0]).toMatchObject({
      allDay: false,
      startAt: expect.stringMatching(/Z$/),
      endAt: expect.stringMatching(/Z$/),
      title: 'Dinner',
      type: 'create_event',
    })
  })

  it('planCalendarActions sends authoritative local time context to the API model', async () => {
    const fetcher = vi.fn(async () =>
      apiResponse({
        summary: 'Create dinner',
        actions: [
          {
            type: 'create_event',
            title: 'Dinner',
            startAt: '2026-06-18T19:00:00',
            endAt: '2026-06-18T20:00:00',
            allDay: false,
          },
        ],
        warnings: [],
      }),
    )
    const service = new ApiAIService({
      apiKey: 'test-key',
      fetcher,
    })

    await service.planCalendarActions('add dinner tonight', {
      currentDate: '2026-06-18',
      currentDateTime: '2026-06-18T20:00:00.000Z',
      currentLocalDateTime: '2026-06-18T13:00:00-07:00',
      events: [],
      eventTypes: [],
      focusedDate: '2026-05-25',
      locale: 'en-US',
      localDateTimeLabel: 'Jun 18, 2026, 1:00:00 PM PDT',
      timezone: 'America/Los_Angeles',
      timezoneName: 'Pacific Daylight Time',
      timezoneOffsetLabel: 'UTC-07:00',
      timezoneOffsetMinutes: -420,
      today: '2026-06-18',
      todos: [],
    })

    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>
    const request = JSON.parse(String(calls[0][1].body)) as {
      messages: Array<{ role: string; content: string }>
    }
    const userMessage = request.messages.find((message) => message.role === 'user')?.content ?? ''

    expect(userMessage).toContain('Authoritative local time context')
    expect(userMessage).toContain('"currentLocalDateTime": "2026-06-18T13:00:00-07:00"')
    expect(userMessage).toContain('"timezone": "America/Los_Angeles"')
    expect(userMessage).toContain('"timezoneName": "Pacific Daylight Time"')
    expect(userMessage).toContain('"timezoneOffsetLabel": "UTC-07:00"')
    expect(userMessage).toContain('"focusedDate": "2026-05-25"')
  })

  it('continueConversation sends time and todo-step context and accepts an action plan', async () => {
    const fetcher = vi.fn(async () =>
      apiResponse({
        reply: 'Created a draft calendar plan.',
        actionPlan: {
          summary: 'Schedule launch prep.',
          actions: [
            {
              type: 'create_event',
              title: 'Draft launch checklist',
              startAt: '2026-06-19T09:00:00',
              endAt: '2026-06-19T09:45:00',
              allDay: false,
            },
          ],
          warnings: '',
        },
      }),
    )
    const service = new ApiAIService({
      apiKey: 'test-key',
      fetcher,
    })

    await expect(
      service.continueConversation(
        [{ role: 'user', content: 'Rewrite these selected steps' }],
        {
          currentDate: '2026-06-18',
          currentDateTime: '2026-06-18T20:00:00.000Z',
          currentLocalDateTime: '2026-06-18T13:00:00-07:00',
          events: [],
          eventTypes: [],
          focusedDate: '2026-05-25',
          timezone: 'America/Los_Angeles',
          today: '2026-06-18',
          todos: [],
        },
        {
          kind: 'todo-step-refinement',
          todoId: 'todo-1',
          todoTitle: 'Launch prep',
          selectedItems: [
            {
              completed: false,
              itemIndex: 0,
              itemLabel: 'Step',
              value: 'Draft launch checklist',
            },
          ],
        },
      ),
    ).resolves.toMatchObject({
      reply: 'Created a draft calendar plan.',
      actionPlan: {
        summary: 'Schedule launch prep.',
        actions: [
          {
            title: 'Draft launch checklist',
            type: 'create_event',
          },
        ],
        warnings: [],
      },
    })

    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>
    const request = JSON.parse(String(calls[0][1].body)) as {
      messages: Array<{ role: string; content: string }>
      response_format?: { type: string }
    }
    const contextMessage = request.messages[1].content

    expect(request.response_format).toEqual({ type: 'json_object' })
    expect(request.messages.map((message) => message.role)).toEqual(['system', 'user'])
    expect(contextMessage).toContain('Authoritative local time context')
    expect(contextMessage).toContain('"timezone": "America/Los_Angeles"')
    expect(contextMessage).toContain('Conversation task context')
    expect(contextMessage).toContain('Draft launch checklist')
    expect(contextMessage).toContain('Conversation messages')
  })

  it('breakdownGoal extracts JSON when the model wraps the object in text', async () => {
    const service = new ApiAIService({
      apiKey: 'test-key',
      fetcher: vi.fn(async () => apiResponse(`Here is the JSON:\n${JSON.stringify(validBreakdown)}`)),
    })

    await expect(service.breakdownGoal('Prepare for interview')).resolves.toEqual(validBreakdown)
  })
})
