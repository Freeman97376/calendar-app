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
import { configureUserSessionReset, useAuthStore } from './store/authStore'
import { configureRuntimeEnvironment, initializeRuntimeConfig } from './store/configStore'
import { configureEventSync } from './store/eventStore'
import { configureEventTypeService } from './store/eventTypeStore'
import { configureLongTermMemoryClient } from './store/longTermMemoryStore'
import { configureTodoService } from './store/todoStore'
import { configureToolPresetService } from './store/toolSessionStore'
import { resetUserSessionStores } from './store/resetUserSession'

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
      status: 'error',
    })
  }
  configureUserSessionReset(resetUserSessionStores)
  setApiUnauthorizedHandler(() => useAuthStore.getState().sessionExpired())
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
    authoritativePreferences: true,
    persistPreferences: true,
    serverManagedAI: bootstrap?.capabilities.serverManagedAI ?? false,
  })
  initializeRuntimeConfig(bootstrap?.preferences ?? {})

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void start()
