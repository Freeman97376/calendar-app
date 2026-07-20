import { useDraggable } from '@dnd-kit/core'

import type { Event } from '../../domain/types'
import { useEventTypes } from '../../hooks/useEventTypes'

type EventCardProps = {
  event: Event
  compact?: boolean
  draggable?: boolean
  onClick: (event: Event) => void
}

function formatEventTime(event: Event): string {
  if (event.allDay) return 'All day'

  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })

  return `${formatter.format(new Date(event.startAt))} - ${formatter.format(new Date(event.endAt))}`
}

function detailSnippet(displayDetails: string): string {
  return (
    displayDetails
      .split('\n')
      .find((line) => line.trim())
      ?.trim() ?? displayDetails.trim()
  )
}

export default function EventCard({
  event,
  compact = false,
  draggable = true,
  onClick,
}: EventCardProps) {
  const { eventTypesById } = useEventTypes()
  const eventType = eventTypesById.get(event.eventTypeId)
  const { attributes, isDragging, listeners, setNodeRef } = useDraggable({
    id: event.id,
    data: {
      type: 'calendar-event',
      event,
    },
    disabled: !draggable,
  })

  return (
    <button
      {...attributes}
      {...listeners}
      aria-label={`Edit event ${event.title}`}
      className={[
        'w-full rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-left text-emerald-950 transition hover:border-emerald-400 hover:bg-emerald-100',
        compact ? 'text-xs' : 'text-sm',
        isDragging ? 'opacity-40' : '',
      ].join(' ')}
      data-testid={`event-card-${event.id}`}
      onClick={() => onClick(event)}
      ref={setNodeRef}
      type="button"
    >
      <span className="block truncate font-medium">{event.title}</span>
      {eventType ? (
        <span className="block truncate text-[0.7rem] font-medium uppercase text-emerald-700">
          {eventType.label}
        </span>
      ) : null}
      <span className="block truncate text-emerald-800">{formatEventTime(event)}</span>
      {event.displayDetails ? (
        <span className="block truncate text-[0.7rem] text-emerald-900">
          {detailSnippet(event.displayDetails)}
        </span>
      ) : null}
    </button>
  )
}
