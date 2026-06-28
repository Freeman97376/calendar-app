import { useMemo } from 'react'

import {
  getCalendarSubtitle,
  getCalendarTitle,
  getDayInfo,
  getMonthGrid,
  getViewRange,
  getWeekDays,
} from '../domain/logic/dateHelpers'
import { useCalendarStore } from '../store/calendarStore'

export function useCalendar() {
  const view = useCalendarStore((state) => state.view)
  const focusedDate = useCalendarStore((state) => state.focusedDate)
  const setView = useCalendarStore((state) => state.setView)
  const setFocusedDate = useCalendarStore((state) => state.setFocusedDate)
  const goToDate = useCalendarStore((state) => state.goToDate)
  const goToNext = useCalendarStore((state) => state.goToNext)
  const goToPrev = useCalendarStore((state) => state.goToPrev)
  const goToToday = useCalendarStore((state) => state.goToToday)

  const monthGrid = useMemo(() => getMonthGrid(focusedDate), [focusedDate])
  const weekDays = useMemo(() => getWeekDays(focusedDate), [focusedDate])
  const day = useMemo(() => getDayInfo(focusedDate), [focusedDate])
  const visibleRange = useMemo(() => getViewRange(view, focusedDate), [focusedDate, view])
  const title = useMemo(() => getCalendarTitle(view, focusedDate), [focusedDate, view])
  const subtitle = useMemo(() => getCalendarSubtitle(view, focusedDate), [focusedDate, view])

  return {
    view,
    focusedDate,
    title,
    subtitle,
    visibleRange,
    monthGrid,
    weekDays,
    day,
    setView,
    setFocusedDate,
    goToDate,
    goToNext,
    goToPrev,
    goToToday,
  }
}
