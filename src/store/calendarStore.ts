import { create } from 'zustand'

import { shiftCalendarDate, todayISODate } from '../domain/logic/dateHelpers'
import type { CalendarView } from '../domain/types'

export type CalendarStoreState = {
  view: CalendarView
  focusedDate: string
}

export type CalendarStore = CalendarStoreState & {
  setView: (view: CalendarView) => void
  setFocusedDate: (focusedDate: string) => void
  goToDate: (focusedDate: string) => void
  goToNext: () => void
  goToPrev: () => void
  goToToday: () => void
  reset: (state?: Partial<CalendarStoreState>) => void
}

export function createInitialCalendarState(): CalendarStoreState {
  return {
    view: 'month',
    focusedDate: todayISODate(),
  }
}

export const useCalendarStore = create<CalendarStore>((set) => ({
  ...createInitialCalendarState(),
  setView: (view) => set({ view }),
  setFocusedDate: (focusedDate) => set({ focusedDate }),
  goToDate: (focusedDate) => set({ focusedDate }),
  goToNext: () =>
    set((state) => ({
      focusedDate: shiftCalendarDate(state.focusedDate, state.view, 1),
    })),
  goToPrev: () =>
    set((state) => ({
      focusedDate: shiftCalendarDate(state.focusedDate, state.view, -1),
    })),
  goToToday: () => set({ focusedDate: todayISODate() }),
  reset: (state = {}) => set({ ...createInitialCalendarState(), ...state }),
}))
