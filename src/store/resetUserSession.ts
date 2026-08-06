import { useAIStore } from './aiStore'
import { useCalendarStore } from './calendarStore'
import { initializeRuntimeConfig } from './configStore'
import { useDataPortabilityStore } from './dataPortabilityStore'
import { useEventStore } from './eventStore'
import { useEventTypeStore } from './eventTypeStore'
import { useFridgeStore } from './fridgeStore'
import { useLongTermMemoryStore } from './longTermMemoryStore'
import { useTodoStore } from './todoStore'
import { useToolSessionStore } from './toolSessionStore'
import { useUIStore } from './uiStore'

export function resetUserSessionStores(preferences: Record<string, unknown> = {}) {
  useCalendarStore.getState().reset()
  useEventStore.getState().reset()
  useEventTypeStore.getState().reset()
  useTodoStore.getState().reset()
  useLongTermMemoryStore.getState().reset()
  useFridgeStore.getState().reset()
  useToolSessionStore.getState().reset()
  useAIStore.getState().reset()
  useDataPortabilityStore.getState().reset()
  useUIStore.getState().reset()
  initializeRuntimeConfig(preferences)
}
