import { describe, expect, it } from 'vitest'

import { RecurrenceRuleSchema } from '../../../../src/domain/schemas/recurrence.schema'

describe('RecurrenceRuleSchema', () => {
  it('defaults interval and end condition', () => {
    const parsed = RecurrenceRuleSchema.parse({ frequency: 'daily' })

    expect(parsed.interval).toBe(1)
    expect(parsed.endCondition).toEqual({ type: 'never' })
  })

  it('accepts a weekly rule with selected weekdays', () => {
    const parsed = RecurrenceRuleSchema.parse({
      frequency: 'weekly',
      daysOfWeek: ['mon', 'wed'],
      endCondition: { type: 'count', occurrences: 4 },
    })

    expect(parsed.daysOfWeek).toEqual(['mon', 'wed'])
  })

  it('rejects invalid intervals', () => {
    expect(() => RecurrenceRuleSchema.parse({ frequency: 'daily', interval: 0 })).toThrow()
  })

  it('rejects invalid day of month', () => {
    expect(() => RecurrenceRuleSchema.parse({ frequency: 'monthly', dayOfMonth: 32 })).toThrow()
  })

  it('rejects weekly rule with an empty daysOfWeek array', () => {
    expect(() => RecurrenceRuleSchema.parse({ frequency: 'weekly', daysOfWeek: [] })).toThrow()
  })
})
