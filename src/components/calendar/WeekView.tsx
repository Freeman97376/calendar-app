import type { Event } from '../../domain/types'
import TimeGrid from './TimeGrid'

type WeekDay = {
  isoDate: string
  dayOfMonth: number
  weekdayShort: string
  monthShort: string
  isToday: boolean
}

type WeekViewProps = {
  days: WeekDay[]
  eventsByDate: Record<string, Event[]>
  onSelectDate: (isoDate: string) => void
  onSelectEvent: (event: Event) => void
  onSelectTimeSlot: (isoDate: string, hour: number) => void
}

export default function WeekView({
  days,
  eventsByDate,
  onSelectDate,
  onSelectEvent,
  onSelectTimeSlot,
}: WeekViewProps) {
  return (
    <TimeGrid
      days={days}
      eventsByDate={eventsByDate}
      onSelectDate={onSelectDate}
      onSelectEvent={onSelectEvent}
      onSelectTimeSlot={onSelectTimeSlot}
    />
  )
}
