import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DragEndEvent } from '@dnd-kit/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getEventsInRange } from '../../../src/domain/logic/eventUtils'
import type { CalendarDropTarget } from '../../../src/hooks/useDragDrop'
import { getDropTargetId, useDragDrop } from '../../../src/hooks/useDragDrop'
import { useCalendarStore } from '../../../src/store/calendarStore'
import { useEventStore } from '../../../src/store/eventStore'
import { useUIStore } from '../../../src/store/uiStore'
import { useCalendar } from '../../../src/hooks/useCalendar'
import { useEvents } from '../../../src/hooks/useEvents'

const eventDraft = {
  title: 'Planning session',
  startAt: '2026-05-25T16:00:00.000Z',
  endAt: '2026-05-25T17:00:00.000Z',
}

function localDate(isoDateTime: string): string {
  const date = new Date(isoDateTime)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function visibleEvents() {
  return getEventsInRange(useEventStore.getState().events, {
    start: '2026-05-01T00:00:00.000Z',
    end: '2026-05-31T23:59:59.999Z',
  })
}

function DragHarness({
  eventIndex = 0,
  target,
}: {
  eventIndex?: number
  target: CalendarDropTarget
}) {
  const calendar = useCalendar()
  const events = useEvents(calendar.visibleRange)
  const dragDrop = useDragDrop(events.visibleEvents)
  const event = events.visibleEvents[eventIndex]

  async function simulateDrop() {
    if (!event) return

    await dragDrop.handleDragEnd({
      active: {
        id: event.id,
        data: {
          current: {
            type: 'calendar-event',
            event,
          },
        },
      },
      over: {
        id: getDropTargetId(target),
        data: {
          current: {
            type: 'calendar-drop-target',
            target,
          },
        },
      },
    } as unknown as DragEndEvent)
  }

  return (
    <button onClick={() => void simulateDrop()} type="button">
      Simulate drop
    </button>
  )
}

describe('Drag and drop - integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCalendarStore.getState().reset({ focusedDate: '2026-05-25', view: 'month' })
    useEventStore.getState().reset()
    useUIStore.getState().reset()
  })

  it('drops an event onto a different month date while preserving its time', async () => {
    const event = await useEventStore.getState().createEvent(eventDraft)
    const user = userEvent.setup()
    render(<DragHarness target={{ kind: 'date', isoDate: '2026-05-26' }} />)

    await user.click(screen.getByRole('button', { name: 'Simulate drop' }))

    await waitFor(() => {
      const updated = useEventStore.getState().events.find((candidate) => candidate.id === event.id)
      expect(updated).toBeDefined()
      expect(localDate(updated?.startAt ?? '')).toBe('2026-05-26')
      // Verify local clock hour is preserved after the date move (timezone-independent assertion)
      const originalLocalHour = new Date(eventDraft.startAt).getHours()
      expect(new Date(updated?.startAt ?? '').getHours()).toBe(originalLocalHour)
    })
  })

  it('drops an event onto a week time slot and updates date and hour', async () => {
    useCalendarStore.getState().reset({ focusedDate: '2026-05-25', view: 'week' })
    const event = await useEventStore.getState().createEvent(eventDraft)
    const user = userEvent.setup()
    render(<DragHarness target={{ kind: 'time-slot', isoDate: '2026-05-27', hour: 14 }} />)

    await user.click(screen.getByRole('button', { name: 'Simulate drop' }))

    await waitFor(() => {
      const updated = useEventStore.getState().events.find((candidate) => candidate.id === event.id)
      expect(updated).toBeDefined()
      expect(localDate(updated?.startAt ?? '')).toBe('2026-05-27')
      expect(new Date(updated?.startAt ?? '').getHours()).toBe(14)
    })
  })

  it('dragging this recurring occurrence creates a moved exception', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('this')
    await useEventStore.getState().createEvent({
      ...eventDraft,
      title: 'Daily standup',
      recurrenceRule: {
        frequency: 'daily',
        interval: 1,
        endCondition: { type: 'count', occurrences: 3 },
      },
    })
    const user = userEvent.setup()
    render(<DragHarness target={{ kind: 'date', isoDate: '2026-05-28' }} />)

    await user.click(screen.getByRole('button', { name: 'Simulate drop' }))

    await waitFor(() => {
      const rawEvents = useEventStore.getState().events
      const master = rawEvents.find((event) => event.recurrenceRule)
      const exception = rawEvents.find((event) => event.exceptionFor)

      expect(master?.deletedOccurrences).toEqual(['2026-05-25'])
      expect(exception).toBeDefined()
      expect(localDate(exception?.startAt ?? '')).toBe('2026-05-28')
      expect(visibleEvents()).toHaveLength(3)
    })
  })

  it('dragging this and following recurring occurrence splits the series', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('following')
    await useEventStore.getState().createEvent({
      ...eventDraft,
      title: 'Daily standup',
      recurrenceRule: {
        frequency: 'daily',
        interval: 1,
        endCondition: { type: 'count', occurrences: 3 },
      },
    })
    const user = userEvent.setup()
    render(<DragHarness eventIndex={1} target={{ kind: 'date', isoDate: '2026-05-29' }} />)

    await user.click(screen.getByRole('button', { name: 'Simulate drop' }))

    await waitFor(() => {
      expect(visibleEvents().map((event) => localDate(event.startAt))).toEqual([
        '2026-05-25',
        '2026-05-29',
        '2026-05-30',
      ])
    })
  })

  it('cancelled recurring drag leaves the series unchanged', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue(null)
    await useEventStore.getState().createEvent({
      ...eventDraft,
      title: 'Daily standup',
      recurrenceRule: {
        frequency: 'daily',
        interval: 1,
        endCondition: { type: 'count', occurrences: 3 },
      },
    })
    const user = userEvent.setup()
    render(<DragHarness target={{ kind: 'date', isoDate: '2026-05-28' }} />)

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Simulate drop' }))
    })

    expect(visibleEvents().map((event) => localDate(event.startAt))).toEqual([
      '2026-05-25',
      '2026-05-26',
      '2026-05-27',
    ])
  })
})
