import { describe, expect, it, vi } from 'vitest'

import { ApiAIService, chatCompletionsEndpoint } from '../../../src/services/ai/apiAIService'

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

    await expect(service.breakdownGoal('Prepare for interview')).rejects.toThrow(
      'AI service is not configured',
    )
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

  it('planCalendarActions normalizes todo eta, energy, and schedule times', async () => {
    const service = new ApiAIService({
      apiKey: 'test-key',
      fetcher: vi.fn(async () =>
        apiResponse({
          summary: 'Plan task work',
          actions: [
            {
              type: 'create_todo',
              title: 'Draft launch plan',
              etaMinutes: '45',
              energyNeeded: 'High',
              priority: 'Medium',
            },
            {
              type: 'schedule_todo',
              todoId: 'todo-1',
              startAt: '2026-06-18T09:00:00',
              endAt: '2026-06-18T09:45:00',
            },
          ],
        }),
      ),
    })

    const result = await service.planCalendarActions('plan launch work', {
      today: '2026-06-18',
      timezone: 'America/Los_Angeles',
      events: [],
      todos: [],
      eventTypes: [],
    })

    expect(result.actions[0]).toMatchObject({
      energyNeeded: 'high',
      etaMinutes: 45,
      priority: 'medium',
      type: 'create_todo',
    })
    expect(result.actions[1]).toMatchObject({
      endAt: expect.stringMatching(/Z$/),
      startAt: expect.stringMatching(/Z$/),
      type: 'schedule_todo',
    })
  })

  it('runProgressTool drops invalid dueDate values returned by API models', async () => {
    const service = new ApiAIService({
      apiKey: 'test-key',
      fetcher: vi.fn(async () =>
        apiResponse({
          summary: 'Adjusted fitness plan.',
          assistantReply: 'Confirmed the lower-impact request.',
          confirmedRequirements: 'Goal: Build consistent strength',
          needsUserConfirmation: 'false',
          currentRecommendation: 'Do the next short workout when the calendar is open.',
          milestones: [
            {
              title: 'Foundation block',
              dueDate: 'Week 1',
              status: 'in_progress',
            },
            {
              title: 'First review',
              dueDate: '2026-06-30',
              status: 'not_started',
            },
          ],
          actions: [
            {
              title: 'Workout A',
              dueDate: 'Day 1',
              energyNeeded: 'High',
              estimatedMinutes: '45',
              priority: 'High',
              status: 'scheduled',
              milestoneTitle: 'Foundation block',
            },
            {
              title: 'Workout B',
              dueDate: '2026-06-29',
              energyNeeded: 'Low',
              estimatedMinutes: '30',
              priority: 'Medium',
              status: 'todo',
            },
          ],
          progressLog: {
            summary: 'Generated adjusted plan.',
            logType: 'tool_result',
          },
          calendarEvents: [],
          warnings: '',
        }),
      ),
    })

    const result = await service.runProgressTool({
      actions: [],
      calendarEvents: [],
      formInput: {
        frequency: '3 days per week',
        goal: 'Build consistent strength',
      },
      memorySearchResults: [],
      milestones: [],
      progress: [],
      project: null,
      sourceToolId: 'fitness-ai',
      today: '2026-06-18',
      toolKind: 'fitness',
      toolRuns: [],
    })

    expect(result.assistantReply).toBe('Confirmed the lower-impact request.')
    expect(result.confirmedRequirements).toEqual(['Goal: Build consistent strength'])
    expect(result.needsUserConfirmation).toBe(false)
    expect(result.actions[0]).toMatchObject({
      energyNeeded: 'high',
      estimatedMinutes: 45,
      milestoneTitle: 'Foundation block',
      priority: 'high',
      status: 'scheduled',
      title: 'Workout A',
    })
    expect(result.actions[0]).not.toHaveProperty('dueDate')
    expect(result.actions[1]).toMatchObject({
      dueDate: '2026-06-29',
      energyNeeded: 'low',
      estimatedMinutes: 30,
      priority: 'medium',
      title: 'Workout B',
    })
    expect(result.milestones[0]).not.toHaveProperty('dueDate')
    expect(result.milestones[1]).toMatchObject({
      dueDate: '2026-06-30',
      title: 'First review',
    })
  })

  it('runToolActivation fills empty required strings from the template request context', async () => {
    const service = new ApiAIService({
      apiKey: 'test-key',
      fetcher: vi.fn(async () =>
        apiResponse({
          activationForm: {
            goal: '  ',
            requirement: 'Track groceries',
          },
          activationSummary: '',
          assistantReply: '',
          needsMoreInfo: '',
          routeTags: '',
          suggestedInstanceAlias: '',
          warnings: '',
        }),
      ),
    })

    const result = await service.runToolActivation({
      activationFields: [],
      activationFormDraft: {},
      capabilityTags: ['inventory'],
      existingInstanceAliases: [],
      messages: [
        {
          content: 'Manage groceries.',
          role: 'user',
        },
      ],
      routeTags: ['fridge', 'grocery'],
      sourceToolId: 'fridge',
      templateDescription: 'Receipt and fridge planning helper.',
      templateId: 'fridge',
      templateLabel: 'Fridge',
      toolName: 'Fridge',
    })

    expect(result.activationSummary).toBe('Prepared Fridge active tool for: Manage groceries.')
    expect(result.assistantReply).toContain('register')
    expect(result.activationForm).toEqual({ requirement: 'Track groceries' })
    expect(result.routeTags).toEqual(['fridge', 'grocery', 'inventory', 'groceries'])
    expect(result.suggestedInstanceAlias).toBe('groceries')
  })

  it.each([undefined, null, '  '])(
    'routeEnabledTool falls back to the original message when rewrittenInstruction is %p',
    async (rewrittenInstruction) => {
      const service = new ApiAIService({
        apiKey: 'test-key',
        fetcher: vi.fn(async () =>
          apiResponse({
            confidence: 0,
            matchedProjectId: null,
            needsConfirmation: true,
            reason: 'No active tool matched the message.',
            rewrittenInstruction,
          }),
        ),
      })

      const result = await service.routeEnabledTool({
        enabledTools: [],
        today: '2026-07-29',
        userMessage: 'Plan tomorrow afternoon.',
      })

      expect(result.rewrittenInstruction).toBe('Plan tomorrow afternoon.')
    },
  )

  it('routeEnabledTool preserves a valid rewritten instruction', async () => {
    const service = new ApiAIService({
      apiKey: 'test-key',
      fetcher: vi.fn(async () =>
        apiResponse({
          confidence: 0.9,
          matchedProjectId: 'project-1',
          needsConfirmation: true,
          reason: 'Matched the planning tool.',
          rewrittenInstruction: 'Prepare a focused plan for tomorrow afternoon.',
        }),
      ),
    })

    const result = await service.routeEnabledTool({
      enabledTools: [],
      today: '2026-07-29',
      userMessage: 'Plan tomorrow afternoon.',
    })

    expect(result.rewrittenInstruction).toBe('Prepare a focused plan for tomorrow afternoon.')
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
      fetcher: vi.fn(async () =>
        apiResponse(`Here is the JSON:\n${JSON.stringify(validBreakdown)}`),
      ),
    })

    await expect(service.breakdownGoal('Prepare for interview')).resolves.toEqual(validBreakdown)
  })
})
