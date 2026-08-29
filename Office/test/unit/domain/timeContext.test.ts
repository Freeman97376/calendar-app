import { describe, expect, it } from 'vitest'

import {
  getLocalTimeContext,
  localDateTimeInTimezoneToISOString,
} from '../../../../src/domain/logic/timeContext'

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

  it('uses the target calendar date offset on both sides of daylight saving time', () => {
    expect(localDateTimeInTimezoneToISOString('2026-07-09', 9, 0, 'America/Los_Angeles')).toBe(
      '2026-07-09T16:00:00.000Z',
    )
    expect(localDateTimeInTimezoneToISOString('2026-11-02', 9, 0, 'America/Los_Angeles')).toBe(
      '2026-11-02T17:00:00.000Z',
    )
  })

  it('rejects a wall-clock time that does not exist during the spring DST jump', () => {
    expect(
      localDateTimeInTimezoneToISOString('2026-03-08', 2, 30, 'America/Los_Angeles'),
    ).toBeNull()
  })
})
