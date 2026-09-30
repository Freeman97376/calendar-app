import { create } from 'zustand'
import type { AIPlanRecord } from '../domain/schemas/aiPlanReview.schema'
import type { CalendarBatchAction } from '../domain/schemas/calendarActionBatch.schema'

import { todayISODate } from '../domain/logic/dateHelpers'
import type { AICalendarActionPlan, AIProgressToolEventDraft, Event } from '../domain/types'
import type { ActiveToolOnboardingSeed } from '../domain/types/goalControl'

export type WorkspacePanelId =
  | 'home'
  | 'ai'
  | 'todos'
  | 'tools'
  | 'enabled-tools'
  | 'settings'
  | 'debug'
  | 'event-details'

export type WorkspaceMainMode = 'calendar' | 'panel'
export type ApprovalDrawerSource = 'ai-action-plan' | 'active-tool-calendar-drafts'
export type ApprovalDrawerOpenInput =
  | {
      plan: AICalendarActionPlan
      record?: AIPlanRecord
      applyActions?: CalendarBatchAction[]
      taskActions?: CalendarBatchAction[]
      sessionEpoch?: number
      source: 'ai-action-plan'
    }
  | {
      drafts: AIProgressToolEventDraft[]
      projectId: string
      source: 'active-tool-calendar-drafts'
      toolName: string
      toolRunId: string
    }
export type ApprovalDrawerContext =
  | (Extract<ApprovalDrawerOpenInput, { source: 'ai-action-plan' }> & {
      idempotencyKey: string
    })
  | (Extract<ApprovalDrawerOpenInput, { source: 'active-tool-calendar-drafts' }> & {
      idempotencyKey: string
    })

type WorkspaceOpenOptions = {
  mainMode?: WorkspaceMainMode
  replace?: boolean
}

export type EventCreationTimeRange = {
  endTime: string
  startTime: string
}

export type UIStore = {
  eventModalOpen: boolean
  editingEventId: string | null
  editingEventSnapshot: Event | null
  selectedDate: string
  selectedEndTime: string | null
  selectedStartTime: string | null
  aiPanelOpen: boolean
  debugPanelOpen: boolean
  fridgePanelOpen: boolean
  todoPanelOpen: boolean
  toolsPanelOpen: boolean
  enabledToolsPanelOpen: boolean
  activeWorkspacePanel: WorkspacePanelId
  workspaceMainMode: WorkspaceMainMode
  workspacePanelHistory: WorkspacePanelId[]
  approvalDrawerOpen: boolean
  approvalDrawerContext: ApprovalDrawerContext | null
  approvalDrawerSource: ApprovalDrawerSource | null
  activeToolId: string
  activeEnabledToolProjectId: string
  pendingActiveToolOnboarding: ActiveToolOnboardingSeed | null
  closeDebugPanel: () => void
  closeEnabledToolsPanel: () => void
  closeToolsPanel: () => void
  openAIPanel: () => void
  openCreateEventModal: (selectedDate: string, timeRange?: EventCreationTimeRange) => void
  openCreateEventDetails: (selectedDate: string, timeRange?: EventCreationTimeRange) => void
  openEditEventModal: (eventId: string, eventSnapshot?: Event) => void
  openEventDetails: (eventId: string, eventSnapshot?: Event) => void
  closeEventModal: () => void
  closeApprovalDrawer: () => void
  closeTodoPanel: () => void
  closeWorkspacePanel: () => void
  focusWorkspacePanel: () => void
  goBackWorkspacePanel: () => void
  openEnabledToolsPanel: (projectId?: string) => void
  openApprovalDrawer: (input: ApprovalDrawerOpenInput) => void
  openWorkspacePanel: (panel: WorkspacePanelId, options?: WorkspaceOpenOptions) => void
  showWorkspaceCalendar: () => void
  toggleAIPanel: () => void
  toggleDebugPanel: () => void
  toggleEnabledToolsPanel: () => void
  toggleFridgePanel: () => void
  toggleTodoPanel: () => void
  openToolsPanel: (activeToolId?: string) => void
  setActiveEnabledToolProjectId: (projectId: string) => void
  setActiveToolId: (activeToolId: string) => void
  startActiveToolOnboarding: (seed: ActiveToolOnboardingSeed) => void
  clearActiveToolOnboarding: () => void
  toggleToolsPanel: () => void
  reset: () => void
}

function panelFlags(panel: WorkspacePanelId) {
  return {
    aiPanelOpen: panel === 'ai',
    debugPanelOpen: panel === 'debug',
    enabledToolsPanelOpen: panel === 'enabled-tools',
    fridgePanelOpen: false,
    todoPanelOpen: panel === 'todos',
    toolsPanelOpen: panel === 'tools' || panel === 'settings',
  }
}

