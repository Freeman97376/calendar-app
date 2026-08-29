import { useEvents } from '../../hooks/useEvents'
import type { RecurrenceEditScope } from '../../hooks/useEvents'
import { useI18n } from '../../hooks/useI18n'
import EventForm from './EventForm'

export default function EventDetailsPanel() {
  const { t } = useI18n()
  const {
    editingEvent,
    selectedDate,
    selectedEndTime,
    selectedStartTime,
    closeEventModal,
    saveEvent,
    deleteEditingEvent,
  } = useEvents()

  async function handleDelete(scope: RecurrenceEditScope) {
    if (!window.confirm(t('event.deleteConfirm'))) return
    await deleteEditingEvent(scope)
  }

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
      <div>
        <h2 className="text-base font-semibold text-slate-950">
          {editingEvent ? t('event.editTitle') : t('event.createTitle')}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {editingEvent ? t('event.editDescription') : t('event.createDescription')}
        </p>
      </div>
      <EventForm
        event={editingEvent}
        key={
          editingEvent?.id ??
          `new-${selectedDate}-${selectedStartTime ?? 'default'}-${selectedEndTime ?? 'default'}`
        }
        onCancel={closeEventModal}
        onDelete={editingEvent ? handleDelete : undefined}
        onSubmit={saveEvent}
        selectedDate={selectedDate}
        selectedEndTime={selectedEndTime}
        selectedStartTime={selectedStartTime}
      />
    </div>
  )
}
