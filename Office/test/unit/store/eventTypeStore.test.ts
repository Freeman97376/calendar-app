import { beforeEach, describe, expect, it } from 'vitest'

import { LocalEventTypeService } from '../../../../src/services/eventTypes/localEventTypeService'
import { configureEventTypeService, useEventTypeStore } from '../../../../src/store/eventTypeStore'

describe('eventTypeStore', () => {
  beforeEach(() => {
    localStorage.clear()
    configureEventTypeService(new LocalEventTypeService(localStorage, 'test_event_types'))
    useEventTypeStore.getState().reset()
  })

  it('loads editable seeded event types', async () => {
    const eventTypes = await useEventTypeStore.getState().loadEventTypes()

    expect(eventTypes.map((eventType) => eventType.id)).toContain('general')
    expect(eventTypes.find((eventType) => eventType.id === 'project')).toMatchObject({
      appliesTo: 'both',
      label: 'Project',
    })
  })

  it('creates, updates, and archives event types', async () => {
    await useEventTypeStore.getState().loadEventTypes()

    const created = await useEventTypeStore.getState().createEventType({
      appliesTo: 'todo',
      color: '#0891b2',
      label: 'Client Work',
    })

    expect(created).toMatchObject({
      appliesTo: 'todo',
      id: 'client-work',
      label: 'Client Work',
    })

    const updated = await useEventTypeStore.getState().updateEventType(created.id, {
      appliesTo: 'both',
      label: 'Client Project',
    })

    expect(updated).toMatchObject({
      appliesTo: 'both',
      label: 'Client Project',
    })

    const archived = await useEventTypeStore.getState().archiveEventType(created.id)

    expect(archived.isArchived).toBe(true)
  })
})
