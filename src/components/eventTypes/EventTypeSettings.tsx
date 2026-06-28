import { useEffect, useState, type FormEvent } from 'react'

import type { EventType } from '../../domain/types'
import { useEventTypes } from '../../hooks/useEventTypes'
import Button from '../ui/Button'

type TypeDraftState = {
  appliesTo: EventType['appliesTo']
  color: string
  label: string
}

const emptyTypeDraft: TypeDraftState = {
  appliesTo: 'both',
  color: '#2563eb',
  label: '',
}

function TypeSwatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3 w-3 shrink-0 rounded-full border border-slate-200"
      style={{ backgroundColor: color }}
    />
  )
}

function EventTypeRow({
  eventType,
  onArchive,
  onUpdate,
}: {
  eventType: EventType
  onArchive: (id: string) => Promise<EventType>
  onUpdate: (
    id: string,
    changes: Pick<EventType, 'appliesTo' | 'color' | 'label'>,
  ) => Promise<EventType>
}) {
  const [values, setValues] = useState({
    appliesTo: eventType.appliesTo,
    color: eventType.color,
    label: eventType.label,
  })
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setValues({
      appliesTo: eventType.appliesTo,
      color: eventType.color,
      label: eventType.label,
    })
  }, [eventType])

  async function save() {
    if (!values.label.trim()) return

    setIsSaving(true)
    try {
      await onUpdate(eventType.id, { ...values, label: values.label.trim() })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-slate-200 p-3">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <TypeSwatch color={eventType.color} />
        <span>{eventType.id}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_5rem]">
        <label className="sr-only" htmlFor={`event-type-label-${eventType.id}`}>
          Type label
        </label>
        <input
          className="h-9 rounded-md border border-slate-300 px-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
          id={`event-type-label-${eventType.id}`}
          onChange={(inputEvent) =>
            setValues((current) => ({ ...current, label: inputEvent.target.value }))
          }
          value={values.label}
        />
        <label className="sr-only" htmlFor={`event-type-color-${eventType.id}`}>
          Type color
        </label>
        <input
          className="h-9 rounded-md border border-slate-300 px-2"
          id={`event-type-color-${eventType.id}`}
          onChange={(inputEvent) =>
            setValues((current) => ({ ...current, color: inputEvent.target.value }))
          }
          type="color"
          value={values.color}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`event-type-applies-${eventType.id}`}>
          Type scope
        </label>
        <select
          className="h-9 rounded-md border border-slate-300 px-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
          id={`event-type-applies-${eventType.id}`}
          onChange={(inputEvent) =>
            setValues((current) => ({
              ...current,
              appliesTo: inputEvent.target.value as EventType['appliesTo'],
            }))
          }
          value={values.appliesTo}
        >
          <option value="both">Calendar and tasks</option>
          <option value="todo">Tasks only</option>
          <option value="calendar">Calendar only</option>
        </select>
        <Button disabled={isSaving} onClick={save} variant="secondary">
          Save
        </Button>
        <Button onClick={() => onArchive(eventType.id)} variant="ghost">
          Archive
        </Button>
      </div>
    </div>
  )
}

export default function EventTypeSettings({ title = 'Types' }: { title?: string }) {
  const eventTypes = useEventTypes()
  const [typeDraft, setTypeDraft] = useState(emptyTypeDraft)
  const [status, setStatus] = useState<string | null>(null)

  async function createEventType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!typeDraft.label.trim()) return

    const eventType = await eventTypes.createEventType({
      appliesTo: typeDraft.appliesTo,
      color: typeDraft.color,
      label: typeDraft.label.trim(),
    })

    setTypeDraft(emptyTypeDraft)
    setStatus(`Added type ${eventType.label}`)
  }

  return (
    <section aria-label={title} className="space-y-3 border-t border-slate-200 pt-4">
      <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
      <form className="space-y-3" onSubmit={createEventType}>
        <div className="grid gap-2 sm:grid-cols-[1fr_5rem]">
          <label className="sr-only" htmlFor="new-event-type-label">
            New type label
          </label>
          <input
            className="h-9 rounded-md border border-slate-300 px-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
            id="new-event-type-label"
            onChange={(inputEvent) =>
              setTypeDraft((current) => ({ ...current, label: inputEvent.target.value }))
            }
            placeholder="New type"
            type="text"
            value={typeDraft.label}
          />
          <label className="sr-only" htmlFor="new-event-type-color">
            New type color
          </label>
          <input
            className="h-9 rounded-md border border-slate-300 px-2"
            id="new-event-type-color"
            onChange={(inputEvent) =>
              setTypeDraft((current) => ({ ...current, color: inputEvent.target.value }))
            }
            type="color"
            value={typeDraft.color}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="new-event-type-scope">
            New type scope
          </label>
          <select
            className="h-9 rounded-md border border-slate-300 px-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
            id="new-event-type-scope"
            onChange={(inputEvent) =>
              setTypeDraft((current) => ({
                ...current,
                appliesTo: inputEvent.target.value as EventType['appliesTo'],
              }))
            }
            value={typeDraft.appliesTo}
          >
            <option value="both">Calendar and tasks</option>
            <option value="todo">Tasks only</option>
            <option value="calendar">Calendar only</option>
          </select>
          <Button disabled={!typeDraft.label.trim()} type="submit" variant="secondary">
            Add type
          </Button>
        </div>
      </form>

      {eventTypes.error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{eventTypes.error}</p>
      ) : null}
      {status ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{status}</p>
      ) : null}

      <div className="space-y-2">
        {eventTypes.activeEventTypes.map((eventType) => (
          <EventTypeRow
            eventType={eventType}
            key={eventType.id}
            onArchive={eventTypes.archiveEventType}
            onUpdate={eventTypes.updateEventType}
          />
        ))}
      </div>
    </section>
  )
}
