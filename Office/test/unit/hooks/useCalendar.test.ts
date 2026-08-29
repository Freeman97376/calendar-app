import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useCalendar } from '../../../../src/hooks/useCalendar'
import { useCalendarStore } from '../../../../src/store/calendarStore'

describe('useCalendar', () => {
  beforeEach(() => {
    useCalendarStore.getState().reset({ focusedDate: '2026-05-25', view: 'month' })
  })

  it('returns derived month data for the focused date', () => {
    const { result } = renderHook(() => useCalendar())

    expect(result.current.title).toBe('May 2026')
    expect(result.current.monthGrid[0][0].isoDate).toBe('2026-04-27')
    expect(result.current.visibleRange.start).toContain('2026-05-01')
  })

  it('returns week data when the view changes', () => {
    useCalendarStore.getState().setView('week')

    const { result } = renderHook(() => useCalendar())

    expect(result.current.title).toBe('May 25-31, 2026')
    expect(result.current.weekDays).toHaveLength(7)
  })
})
