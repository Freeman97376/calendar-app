import type { Event } from '../../domain/types'
import CalendarDropTarget from './CalendarDropTarget'
import EventCard from '../event/EventCard'

type TimeGridDay = {
  isoDate: string
  dayOfMonth: number
  weekdayShort: string
  monthShort: string
  isToday: boolean
}

type TimeGridProps = {
  days: TimeGridDay[]
  eventsByDate: Record<string, Event[]>
  onSelectDate: (isoDate: string) => void
  onSelectEvent: (event: Event) => void
}

const hours = Array.from({ length: 24 }, (_, hour) => hour)

function formatHour(hour: number) {
  if (hour === 0) return '12 AM'
  if (hour === 12) return '12 PM'
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`
}

function getEventsForHour(events: Event[], hour: number): Event[] {
  return events.filter((event) =>
    event.allDay ? hour === 0 : new Date(event.startAt).getHours() === hour,
  )
}

export default function TimeGrid({ days, eventsByDate, onSelectDate, onSelectEvent }: TimeGridProps) {
  const gridColumns =
    days.length === 1
      ? 'grid-cols-[4rem_minmax(0,1fr)]'
      : 'grid-cols-[4rem_repeat(7,minmax(0,1fr))]'

  return (
    <section aria-label="Time grid" className="flex min-h-0 flex-1 flex-col bg-white">
      <div className={`grid ${gridColumns} border-b border-slate-200 bg-slate-50`}>
        <div aria-hidden="true" />
        {days.map((day) => (
          <button
            className="border-l border-slate-200 px-2 py-3 text-center hover:bg-emerald-50"
            key={day.isoDate}
            onClick={() => onSelectDate(day.isoDate)}
            type="button"
          >
            <span className="block text-xs font-semibold uppercase text-slate-500">
              {day.weekdayShort}
            </span>
            <span
              className={[
                'mx-auto mt-1 flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold',
                day.isToday ? 'bg-emerald-700 text-white' : 'text-slate-900',
              ].join(' ')}
            >
              {day.dayOfMonth}
            </span>
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {hours.map((hour) => (
          <div className={`grid ${gridColumns}`} key={hour}>
            <div className="border-b border-slate-100 pr-2 pt-2 text-right text-xs text-slate-400">
              {formatHour(hour)}
            </div>
            {days.map((day) => (
              <CalendarDropTarget
                className="group relative min-h-14 border-b border-l border-slate-100 bg-white p-1 transition hover:bg-emerald-50"
                key={`${day.isoDate}-${hour}`}
                target={{ kind: 'time-slot', isoDate: day.isoDate, hour }}
              >
                <button
                  aria-label={`Add event on ${day.monthShort} ${day.dayOfMonth} at ${formatHour(hour)}`}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded text-slate-400 opacity-0 transition hover:bg-emerald-100 hover:text-emerald-700 group-hover:opacity-100"
                  onClick={() => onSelectDate(day.isoDate)}
                  type="button"
                >
                  +
                </button>
                <div className="space-y-1">
                  {getEventsForHour(eventsByDate[day.isoDate] ?? [], hour).map((event) => (
                    <EventCard compact event={event} key={event.id} onClick={onSelectEvent} />
                  ))}
                </div>
              </CalendarDropTarget>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
