import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useCalendarStore } from '../../../src/store/calendarStore'

describe('calendarStore', () => {
  beforeEach(() => {
    vi.useRealTimers()
    useCalendarStore.getState().reset({ focusedDate: '2026-05-25', view: 'month' })
  })

  it('initial view is month', () => {
    useCalendarStore.getState().reset({ focusedDate: '2026-05-25' })

    expect(useCalendarStore.getState().view).toBe('month')
  })

  it('setView changes the current view', () => {
    useCalendarStore.getState().setView('week')

    expect(useCalendarStore.getState().view).toBe('week')
  })

  it('goToNext advances by one month in month view', () => {
    useCalendarStore.getState().goToNext()

    expect(useCalendarStore.getState().focusedDate).toBe('2026-06-25')
  })

  it('goToNext advances by one week in week view', () => {
    useCalendarStore.getState().setView('week')
    useCalendarStore.getState().goToNext()

    expect(useCalendarStore.getState().focusedDate).toBe('2026-06-01')
  })

  it('goToNext advances by one day in day view', () => {
    useCalendarStore.getState().setView('day')
    useCalendarStore.getState().goToNext()

    expect(useCalendarStore.getState().focusedDate).toBe('2026-05-26')
  })

  it('goToPrev moves back correctly', () => {
    useCalendarStore.getState().goToPrev()

    expect(useCalendarStore.getState().focusedDate).toBe('2026-04-25')
  })

  it('goToToday sets focusedDate to today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-30T12:00:00-07:00'))

    useCalendarStore.getState().goToToday()

    expect(useCalendarStore.getState().focusedDate).toBe('2026-05-30')
  })

  it('store resets correctly between tests', () => {
    useCalendarStore.getState().setView('day')
    useCalendarStore.getState().goToDate('2026-12-24')

    useCalendarStore.getState().reset({ focusedDate: '2026-05-25', view: 'month' })

    expect(useCalendarStore.getState().view).toBe('month')
    expect(useCalendarStore.getState().focusedDate).toBe('2026-05-25')
  })
})
