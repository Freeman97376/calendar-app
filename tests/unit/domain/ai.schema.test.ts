import { describe, expect, it } from 'vitest'

import {
  AIBreakdownResultSchema,
  AIProgressToolRequestSchema,
  AIProgressToolResultSchema,
} from '../../../src/domain/schemas/ai.schema'

const validResult = {
  goal: 'Prepare for interview',
  steps: [
    {
      title: 'Research the company',
      description: 'Review product pages and recent news.',
      durationMinutes: 45,
      suggestedDayOffset: 0,
      suggestedHour: 9,
      priority: 'high',
    },
    {
      title: 'Practice answers',
      durationMinutes: 60,
      suggestedDayOffset: 1,
      priority: 'medium',
    },
  ],
  totalEstimatedHours: 1.75,
  notes: 'Front-load preparation.',
}

describe('AIBreakdownResultSchema', () => {
  it('valid result with multiple steps passes', () => {
    expect(AIBreakdownResultSchema.parse(validResult)).toMatchObject(validResult)
  })

  it('empty steps array fails validation', () => {
    expect(() => AIBreakdownResultSchema.parse({ ...validResult, steps: [] })).toThrow()
  })

  it('step with durationMinutes below 5 fails', () => {
    expect(() =>
      AIBreakdownResultSchema.parse({
        ...validResult,
        steps: [{ ...validResult.steps[0], durationMinutes: 4 }],
      }),
    ).toThrow()
  })

  it('step with durationMinutes above 480 fails', () => {
    expect(() =>
      AIBreakdownResultSchema.parse({
        ...validResult,
        steps: [{ ...validResult.steps[0], durationMinutes: 481 }],
      }),
    ).toThrow()
  })

  it('step with suggestedDayOffset above 30 fails', () => {
    expect(() =>
      AIBreakdownResultSchema.parse({
        ...validResult,
        steps: [{ ...validResult.steps[0], suggestedDayOffset: 31 }],
      }),
    ).toThrow()
  })

  it('invalid priority value fails', () => {
    expect(() =>
      AIBreakdownResultSchema.parse({
        ...validResult,
        steps: [{ ...validResult.steps[0], priority: 'urgent' }],
      }),
    ).toThrow()
  })

  it('optional fields can be absent', () => {
    const { notes: _notes, totalEstimatedHours: _totalEstimatedHours, ...minimal } = validResult

    expect(AIBreakdownResultSchema.parse(minimal)).toMatchObject(minimal)
  })

  it('more than 20 steps fails validation', () => {
    expect(() =>
      AIBreakdownResultSchema.parse({
        ...validResult,
        steps: Array.from({ length: 21 }, (_, index) => ({
          ...validResult.steps[0],
          title: `Step ${index}`,
        })),
      }),
    ).toThrow()
  })
})

describe('AIProgressTool schemas', () => {
  it('validates compact progress tool requests and results', () => {
    const request = AIProgressToolRequestSchema.parse({
      actions: [],
      calendarEvents: [],
      formInput: { goal: 'Build strength' },
      memorySearchResults: [],
      milestones: [],
      progress: [],
      sourceToolId: 'fitness-ai',
      today: '2026-06-18',
      toolKind: 'fitness',
      toolRuns: [],
    })
    const result = AIProgressToolResultSchema.parse({
      summary: 'Generated plan.',
      assistantReply: 'Confirmed the requirements.',
      confirmedRequirements: ['Goal: Build strength'],
      needsUserConfirmation: false,
      currentRecommendation: 'Do the first workout.',
      milestones: [{ title: 'Baseline', status: 'in_progress' }],
      actions: [{ title: 'Workout 1', status: 'scheduled', milestoneTitle: 'Baseline' }],
      calendarEvents: [
        {
          title: 'Workout 1',
          startAt: '2026-06-18T16:00:00.000Z',
          endAt: '2026-06-18T17:00:00.000Z',
          allDay: false,
        },
      ],
      warnings: [],
    })

    expect(request.toolKind).toBe('fitness')
    expect(result.assistantReply).toBe('Confirmed the requirements.')
    expect(result.confirmedRequirements).toEqual(['Goal: Build strength'])
    expect(result.calendarEvents[0].title).toBe('Workout 1')
  })

  it('rejects progress tool events where endAt is not after startAt', () => {
    expect(() =>
      AIProgressToolResultSchema.parse({
        summary: 'Bad plan.',
        currentRecommendation: 'Fix time.',
        calendarEvents: [
          {
            title: 'Bad event',
            startAt: '2026-06-18T17:00:00.000Z',
            endAt: '2026-06-18T16:00:00.000Z',
            allDay: false,
          },
        ],
      }),
    ).toThrow()
  })
})
