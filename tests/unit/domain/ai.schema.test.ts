import { describe, expect, it } from 'vitest'

import { AIBreakdownResultSchema } from '../../../src/domain/schemas/ai.schema'

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
