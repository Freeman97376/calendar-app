import type { Event } from '../../domain/types'
import CalendarDropTarget from './CalendarDropTarget'
import EventCard from '../event/EventCard'

type MonthCell = {
  isoDate: string
  dayOfMonth: number
  weekdayShort: string
  isCurrentMonth: boolean
  isToday: boolean
}

type MonthViewProps = {
  weeks: MonthCell[][]
  eventsByDate: Record<string, Event[]>
  onSelectDate: (isoDate: string) => void
  onSelectEvent: (event: Event) => void
}

const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function MonthView({
  weeks,
  eventsByDate,
  onSelectDate,
  onSelectEvent,
}: MonthViewProps) {
  return (
    <section aria-label="Month calendar" className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {weekdayLabels.map((label) => (
          <div
            className="px-2 py-3 text-center text-xs font-semibold uppercase text-slate-500"
            key={label}
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid flex-1 grid-cols-7 auto-rows-fr">
        {weeks.flat().map((day) => {
          const events = eventsByDate[day.isoDate] ?? []

          return (
            <CalendarDropTarget
              className={[
                'min-h-28 border-b border-r border-slate-200 bg-white p-2 text-left align-top transition hover:bg-emerald-50',
                day.isCurrentMonth ? 'text-slate-900' : 'text-slate-400',
              ].join(' ')}
              key={day.isoDate}
              target={{ kind: 'date', isoDate: day.isoDate }}
            >
              <button
                aria-label={`${day.weekdayShort}, ${day.isoDate}`}
                className={[
                  'inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium hover:bg-slate-100',
                  day.isToday ? 'bg-emerald-700 text-white' : '',
                ].join(' ')}
                onClick={() => onSelectDate(day.isoDate)}
                type="button"
              >
                {day.dayOfMonth}
              </button>

              <div className="mt-2 space-y-1">
                {events.slice(0, 3).map((event) => (
                  <EventCard compact event={event} key={event.id} onClick={onSelectEvent} />
                ))}
                {events.length > 3 ? (
                  <p className="text-xs font-medium text-slate-500">+{events.length - 3} more</p>
                ) : null}
              </div>
            </CalendarDropTarget>
          )
        })}
      </div>
    </section>
  )
}
