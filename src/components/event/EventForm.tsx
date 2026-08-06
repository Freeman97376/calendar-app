import { useMemo, useState, type FormEvent } from 'react'

import type { Event } from '../../domain/types'
import { useEventTypes } from '../../hooks/useEventTypes'
import type { EventFormValues, RecurrenceEditScope } from '../../hooks/useEvents'
import { useI18n } from '../../hooks/useI18n'
import { useRuntimeConfig } from '../../hooks/useRuntimeConfig'
import Button from '../ui/Button'
import RecurrenceSelector from './RecurrenceSelector'

type EventFormProps = {
  event: Event | null
  selectedDate: string
  onCancel: () => void
  onDelete?: (scope: RecurrenceEditScope) => Promise<void>
  onSubmit: (values: EventFormValues) => Promise<void>
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function toLocalDateInput(isoDateTime: string): string {
  const date = new Date(isoDateTime)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function toLocalTimeInput(isoDateTime: string): string {
  const date = new Date(isoDateTime)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function EventForm({
  event,
  selectedDate,
  onCancel,
  onDelete,
  onSubmit,
}: EventFormProps) {
  const { t } = useI18n()
  const runtimeConfig = useRuntimeConfig()
  const { calendarEventTypes, eventTypesById } = useEventTypes()
  const defaultEventTypeId = useMemo(() => {
    const configuredType = calendarEventTypes.find(
      (eventType) => eventType.id === runtimeConfig.defaultEventTypeId,
    )

    return configuredType?.id ?? calendarEventTypes[0]?.id ?? runtimeConfig.defaultEventTypeId
  }, [calendarEventTypes, runtimeConfig.defaultEventTypeId])
  const eventTypeOptions = useMemo(() => {
    if (!event?.eventTypeId) return calendarEventTypes

    const selectedType = eventTypesById.get(event.eventTypeId)
    const selectedIsListed = calendarEventTypes.some(
      (eventType) => eventType.id === event.eventTypeId,
    )

    return selectedType && !selectedIsListed
      ? [selectedType, ...calendarEventTypes]
      : calendarEventTypes
  }, [calendarEventTypes, event?.eventTypeId, eventTypesById])
  const initialValues = useMemo<EventFormValues>(
    () => ({
      title: event?.title ?? '',
      description: event?.description ?? '',
      displayDetails: event?.displayDetails ?? '',
      date: event ? toLocalDateInput(event.startAt) : selectedDate,
      startTime: event ? toLocalTimeInput(event.startAt) : runtimeConfig.defaultEventStartTime,
      endTime: event ? toLocalTimeInput(event.endAt) : runtimeConfig.defaultEventEndTime,
      allDay: event?.allDay ?? false,
      color: event?.color ?? runtimeConfig.defaultEventColor,
      eventTypeId: event?.eventTypeId ?? defaultEventTypeId,
      recurrenceRule: event?.recurrenceRule,
      recurrenceScope: event?.masterId ? 'this' : 'all',
    }),
    [defaultEventTypeId, event, runtimeConfig, selectedDate],
  )

  const [values, setValues] = useState(initialValues)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isRecurringEdit = Boolean(event?.recurrenceRule || event?.masterId)

  async function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()
    setError(null)

    if (!values.title.trim()) {
      setError(t('event.titleRequired'))
      return
    }

    if (!values.allDay && values.endTime <= values.startTime) {
      setError(t('event.endAfterStart'))
      return
    }

    try {
      setIsSubmitting(true)
      await onSubmit({ ...values, title: values.title.trim() })
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('event.unableToSave'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div>
        <label className="block text-sm font-medium text-slate-700" htmlFor="event-title">
          {t('event.title')}
        </label>
        <input
          autoFocus
          className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
          id="event-title"
          onChange={(inputEvent) =>
            setValues((current) => ({ ...current, title: inputEvent.target.value }))
          }
          type="text"
          value={values.title}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700" htmlFor="event-description">
          {t('event.description')}
        </label>
        <textarea
          className="mt-1 min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
          id="event-description"
          onChange={(inputEvent) =>
            setValues((current) => ({ ...current, description: inputEvent.target.value }))
          }
          value={values.description}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700" htmlFor="event-display-details">
          {t('event.displayDetails')}
        </label>
        <textarea
          className="mt-1 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
          id="event-display-details"
          onChange={(inputEvent) =>
            setValues((current) => ({ ...current, displayDetails: inputEvent.target.value }))
          }
          value={values.displayDetails}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700" htmlFor="event-type">
          {t('event.type')}
        </label>
        <select
          className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
          id="event-type"
          onChange={(inputEvent) =>
            setValues((current) => ({ ...current, eventTypeId: inputEvent.target.value }))
          }
          value={values.eventTypeId}
        >
          {eventTypeOptions.length ? (
            eventTypeOptions.map((eventType) => (
              <option key={eventType.id} value={eventType.id}>
                {eventType.label}
              </option>
            ))
          ) : (
            <option value="general">{t('event.general')}</option>
          )}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="event-date">
            {t('event.date')}
          </label>
          <input
            className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
            id="event-date"
            onChange={(inputEvent) =>
              setValues((current) => ({ ...current, date: inputEvent.target.value }))
            }
            type="date"
            value={values.date}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="event-start-time">
            {t('event.startTime')}
          </label>
          <input
            className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100"
            disabled={values.allDay}
            id="event-start-time"
            onChange={(inputEvent) =>
              setValues((current) => ({ ...current, startTime: inputEvent.target.value }))
            }
            type="time"
            value={values.startTime}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="event-end-time">
            {t('event.endTime')}
          </label>
          <input
            className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100"
            disabled={values.allDay}
            id="event-end-time"
            onChange={(inputEvent) =>
              setValues((current) => ({ ...current, endTime: inputEvent.target.value }))
            }
            type="time"
            value={values.endTime}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700" htmlFor="event-all-day">
        <input
          checked={values.allDay}
          id="event-all-day"
          onChange={(inputEvent) =>
            setValues((current) => ({ ...current, allDay: inputEvent.target.checked }))
          }
          type="checkbox"
        />
        {t('event.allDay')}
      </label>

      <RecurrenceSelector
        onChange={(recurrenceRule) => setValues((current) => ({ ...current, recurrenceRule }))}
        startDate={values.date}
        value={values.recurrenceRule}
      />

      {isRecurringEdit ? (
        <fieldset className="space-y-2 rounded-md border border-slate-200 p-3">
          <legend className="px-1 text-sm font-medium text-slate-700">
            {t('event.applyChangesTo')}
          </legend>
          {[
            { value: 'this', label: t('event.thisEvent') },
            { value: 'following', label: t('event.thisAndFollowing') },
            { value: 'all', label: t('event.allEvents') },
          ].map((option) => (
            <label className="flex items-center gap-2 text-sm text-slate-700" key={option.value}>
              <input
                checked={values.recurrenceScope === option.value}
                name="recurrence-scope"
                onChange={() =>
                  setValues((current) => ({
                    ...current,
                    recurrenceScope: option.value as EventFormValues['recurrenceScope'],
                  }))
                }
                type="radio"
              />
              {option.label}
            </label>
          ))}
        </fieldset>
      ) : null}

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-between">
        <div>
          {event && onDelete ? (
            <Button onClick={() => onDelete(values.recurrenceScope ?? 'this')} variant="danger">
              {t('event.delete')}
            </Button>
          ) : null}
        </div>

        <div className="flex gap-2">
          <Button onClick={onCancel}>{t('event.cancel')}</Button>
          <Button disabled={isSubmitting} type="submit" variant="primary">
            {t('event.save')}
          </Button>
        </div>
      </div>
    </form>
  )
}
