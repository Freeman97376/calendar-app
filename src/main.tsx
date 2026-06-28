import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import './index.css'
import { createDefaultEventTypeService } from './services/eventTypes/defaultEventTypeService'
import { createDefaultSyncManager } from './services/sync/defaultSyncManager'
import { createDefaultTodoService } from './services/todos/defaultTodoService'
import { initializeRuntimeConfig } from './store/configStore'
import { configureEventSync } from './store/eventStore'
import { configureEventTypeService } from './store/eventTypeStore'
import { configureTodoService } from './store/todoStore'

initializeRuntimeConfig()
configureEventSync(createDefaultSyncManager())
configureEventTypeService(createDefaultEventTypeService())
configureTodoService(createDefaultTodoService())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
