import { describe, expect, it } from 'vitest'

import { planTodoSchedule } from '../../../../src/domain/logic/taskPlanner'
import { AIProgressToolResultSchema } from '../../../../src/domain/schemas/ai.schema'
import { TodoSchema } from '../../../../src/domain/schemas/todo.schema'
import type { AICalendarContext, AIProgressToolRequest, Todo } from '../../../../src/domain/types'
import { LocalAIService } from '../../../../src/services/ai/localAIService'

function localDateTime(value: string): string {
  return new Date(value).toISOString()
}

function demoTodo(overrides: Partial<Todo> & Pick<Todo, 'id' | 'title'>): Todo {
  return TodoSchema.parse({
    createdAt: '2026-06-18T08:00:00.000Z',
    energyNeeded: 'medium',
    etaMinutes: 30,
    eventTypeId: 'project',
    priority: 'medium',
    status: 'todo',
    updatedAt: '2026-06-18T08:00:00.000Z',
    ...overrides,
  })
}

const context: AICalendarContext = {
  currentDate: '2026-06-18',
  currentDateTime: '2026-06-18T20:00:00.000Z',
  currentLocalDateTime: '2026-06-18T13:00:00-07:00',
  events: [],
  eventTypes: [],
  focusedDate: '2026-05-25',
  locale: 'en-US',
  localDateTimeLabel: 'Jun 18, 2026, 1:00:00 PM PDT',
  timezone: 'America/Los_Angeles',
  timezoneOffsetLabel: 'UTC-07:00',
  timezoneOffsetMinutes: -420,
  today: '2026-06-18',
  todos: [],
}

