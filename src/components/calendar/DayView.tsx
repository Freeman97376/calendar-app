import type { Event } from '../../domain/types'
import TimeGrid from './TimeGrid'

type Day = {
  isoDate: string
  dayOfMonth: number
  weekdayShort: string
  monthShort: string
  isToday: boolean
}

type DayViewProps = {
  day: Day
  eventsByDate: Record<string, Event[]>
  onSelectDate: (isoDate: string) => void
  onSelectEvent: (event: Event) => void
  onSelectTimeSlot: (isoDate: string, hour: number) => void
}

export default function DayView({
  day,
  eventsByDate,
  onSelectDate,
  onSelectEvent,
  onSelectTimeSlot,
}: DayViewProps) {
  return (
    <TimeGrid
      days={[day]}
      eventsByDate={eventsByDate}
      onSelectDate={onSelectDate}
      onSelectEvent={onSelectEvent}
      onSelectTimeSlot={onSelectTimeSlot}
    />
  )
}
