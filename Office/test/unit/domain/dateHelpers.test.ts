import { describe, expect, it } from 'vitest'

import {
  getCalendarTitle,
  getMonthGrid,
  getViewRange,
  getWeekDays,
  shiftCalendarDate,
  toISODate,
} from '../../../../src/domain/logic/dateHelpers'

describe('dateHelpers', () => {
  it('formats local dates as YYYY-MM-DD', () => {
    expect(toISODate(new Date('2026-05-25T12:00:00'))).toBe('2026-05-25')
  })

  it('builds a Monday-start month grid', () => {
    const grid = getMonthGrid('2026-05-25', new Date('2026-05-25T12:00:00'))

    expect(grid).toHaveLength(5)
    expect(grid[0][0].isoDate).toBe('2026-04-27')
    expect(grid[0][4].isoDate).toBe('2026-05-01')
    expect(grid[4][6].isoDate).toBe('2026-05-31')
  })

  it('marks current-month and today flags independently', () => {
    const grid = getMonthGrid('2026-05-25', new Date('2026-05-25T12:00:00'))
    const aprilCell = grid[0][0]
    const todayCell = grid.flat().find((day) => day.isoDate === '2026-05-25')

    expect(aprilCell.isCurrentMonth).toBe(false)
    expect(todayCell?.isCurrentMonth).toBe(true)
    expect(todayCell?.isToday).toBe(true)
  })

  it('returns Monday-to-Sunday week days', () => {
    const days = getWeekDays('2026-05-28')

    expect(days.map((day) => day.isoDate)).toEqual([
      '2026-05-25',
      '2026-05-26',
      '2026-05-27',
      '2026-05-28',
      '2026-05-29',
      '2026-05-30',
      '2026-05-31',
    ])
  })

  it('shifts dates by the active calendar unit', () => {
    expect(shiftCalendarDate('2026-05-25', 'month', 1)).toBe('2026-06-25')
    expect(shiftCalendarDate('2026-05-25', 'week', 1)).toBe('2026-06-01')
    expect(shiftCalendarDate('2026-05-25', 'day', 1)).toBe('2026-05-26')
  })

  it('creates view ranges for event queries', () => {
    const range = getViewRange('week', '2026-05-28')

    expect(new Date(range.start).getTime()).toBeLessThan(new Date(range.end).getTime())
  })

  it('creates readable titles for each view', () => {
    expect(getCalendarTitle('month', '2026-05-25')).toBe('May 2026')
    expect(getCalendarTitle('week', '2026-05-25')).toBe('May 25-31, 2026')
    expect(getCalendarTitle('day', '2026-05-25')).toBe('Monday, May 25, 2026')
  })
})
