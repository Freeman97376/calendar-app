import { afterEach, describe, expect, it } from 'vitest'

import { useAIStore } from '../../../src/store/aiStore'
import { useCalendarStore } from '../../../src/store/calendarStore'
import { useDataPortabilityStore } from '../../../src/store/dataPortabilityStore'
import { useEventStore } from '../../../src/store/eventStore'
import { resetUserSessionStores } from '../../../src/store/resetUserSession'
import { useUIStore } from '../../../src/store/uiStore'

afterEach(() => resetUserSessionStores())

describe('resetUserSessionStores', () => {
  it('clears user data, AI drafts, import status, and account-specific UI state', () => {
    useEventStore.setState({
      events: [{ id: 'private-event' }] as never,
      error: 'old error',
      isLoading: true,
    })
    useAIStore.setState({
      error: 'old AI error',
      isLoading: true,
      messages: [{ id: 'private-message', role: 'user', content: 'private', timestamp: 'now' }],
      pendingEnabledToolRoute: {
        confidence: 1,
        instanceAlias: 'Private goal',
        originalMessage: 'private',
        projectId: 'private-project',
        reason: 'private',
        rewrittenInstruction: 'private',
        toolName: 'Goal Planner',
      },
    })
    useDataPortabilityStore.setState({ error: 'private import', isBusy: true, status: 'done' })
    useUIStore.setState({
      activeEnabledToolProjectId: 'private-project',
      activeWorkspacePanel: 'enabled-tools',
      approvalDrawerOpen: true,
      approvalDrawerSource: 'active-tool-calendar-drafts',
    })
    useCalendarStore.setState({ focusedDate: '2030-01-01', view: 'week' })

    resetUserSessionStores({ aiUsageMode: 'economy' })

    expect(useEventStore.getState().events).toEqual([])
    expect(useAIStore.getState().messages).toEqual([])
    expect(useAIStore.getState().pendingEnabledToolRoute).toBeNull()
    expect(useDataPortabilityStore.getState()).toMatchObject({
      error: null,
      isBusy: false,
      status: null,
    })
    expect(useUIStore.getState()).toMatchObject({
      activeEnabledToolProjectId: '',
      activeWorkspacePanel: 'home',
      approvalDrawerOpen: false,
      approvalDrawerSource: null,
    })
    expect(useCalendarStore.getState().view).toBe('month')
  })
})
