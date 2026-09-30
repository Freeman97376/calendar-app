import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import './index.css'
import { apiBaseUrl, authenticatedFetch, setApiUnauthorizedHandler } from './services/appApiClient'
import { CalendarApiClient } from './services/calendarApiClient'
import { ApiEventTypeService } from './services/eventTypes/apiEventTypeService'
import { LongTermMemoryClient } from './services/longTermMemoryClient'
import { ApiCalendarStorageAdapter } from './services/storage/apiCalendarStorageAdapter'
import { ApiTodoService } from './services/todos/apiTodoService'
import { ApiToolPresetService } from './services/toolSessions/apiToolPresetService'
import { configureDesktopRuntime } from './services/desktopRuntime'
import {
  configureUserSessionRefresh,
  configureUserSessionReset,
  useAuthStore,
} from './store/authStore'
import {
  configureRuntimeEnvironment,
  initializeRuntimeConfig,
  useConfigStore,
} from './store/configStore'
import { configureEventSync, useEventStore } from './store/eventStore'
import { configureEventTypeService, useEventTypeStore } from './store/eventTypeStore'
import { useFridgeStore } from './store/fridgeStore'
import { configureLongTermMemoryClient, useLongTermMemoryStore } from './store/longTermMemoryStore'
import { configureTodoService, useTodoStore } from './store/todoStore'
import { configureToolPresetService, useToolSessionStore } from './store/toolSessionStore'
import { resetUserSessionStores } from './store/resetUserSession'
import { restoreLatestAIConversation } from './store/aiStore'

function configureApiBackedServices() {
  const client = new CalendarApiClient(() => apiBaseUrl(), authenticatedFetch)
  configureEventSync(new ApiCalendarStorageAdapter(client))
  configureEventTypeService(new ApiEventTypeService(client))
  configureTodoService(new ApiTodoService(client))
  configureLongTermMemoryClient(
    new LongTermMemoryClient({ baseUrl: apiBaseUrl(), fetcher: authenticatedFetch }),
  )
  configureToolPresetService(new ApiToolPresetService())
}
async function refreshUserSessionStores() {
  const memory = useLongTermMemoryStore.getState()
  const jobs: Promise<unknown>[] = [
    useEventStore.getState().loadEvents({
      start: '0001-01-01T00:00:00.000Z',
      end: '9999-12-31T23:59:59.999Z',
    }),
    useEventTypeStore.getState().loadEventTypes(),
    useTodoStore.getState().loadTodos(),
    memory.loadOverview(),
    useToolSessionStore.getState().loadPresets(),
    useFridgeStore.getState().loadInventory(),
    restoreLatestAIConversation(),
  ]
  if (memory.selectedProjectId) jobs.push(memory.loadProjectDetails(memory.selectedProjectId))
  const results = await Promise.allSettled(jobs)
  if (results.some((result) => result.status === 'rejected')) {
    throw new Error('One or more account views could not be refreshed.')
  }
  window.dispatchEvent(new Event('calendar:session-restored'))
}

async function start() {
  let desktopRuntimeError: string | null = null
  try {
    const warning = await configureDesktopRuntime()
    if (warning) window.alert(warning)
  } catch (error) {
    desktopRuntimeError =
      error instanceof Error ? error.message : 'Unable to start the desktop backend.'
    useAuthStore.setState({
      error: desktopRuntimeError,
      status: 'startup-error',
    })
  }
  configureUserSessionReset(resetUserSessionStores)
  configureUserSessionRefresh(refreshUserSessionStores)
  setApiUnauthorizedHandler((reason) => useAuthStore.getState().sessionExpired(reason))
  configureApiBackedServices()

  let bootstrap = null
  if (!desktopRuntimeError) {
    try {
      bootstrap = await useAuthStore.getState().bootstrap()
    } catch {
      // The auth store renders the actionable connection error.
    }
  }

  configureRuntimeEnvironment({
    aiRuntime: bootstrap?.aiRuntime,
    authoritativePreferences: true,
    persistPreferences: true,
    serverManagedAI: bootstrap?.capabilities.serverManagedAI ?? true,
  })
  const preAuthLanguage = useConfigStore.getState().config.language
  initializeRuntimeConfig({
    ...(bootstrap?.preferences ?? {}),
    ...(!bootstrap || (bootstrap.authRequired && !bootstrap.user)
      ? { language: preAuthLanguage }
      : {}),
  })
  if (bootstrap?.user) await restoreLatestAIConversation()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void start()
