import { create } from 'zustand'

import { todayISODate } from '../domain/logic/dateHelpers'
import type { Event } from '../domain/types'

export type UIStore = {
  eventModalOpen: boolean
  editingEventId: string | null
  editingEventSnapshot: Event | null
  selectedDate: string
  aiPanelOpen: boolean
  debugPanelOpen: boolean
  fridgePanelOpen: boolean
  todoPanelOpen: boolean
  toolsPanelOpen: boolean
  activeToolId: string
  closeDebugPanel: () => void
  closeToolsPanel: () => void
  openAIPanel: () => void
  openCreateEventModal: (selectedDate: string) => void
  openEditEventModal: (eventId: string, eventSnapshot?: Event) => void
  closeEventModal: () => void
  closeTodoPanel: () => void
  toggleAIPanel: () => void
  toggleDebugPanel: () => void
  toggleFridgePanel: () => void
  toggleTodoPanel: () => void
  openToolsPanel: (activeToolId?: string) => void
  setActiveToolId: (activeToolId: string) => void
  toggleToolsPanel: () => void
  reset: () => void
}

export const useUIStore = create<UIStore>((set) => ({
  eventModalOpen: false,
  editingEventId: null,
  editingEventSnapshot: null,
  selectedDate: todayISODate(),
  aiPanelOpen: false,
  debugPanelOpen: false,
  fridgePanelOpen: false,
  todoPanelOpen: false,
  toolsPanelOpen: false,
  activeToolId: 'settings',
  closeDebugPanel: () => set({ debugPanelOpen: false }),
  closeToolsPanel: () => set({ toolsPanelOpen: false }),
  openAIPanel: () =>
    set({
      aiPanelOpen: true,
      fridgePanelOpen: false,
      todoPanelOpen: false,
      toolsPanelOpen: false,
    }),
  openCreateEventModal: (selectedDate) =>
    set({
      eventModalOpen: true,
      editingEventId: null,
      editingEventSnapshot: null,
      selectedDate,
    }),
  openEditEventModal: (eventId, eventSnapshot = undefined) =>
    set({
      eventModalOpen: true,
      editingEventId: eventId,
      editingEventSnapshot: eventSnapshot ?? null,
    }),
  closeEventModal: () =>
    set({
      eventModalOpen: false,
      editingEventId: null,
      editingEventSnapshot: null,
    }),
  closeTodoPanel: () => set({ todoPanelOpen: false }),
  toggleAIPanel: () =>
    set((state) => ({
      aiPanelOpen: !state.aiPanelOpen,
      fridgePanelOpen: false,
      todoPanelOpen: false,
      toolsPanelOpen: false,
    })),
  toggleDebugPanel: () =>
    set((state) => ({
      debugPanelOpen: !state.debugPanelOpen,
    })),
  toggleFridgePanel: () =>
    set((state) => ({
      aiPanelOpen: false,
      fridgePanelOpen: !state.fridgePanelOpen,
      todoPanelOpen: false,
      toolsPanelOpen: false,
    })),
  toggleTodoPanel: () =>
    set((state) => ({
      aiPanelOpen: false,
      fridgePanelOpen: false,
      todoPanelOpen: !state.todoPanelOpen,
      toolsPanelOpen: false,
    })),
  openToolsPanel: (activeToolId = 'settings') =>
    set({
      aiPanelOpen: false,
      fridgePanelOpen: false,
      todoPanelOpen: false,
      toolsPanelOpen: true,
      activeToolId,
    }),
  setActiveToolId: (activeToolId) =>
    set({
      activeToolId,
    }),
  toggleToolsPanel: () =>
    set((state) => ({
      aiPanelOpen: false,
      fridgePanelOpen: false,
      todoPanelOpen: false,
      toolsPanelOpen: !state.toolsPanelOpen,
    })),
  reset: () =>
    set({
      eventModalOpen: false,
      editingEventId: null,
      editingEventSnapshot: null,
      selectedDate: todayISODate(),
      aiPanelOpen: false,
      debugPanelOpen: false,
      fridgePanelOpen: false,
      todoPanelOpen: false,
      toolsPanelOpen: false,
      activeToolId: 'settings',
    }),
}))
