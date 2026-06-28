import type { Event } from '../../domain/types'

type EventDragOverlayProps = {
  event: Event | null
}

function formatEventTime(event: Event): string {
  if (event.allDay) return 'All day'

  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })

  return `${formatter.format(new Date(event.startAt))} - ${formatter.format(new Date(event.endAt))}`
}

export default function EventDragOverlay({ event }: EventDragOverlayProps) {
  if (!event) return null

  return (
    <div className="w-56 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-left text-sm text-emerald-950 shadow-lg">
      <span className="block truncate font-medium">{event.title}</span>
      <span className="block truncate text-emerald-800">{formatEventTime(event)}</span>
    </div>
  )
}
