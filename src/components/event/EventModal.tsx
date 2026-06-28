import { useEvents } from '../../hooks/useEvents'
import type { RecurrenceEditScope } from '../../hooks/useEvents'
import EventForm from './EventForm'
import Modal from '../ui/Modal'

export default function EventModal() {
  const {
    eventModalOpen,
    editingEvent,
    selectedDate,
    closeEventModal,
    saveEvent,
    deleteEditingEvent,
  } = useEvents()

  async function handleDelete(scope: RecurrenceEditScope) {
    if (!window.confirm('Delete this event?')) return
    await deleteEditingEvent(scope)
  }

  return (
    <Modal
      isOpen={eventModalOpen}
      onClose={closeEventModal}
      title={editingEvent ? 'Edit event' : 'Create event'}
    >
      <EventForm
        event={editingEvent}
        onCancel={closeEventModal}
        onDelete={editingEvent ? handleDelete : undefined}
        onSubmit={saveEvent}
        selectedDate={selectedDate}
      />
    </Modal>
  )
}
