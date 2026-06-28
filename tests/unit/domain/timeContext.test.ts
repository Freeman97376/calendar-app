import { describe, expect, it } from 'vitest'

import { getLocalTimeContext } from '../../../src/domain/logic/timeContext'

describe('getLocalTimeContext', () => {
  it('uses a Pacific timezone override for current local time fields', () => {
    const context = getLocalTimeContext(new Date('2026-06-18T02:15:00.000Z'), 'America/Los_Angeles')

    expect(context).toMatchObject({
      currentDate: '2026-06-17',
      currentDateTime: '2026-06-18T02:15:00.000Z',
      currentLocalDateTime: '2026-06-17T19:15:00-07:00',
      timezone: 'America/Los_Angeles',
      timezoneOffsetLabel: 'UTC-07:00',
      timezoneOffsetMinutes: -420,
    })
    expect(context.timezoneName).toEqual(expect.any(String))
  })

  it('accepts Pacific Time aliases', () => {
    const context = getLocalTimeContext(new Date('2026-12-18T20:00:00.000Z'), 'Pacific Time')

    expect(context.timezone).toBe('America/Los_Angeles')
    expect(context.currentLocalDateTime).toBe('2026-12-18T12:00:00-08:00')
    expect(context.timezoneOffsetLabel).toBe('UTC-08:00')
  })
})