function nextHistory(
  currentPanel: WorkspacePanelId,
  currentHistory: WorkspacePanelId[],
  nextPanel: WorkspacePanelId,
  replace = false,
): WorkspacePanelId[] {
  if (nextPanel === 'home') return []
  if (replace || currentPanel === nextPanel) return currentHistory

  return [...currentHistory, currentPanel]
}

function workspaceState(
  panel: WorkspacePanelId,
  history: WorkspacePanelId[] = [],
  mainMode: WorkspaceMainMode = panel === 'home' || panel === 'event-details'
    ? 'calendar'
    : 'panel',
) {
  return {
    ...panelFlags(panel),
    activeWorkspacePanel: panel,
    eventModalOpen: false,
    workspaceMainMode: mainMode,
    workspacePanelHistory: history,
  }
}

function lastPanel(history: WorkspacePanelId[]): WorkspacePanelId | undefined {
  return history.length ? history[history.length - 1] : undefined
}

export const useUIStore = create<UIStore>((set) => ({
  eventModalOpen: false,
  editingEventId: null,
  editingEventSnapshot: null,
  selectedDate: todayISODate(),
  selectedEndTime: null,
  selectedStartTime: null,
  aiPanelOpen: false,
  debugPanelOpen: false,
  fridgePanelOpen: false,
  todoPanelOpen: false,
  toolsPanelOpen: false,
  enabledToolsPanelOpen: false,
  activeWorkspacePanel: 'home',
  workspaceMainMode: 'calendar',
  workspacePanelHistory: [],
  approvalDrawerOpen: false,
  approvalDrawerContext: null,
  approvalDrawerSource: null,
  activeToolId: 'fitness-ai',
  activeEnabledToolProjectId: '',
  pendingActiveToolOnboarding: null,
  closeDebugPanel: () => set(workspaceState('home')),
  closeEnabledToolsPanel: () => set(workspaceState('home')),
  closeToolsPanel: () => set(workspaceState('home')),
  openAIPanel: () =>
    set((state) =>
      workspaceState(
        'ai',
        nextHistory(state.activeWorkspacePanel, state.workspacePanelHistory, 'ai'),
      ),
    ),
  startActiveToolOnboarding: (pendingActiveToolOnboarding) =>
    set((state) => ({
      ...workspaceState(
        'ai',
        nextHistory(state.activeWorkspacePanel, state.workspacePanelHistory, 'ai'),
      ),
      pendingActiveToolOnboarding,
    })),
  clearActiveToolOnboarding: () => set({ pendingActiveToolOnboarding: null }),
  openCreateEventDetails: (selectedDate, timeRange) =>
    set((state) => ({
      ...workspaceState(
        'event-details',
        nextHistory(state.activeWorkspacePanel, state.workspacePanelHistory, 'event-details'),
      ),
      editingEventId: null,
      editingEventSnapshot: null,
      selectedDate,
      selectedEndTime: timeRange?.endTime ?? null,
      selectedStartTime: timeRange?.startTime ?? null,
    })),
  openCreateEventModal: (selectedDate, timeRange) =>
    set((state) => ({
      ...workspaceState(
        'event-details',
        nextHistory(state.activeWorkspacePanel, state.workspacePanelHistory, 'event-details'),
      ),
      editingEventId: null,
      editingEventSnapshot: null,
      selectedDate,
      selectedEndTime: timeRange?.endTime ?? null,
      selectedStartTime: timeRange?.startTime ?? null,
    })),
  openEventDetails: (eventId, eventSnapshot = undefined) =>
    set((state) => ({
      ...workspaceState(
        'event-details',
        nextHistory(state.activeWorkspacePanel, state.workspacePanelHistory, 'event-details'),
      ),
      editingEventId: eventId,
      editingEventSnapshot: eventSnapshot ?? null,
      selectedEndTime: null,
      selectedStartTime: null,
    })),
  openEditEventModal: (eventId, eventSnapshot = undefined) =>
    set((state) => ({
      ...workspaceState(
        'event-details',
        nextHistory(state.activeWorkspacePanel, state.workspacePanelHistory, 'event-details'),
      ),
      editingEventId: eventId,
      editingEventSnapshot: eventSnapshot ?? null,
      selectedEndTime: null,
      selectedStartTime: null,
    })),
  closeEventModal: () =>
    set((state) => {
      const previous = lastPanel(state.workspacePanelHistory) ?? 'home'
      const history = state.workspacePanelHistory.slice(0, -1)

      return {
        ...workspaceState(previous, history),
        editingEventId: null,
        editingEventSnapshot: null,
        selectedEndTime: null,
        selectedStartTime: null,
      }
    }),
  closeApprovalDrawer: () =>
    set({
      approvalDrawerContext: null,
      approvalDrawerOpen: false,
      approvalDrawerSource: null,
    }),
  closeTodoPanel: () => set(workspaceState('home')),
  closeWorkspacePanel: () => set(workspaceState('home')),
  focusWorkspacePanel: () =>
    set((state) => ({
      workspaceMainMode: state.activeWorkspacePanel === 'home' ? 'calendar' : 'panel',
    })),
  goBackWorkspacePanel: () =>
    set((state) => {
      const previous = lastPanel(state.workspacePanelHistory) ?? 'home'
      const history = state.workspacePanelHistory.slice(0, -1)

      return workspaceState(previous, history)
    }),
  openEnabledToolsPanel: (projectId = '') =>
    set((state) => ({
      ...workspaceState(
        'enabled-tools',
        nextHistory(state.activeWorkspacePanel, state.workspacePanelHistory, 'enabled-tools'),
      ),
      activeEnabledToolProjectId: projectId || state.activeEnabledToolProjectId,
    })),
  openApprovalDrawer: (input) =>
    set({
      approvalDrawerContext: {
        ...JSON.parse(JSON.stringify(input)),
        idempotencyKey: `approval-${
          globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
        }`.slice(0, 120),
      } as ApprovalDrawerContext,
      approvalDrawerOpen: true,
      approvalDrawerSource: input.source,
      workspaceMainMode: 'calendar',
    }),
  openToolsPanel: (activeToolId = 'fitness-ai') =>
    set((state) => ({
      ...workspaceState(
        activeToolId === 'settings' ? 'settings' : 'tools',
        nextHistory(
          state.activeWorkspacePanel,
          state.workspacePanelHistory,
          activeToolId === 'settings' ? 'settings' : 'tools',
        ),
      ),
      activeToolId,
    })),
  openWorkspacePanel: (panel, options = {}) =>
    set((state) =>
      workspaceState(
        panel,
        nextHistory(
          state.activeWorkspacePanel,
          state.workspacePanelHistory,
          panel,
          options.replace,
        ),
        options.mainMode,
      ),
    ),
  setActiveEnabledToolProjectId: (activeEnabledToolProjectId) =>
    set({
      activeEnabledToolProjectId,
    }),
  setActiveToolId: (activeToolId) =>
    set({
      activeToolId,
    }),
  showWorkspaceCalendar: () => set({ workspaceMainMode: 'calendar' }),
  toggleAIPanel: () =>
    set((state) =>
      state.activeWorkspacePanel === 'ai'
        ? workspaceState('home')
        : workspaceState(
            'ai',
            nextHistory(state.activeWorkspacePanel, state.workspacePanelHistory, 'ai'),
          ),
    ),
  toggleDebugPanel: () =>
    set((state) =>
      state.activeWorkspacePanel === 'debug'
        ? workspaceState('home')
        : workspaceState(
            'debug',
            nextHistory(state.activeWorkspacePanel, state.workspacePanelHistory, 'debug'),
          ),
    ),
  toggleEnabledToolsPanel: () =>
    set((state) =>
      state.activeWorkspacePanel === 'enabled-tools'
        ? workspaceState('home')
        : workspaceState(
            'enabled-tools',
            nextHistory(state.activeWorkspacePanel, state.workspacePanelHistory, 'enabled-tools'),
          ),
    ),
  toggleFridgePanel: () =>
    set((state) =>
      state.activeWorkspacePanel === 'tools'
        ? workspaceState('home')
        : {
            ...workspaceState(
              'tools',
              nextHistory(state.activeWorkspacePanel, state.workspacePanelHistory, 'tools'),
            ),
            activeToolId: 'fridge',
          },
    ),
  toggleTodoPanel: () =>
    set((state) =>
      state.activeWorkspacePanel === 'todos'
        ? workspaceState('home')
        : workspaceState(
            'todos',
            nextHistory(state.activeWorkspacePanel, state.workspacePanelHistory, 'todos'),
          ),
    ),
  toggleToolsPanel: () =>
    set((state) =>
      state.activeWorkspacePanel === 'tools'
        ? workspaceState('home')
        : workspaceState(
            'tools',
            nextHistory(state.activeWorkspacePanel, state.workspacePanelHistory, 'tools'),
          ),
    ),
  reset: () =>
    set({
      eventModalOpen: false,
      editingEventId: null,
      editingEventSnapshot: null,
      selectedDate: todayISODate(),
      selectedEndTime: null,
      selectedStartTime: null,
      aiPanelOpen: false,
      debugPanelOpen: false,
      fridgePanelOpen: false,
      todoPanelOpen: false,
      toolsPanelOpen: false,
      enabledToolsPanelOpen: false,
      activeWorkspacePanel: 'home',
      workspaceMainMode: 'calendar',
      workspacePanelHistory: [],
      approvalDrawerOpen: false,
      approvalDrawerContext: null,
      approvalDrawerSource: null,
      activeToolId: 'fitness-ai',
      activeEnabledToolProjectId: '',
      pendingActiveToolOnboarding: null,
    }),
}))
