import { getLocalTimeContext } from '../domain/logic/timeContext'
import { getConfiguredAIService, useAIStore } from '../store/aiStore'
import { useCalendarStore } from '../store/calendarStore'
import { useConfigStore } from '../store/configStore'
import { useEventStore } from '../store/eventStore'
import { useTodoStore } from '../store/todoStore'
import { useUIStore } from '../store/uiStore'

export function useDebugPanel() {
  const isOpen = useUIStore((state) => state.debugPanelOpen)
  const close = useUIStore((state) => state.closeDebugPanel)
  const toggle = useUIStore((state) => state.toggleDebugPanel)

  return { close, isOpen, toggle }
}

export function useDebugInfo() {
  const calendarView = useCalendarStore((state) => state.view)
  const focusedDate = useCalendarStore((state) => state.focusedDate)
  const events = useEventStore((state) => state.events)
  const eventError = useEventStore((state) => state.error)
  const todos = useTodoStore((state) => state.todos)
  const todoError = useTodoStore((state) => state.error)
  const config = useConfigStore((state) => state.config)
  const configError = useConfigStore((state) => state.error)
  const aiProvider = useAIStore((state) => state.provider)
  const aiModel = useAIStore((state) => state.model)
  const aiAvailable = useAIStore((state) => state.isAvailable)
  const aiLoading = useAIStore((state) => state.isLoading)
  const aiError = useAIStore((state) => state.error)
  const pendingActionPlan = useAIStore((state) => state.pendingActionPlan)
  const pendingSuggestion = useAIStore((state) => state.pendingSuggestion)
  const aiPanelOpen = useUIStore((state) => state.aiPanelOpen)
  const debugPanelOpen = useUIStore((state) => state.debugPanelOpen)
  const todoPanelOpen = useUIStore((state) => state.todoPanelOpen)
  const toolsPanelOpen = useUIStore((state) => state.toolsPanelOpen)
  const activeToolId = useUIStore((state) => state.activeToolId)
  const timeContext = getLocalTimeContext(new Date(), config.timezoneOverride)

  return {
    ai: {
      available: aiAvailable,
      error: aiError,
      loading: aiLoading,
      model: aiModel,
      pendingActions: pendingActionPlan?.actions.length ?? 0,
      pendingSuggestionSteps: pendingSuggestion?.steps.length ?? 0,
      provider: aiProvider,
      serviceConfigured: Boolean(getConfiguredAIService()),
      warnings: pendingActionPlan?.warnings.length ?? 0,
    },
    calendar: {
      focusedDate,
      view: calendarView,
    },
    config: {
      aiApiBaseUrl: config.aiApiBaseUrl,
      aiApiModel: config.aiApiModel,
      aiApiProfile: config.aiApiProfile,
      aiProvider: config.aiProvider,
      timezoneOverride: config.timezoneOverride || 'system',
    },
    counts: {
      doneTodos: todos.filter((todo) => todo.status === 'done').length,
      events: events.length,
      openTodos: todos.filter((todo) => todo.status !== 'done').length,
      todos: todos.length,
    },
    errors: [aiError, eventError, todoError, configError].filter(Boolean),
    time: timeContext,
    ui: {
      activeToolId,
      aiPanelOpen,
      debugPanelOpen,
      todoPanelOpen,
      toolsPanelOpen,
    },
  }
}