describe('LocalAIService', () => {
  it('uses currentDateTime for near-term relative event times', async () => {
    const service = new LocalAIService()

    const result = await service.planCalendarActions('add study session in 2 hours', context)

    expect(result.actions[0]).toMatchObject({
      endAt: '2026-06-18T23:00:00.000Z',
      startAt: '2026-06-18T22:00:00.000Z',
      title: 'study session',
      type: 'create_event',
    })
  })

  it('does not treat relative start time as event duration', async () => {
    const service = new LocalAIService()

    const result = await service.planCalendarActions('add planning block in 30 minutes', context)

    expect(result.actions[0]).toMatchObject({
      endAt: '2026-06-18T21:30:00.000Z',
      startAt: '2026-06-18T20:30:00.000Z',
      type: 'create_event',
    })
  })

  it('uses the target date timezone offset when a plan crosses daylight saving time', async () => {
    const service = new LocalAIService()

    const result = await service.planCalendarActions('add study event 2026-03-09 at 9 am', {
      ...context,
      currentDate: '2026-03-07',
      currentDateTime: '2026-03-07T17:00:00.000Z',
      currentLocalDateTime: '2026-03-07T09:00:00-08:00',
      focusedDate: '2026-03-07',
      timezoneOffsetLabel: 'UTC-08:00',
      timezoneOffsetMinutes: -480,
      today: '2026-03-07',
    })

    expect(result.actions[0]).toMatchObject({
      endAt: '2026-03-09T17:00:00.000Z',
      startAt: '2026-03-09T16:00:00.000Z',
      type: 'create_event',
    })
  })

  it('rejects a local time that does not exist during the spring DST jump', async () => {
    const service = new LocalAIService()

    await expect(
      service.planCalendarActions('add study event 2026-03-08 at 2:30 am', {
        ...context,
        currentDate: '2026-03-07',
        currentDateTime: '2026-03-07T17:00:00.000Z',
        currentLocalDateTime: '2026-03-07T09:00:00-08:00',
        focusedDate: '2026-03-07',
        timezoneOffsetLabel: 'UTC-08:00',
        timezoneOffsetMinutes: -480,
        today: '2026-03-07',
      }),
    ).rejects.toThrow('does not exist in America/Los_Angeles')
  })

  it('does not default unspecific dinner requests to 7pm after local 7pm', async () => {
    const service = new LocalAIService()

    const result = await service.planCalendarActions('add dinner', {
      ...context,
      currentDateTime: '2026-06-19T02:05:00.000Z',
      currentLocalDateTime: '2026-06-18T19:05:00-07:00',
    })

    expect(result.actions[0]).toMatchObject({
      endAt: '2026-06-19T03:30:00.000Z',
      startAt: '2026-06-19T02:30:00.000Z',
      title: 'dinner',
      type: 'create_event',
    })
  })

  it('generates deterministic fitness progress plans and avoids supplied conflicts', async () => {
    const service = new LocalAIService()
    const request: AIProgressToolRequest = {
      actions: [],
      calendarEvents: [
        {
          allDay: false,
          endAt: '2026-06-18T15:00:00.000Z',
          id: 'event-1',
          startAt: '2026-06-18T14:00:00.000Z',
          title: 'Existing meeting',
        },
      ],
      formInput: {
        goal: 'Build strength',
        preferredTime: '07:00',
        sessionLength: '45',
      },
      memorySearchResults: [],
      milestones: [],
      progress: [],
      sourceToolId: 'fitness-ai',
      timezoneOffsetMinutes: -420,
      today: '2026-06-18',
      toolKind: 'fitness',
      toolRuns: [],
      userInstruction:
        'Latest user message:\nMake the first week lower impact.\n\nTask: confirm requirements through the conversation.',
    }

    const result = await service.runProgressTool(request)

    expect(result.assistantReply).toContain('Make the first week lower impact')
    expect(result.confirmedRequirements).toContain('Goal: Build strength')
    expect(result.summary).toContain('Build strength')
    expect(result.milestones.length).toBeGreaterThan(0)
    expect(result.actions.length).toBeGreaterThan(0)
    expect(result.calendarEvents[0].startAt).toBe('2026-06-18T15:00:00.000Z')
    expect(result.warnings.join(' ')).toContain('Adjusted')
  })

  it('generates multiple fitness sessions for next-week conversation requests', async () => {
    const service = new LocalAIService()

    const result = await service.runProgressTool({
      actions: [],
      calendarEvents: [],
      formInput: {
        goal: 'Build strength',
        frequency: '3 times per week',
        preferredTime: '07:00',
        sessionLength: '45',
      },
      memorySearchResults: [],
      milestones: [],
      progress: [],
      sourceToolId: 'fitness-ai',
      timezoneOffsetMinutes: -420,
      today: '2026-06-18',
      toolKind: 'fitness',
      toolRuns: [],
      userInstruction:
        'Latest user message:\nGenerate next week full plan with 5 sessions.\n\nTask: confirm requirements through the conversation.',
    })

    expect(result.calendarEvents).toHaveLength(5)
    expect(result.calendarEvents[0].startAt).toBe('2026-06-22T14:00:00.000Z')
    expect(result.actions.filter((action) => action.status === 'scheduled')).toHaveLength(5)
    expect(result.confirmedRequirements).toContain('Calendar sessions: 5')
  })

  it('runs the hackathon fitness demo with schema-valid plan data and mixed task sorting', async () => {
    const service = new LocalAIService()

    const result = await service.runProgressTool({
      actions: [],
      calendarEvents: [],
      formInput: {
        constraints: 'Low impact because of knee discomfort',
        equipment: 'Dumbbells and treadmill',
        frequency: '4 times per week',
        goal: 'Lose fat and build strength',
        heightCm: '178',
        level: 'intermediate',
        preferences: 'Morning sessions, low impact, no jumping',
        preferredTime: '06:30',
        sessionLength: '50',
        weightKg: '76',
      },
      memorySearchResults: [],
      milestones: [],
      progress: [],
      sourceToolId: 'fitness-ai',
      timezoneOffsetMinutes: -420,
      today: '2026-06-18',
      toolKind: 'fitness',
      toolRuns: [],
      userInstruction:
        'Latest user message:\nGenerate next week full workout plan with 4 sessions.\n\nTask: confirm requirements through the conversation.',
    })

    expect(AIProgressToolResultSchema.parse(result)).toEqual(result)
    expect(result.confirmedRequirements).toEqual(
      expect.arrayContaining([
        'Body metrics: Height: 178 cm, Weight: 76 kg',
        'Preferences: Morning sessions, low impact, no jumping',
      ]),
    )
    expect(result.milestones.map((milestone) => milestone.title)).toEqual([
      'Baseline and habit setup',
      'Progressive training rhythm',
      'Review and adjust plan',
    ])
    expect(result.calendarEvents).toHaveLength(4)
    expect(result.calendarEvents[0]).toMatchObject({
      allDay: false,
      startAt: '2026-06-22T13:30:00.000Z',
      title: 'Lose fat and build strength baseline workout',
    })
    expect(result.calendarEvents[0].displayDetails).toContain('Height: 178 cm')
    expect(result.calendarEvents[0].displayDetails).toContain('no jumping')
    expect(result.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          energyNeeded: 'medium',
          estimatedMinutes: 50,
          priority: 'high',
          status: 'scheduled',
          title: 'Complete baseline workout',
        }),
        expect.objectContaining({
          energyNeeded: 'low',
          estimatedMinutes: 15,
          priority: 'medium',
          title: 'Log recovery and effort',
        }),
      ]),
    )

    const generatedFitnessTodos = result.actions.map((action, index) =>
      demoTodo({
        dueDate: action.dueDate,
        energyNeeded: action.energyNeeded,
        etaMinutes: action.estimatedMinutes,
        id: `fitness-${index}`,
        priority: action.priority,
        status: action.status === 'done' ? 'done' : 'todo',
        title: action.title,
      }),
    )
    const mixedTodos = [
      demoTodo({
        dueDate: '2026-06-20',
        energyNeeded: 'high',
        etaMinutes: 20,
        id: 'hackathon-pitch',
        priority: 'high',
        title: 'Hackathon pitch dry run',
      }),
      demoTodo({
        dueDate: '2026-06-21',
        energyNeeded: 'high',
        etaMinutes: 45,
        id: 'demo-copy',
        priority: 'medium',
        title: 'Prepare demo copy',
      }),
      demoTodo({
        dueDate: '2026-06-22',
        energyNeeded: 'high',
        etaMinutes: 25,
        id: 'sponsor-outreach',
        priority: 'medium',
        title: 'Sponsor outreach follow-up',
      }),
      demoTodo({
        dueDate: '2026-06-20',
        energyNeeded: 'low',
        etaMinutes: 15,
        id: 'admin-email',
        priority: 'low',
        title: 'Send admin email',
      }),
      ...generatedFitnessTodos,
    ]

    const plan = planTodoSchedule(mixedTodos, [], {
      dayEndTime: '18:00',
      dayStartTime: '09:00',
      rangeEnd: localDateTime('2026-06-27T18:00:00'),
      rangeStart: localDateTime('2026-06-20T09:00:00'),
    })

    expect(plan.warnings).toEqual([])
    expect(plan.actions.map((action) => action.todoId)).toEqual([
      'hackathon-pitch',
      'fitness-0',
      'demo-copy',
      'sponsor-outreach',
      'fitness-4',
      'fitness-1',
      'fitness-2',
      'fitness-3',
      'admin-email',
    ])
    expect(plan.actions.find((action) => action.todoId === 'fitness-0')?.reason).toContain(
      '50 minute ETA',
    )
  })

  it('generates deterministic AI agent learning routes', async () => {
    const service = new LocalAIService()

    const result = await service.runProgressTool({
      actions: [],
      calendarEvents: [],
      formInput: {
        goal: 'Learn AI agent skills',
        outcome: 'ship a demo',
      },
      memorySearchResults: [],
      milestones: [],
      progress: [],
      sourceToolId: 'agent-learning',
      today: '2026-06-18',
      toolKind: 'agent-learning',
      toolRuns: [],
    })

    expect(result.summary).toContain('ship a demo')
    expect(result.assistantReply).toContain('Confirmed AI agent learning')
    expect(result.milestones.map((milestone) => milestone.title)).toContain(
      'Tool use and structured outputs',
    )
    expect(result.currentRecommendation).toContain('Start with AI agent foundations')
  })

  it('generates deterministic active tool registration output', async () => {
    const service = new LocalAIService()

    const result = await service.runToolActivation({
      activationFields: [],
      activationFormDraft: {},
      capabilityTags: ['memory', 'fitness'],
      existingInstanceAliases: [],
      messages: [{ content: 'Build strength with dumbbells three times per week.', role: 'user' }],
      routeTags: ['fitness', 'workout'],
      sourceToolId: 'fitness-ai',
      templateDescription: 'Fitness planner',
      templateId: 'fitness-ai',
      templateLabel: 'Fitness AI',
      toolName: 'Fitness AI',
    })

    expect(result.needsMoreInfo).toBe(false)
    expect(result.suggestedInstanceAlias).toContain('strength')
    expect(result.activationForm.goal).toContain('Build strength')
    expect(result.routeTags).toContain('fitness')
  })

  it('routes user messages only to supplied active tools', async () => {
    const service = new LocalAIService()

    const result = await service.routeEnabledTool({
      enabledTools: [
        {
          activationSummary: 'Manage SEO lessons',
          adapterId: 'ai-progress',
          implementationPlan: ['Audit keywords', 'Publish content'],
          instanceAlias: 'SEO Coach',
          longTermGoalLabel: 'Build a repeatable SEO workflow',
          projectId: 'project_1',
          routeTags: ['seo', 'keyword'],
          routingEnabled: true,
          sourceToolId: 'seo-learning',
          status: 'active',
          templateId: 'seo-learning',
          toolFeatures: ['Keyword research', 'Content planning'],
          toolName: 'Learning Assistant',
        },
      ],
      today: '2026-06-18',
      userMessage: 'Make a full-week SEO learning plan.',
    })

    expect(result.matchedProjectId).toBe('project_1')
    expect(result.confidence).toBeGreaterThan(0.45)
    expect(result.needsConfirmation).toBe(true)
  })

  it('routes learning assistant plans to SEO when the module or topic is SEO', async () => {
    const service = new LocalAIService()

    const result = await service.runProgressTool({
      actions: [],
      calendarEvents: [],
      formInput: {
        goal: 'Learn SEO skills',
        learningTrack: 'SEO skills',
        outcome: 'build an SEO audit workflow',
      },
      memorySearchResults: [],
      milestones: [],
      progress: [],
      sourceToolId: 'seo-learning',
      today: '2026-06-18',
      toolKind: 'agent-learning',
      toolRuns: [],
    })

    expect(result.summary).toContain('SEO learning route')
    expect(result.confirmedRequirements).toContain('Route: SEO')
    expect(result.milestones.map((milestone) => milestone.title)).toContain(
      'SEO foundations and keyword research',
    )
    expect(result.calendarEvents[0].title).toBe('SEO learning block: baseline audit')
  })

  it('generates multiple agent learning sessions for a Chinese full-week request', async () => {
    const service = new LocalAIService()

    const result = await service.runProgressTool({
      actions: [],
      calendarEvents: [],
      formInput: {
        goal: 'Learn AI agent skills',
        outcome: 'ship a demo',
        preferredTime: '19:00',
        weeklyTime: '3 hours per week',
      },
      memorySearchResults: [],
      milestones: [],
      progress: [],
      sourceToolId: 'agent-learning',
      timezoneOffsetMinutes: -420,
      today: '2026-06-18',
      toolKind: 'agent-learning',
      toolRuns: [],
      userInstruction:
        'Latest user message:\n生成下周一整周的计划。\n\nTask: confirm requirements through the conversation.',
    })

    expect(result.calendarEvents).toHaveLength(3)
    expect(result.calendarEvents[0].startAt).toBe('2026-06-23T02:00:00.000Z')
    expect(result.actions.map((action) => action.title)).toContain(
      'Implement one structured tool call exercise',
    )
    expect(result.confirmedRequirements).toContain('Calendar sessions: 3')
  })
})
