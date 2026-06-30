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
import { useI18n } from './useI18n'

export function useCalendar() {
  const { locale, t } = useI18n()
  const view = useCalendarStore((state) => state.view)
  const focusedDate = useCalendarStore((state) => state.focusedDate)
  const setView = useCalendarStore((state) => state.setView)
  const setFocusedDate = useCalendarStore((state) => state.setFocusedDate)
  const goToDate = useCalendarStore((state) => state.goToDate)
  const goToNext = useCalendarStore((state) => state.goToNext)
  const goToPrev = useCalendarStore((state) => state.goToPrev)
  const goToToday = useCalendarStore((state) => state.goToToday)

  const monthGrid = useMemo(() => getMonthGrid(focusedDate, new Date(), locale), [focusedDate, locale])
  const weekDays = useMemo(() => getWeekDays(focusedDate, new Date(), locale), [focusedDate, locale])
  const day = useMemo(() => getDayInfo(focusedDate, new Date(), locale), [focusedDate, locale])
  const visibleRange = useMemo(() => getViewRange(view, focusedDate), [focusedDate, view])
  const title = useMemo(() => getCalendarTitle(view, focusedDate, locale), [focusedDate, locale, view])
  const subtitle = useMemo(
    () =>
      getCalendarSubtitle(view, focusedDate, locale, {
        month: t('calendar.monthView'),
        today: t('calendar.today'),
        week: t('calendar.weekView'),
      }),
    [focusedDate, locale, t, view],
  )

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
