import { beforeEach, describe, expect, it } from 'vitest'

import { useUIStore } from '../../../src/store/uiStore'

describe('uiStore workspace panels', () => {
  beforeEach(() => {
    useUIStore.getState().reset()
  })

  it('opens workspace panels and returns through history', () => {
    useUIStore.getState().openWorkspacePanel('ai')
    useUIStore.getState().openWorkspacePanel('tools')

    expect(useUIStore.getState()).toMatchObject({
      activeWorkspacePanel: 'tools',
      aiPanelOpen: false,
      toolsPanelOpen: true,
      workspaceMainMode: 'panel',
      workspacePanelHistory: ['home', 'ai'],
    })

    useUIStore.getState().goBackWorkspacePanel()

    expect(useUIStore.getState()).toMatchObject({
      activeWorkspacePanel: 'ai',
      aiPanelOpen: true,
      toolsPanelOpen: false,
      workspaceMainMode: 'panel',
      workspacePanelHistory: ['home'],
    })
  })

  it('switches the main area between panel focus and calendar review', () => {
    useUIStore.getState().openWorkspacePanel('todos')

    expect(useUIStore.getState()).toMatchObject({
      activeWorkspacePanel: 'todos',
      workspaceMainMode: 'panel',
    })

    useUIStore.getState().showWorkspaceCalendar()

    expect(useUIStore.getState()).toMatchObject({
      activeWorkspacePanel: 'todos',
      workspaceMainMode: 'calendar',
    })

    useUIStore.getState().focusWorkspacePanel()

    expect(useUIStore.getState()).toMatchObject({
      activeWorkspacePanel: 'todos',
      workspaceMainMode: 'panel',
    })
  })

  it('opens event details for create and edit without opening the legacy modal', () => {
    useUIStore.getState().openCreateEventDetails('2026-06-29')

    expect(useUIStore.getState()).toMatchObject({
      activeWorkspacePanel: 'event-details',
      editingEventId: null,
      eventModalOpen: false,
      selectedDate: '2026-06-29',
      workspaceMainMode: 'calendar',
    })

    useUIStore.getState().openEventDetails('event_1')

    expect(useUIStore.getState()).toMatchObject({
      activeWorkspacePanel: 'event-details',
      editingEventId: 'event_1',
      eventModalOpen: false,
    })
  })
})
