import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  AIBreakdownResult,
  AICalendarActionPlan,
  AICalendarContext,
  AIConversationResult,
  AIEnabledToolRouteRequest,
  AIEnabledToolRouteResult,
  AIProgressToolRequest,
  AIProgressToolResult,
  AIToolActivationRequest,
  AIToolActivationResult,
  ToolSessionRequest,
  ToolSessionResult,
} from '../../../src/domain/types'
import type { AIConversationMessage, IAIService } from '../../../src/services/ai/IAIService'
import { configureAIService } from '../../../src/store/aiStore'
import {
  configureLongTermMemoryClient,
  useLongTermMemoryStore,
  type LongTermMemoryClientContract,
} from '../../../src/store/longTermMemoryStore'
import { useToolSessionStore } from '../../../src/store/toolSessionStore'
import type { CreateToolRunInput, LongTermToolRun } from '../../../src/domain/types/longTermMemory'

const request: ToolSessionRequest = {
  focusedDate: '2026-06-26',
  inputs: {
    focus: 'strength',
    start_date: '2026-06-27',
  },
  llmOptions: { provider: 'local' },
  outputSchemaKey: 'calendar_event_drafts',
  presetId: 'workout-planner',
  presetLabel: 'Workout Planner',
  prompt: 'Plan workouts.',
  today: '2026-06-26',
}

function result(warnings: string[] = []): ToolSessionResult {
  return {
    events: [
      {
        allDay: false,
        endAt: '2026-06-27T17:00:00.000Z',
        startAt: '2026-06-27T16:00:00.000Z',
        title: 'Strength workout',
      },
    ],
    summary: 'Generated a workout plan.',
    warnings,
  }
}

class MockAIService implements IAIService {
  constructor(private readonly runToolSessionImpl: () => Promise<ToolSessionResult>) {}

  isAvailable(): boolean {
    return true
  }

  async breakdownGoal(): Promise<AIBreakdownResult> {
    throw new Error('Not used')
  }

  async continueConversation(
    _messages: AIConversationMessage[],
    _context: AICalendarContext,
  ): Promise<AIConversationResult> {
    throw new Error('Not used')
  }

  async planCalendarActions(
    _command: string,
    _context: AICalendarContext,
  ): Promise<AICalendarActionPlan> {
    throw new Error('Not used')
  }

  async runToolSession(): Promise<ToolSessionResult> {
    return this.runToolSessionImpl()
  }

  async runProgressTool(_request: AIProgressToolRequest): Promise<AIProgressToolResult> {
    throw new Error('Not used')
  }

  async runToolActivation(_request: AIToolActivationRequest): Promise<AIToolActivationResult> {
    throw new Error('Not used')
  }

  async routeEnabledTool(_request: AIEnabledToolRouteRequest): Promise<AIEnabledToolRouteResult> {
    throw new Error('Not used')
  }
}

function toolRunFromInput(input: CreateToolRunInput): LongTermToolRun {
  return {
    created_at: '2026-06-26T00:00:00Z',
    error: input.error ?? '',
    goal_id: input.related_goal_id ?? null,
    id: 'toolrun_1',
    input: input.input ?? {},
    input_summary: input.input_summary ?? '',
    intent: input.intent ?? '',
    output: input.output ?? {},
    output_summary: input.output_summary ?? '',
    project_id: input.related_project_id ?? null,
    related_goal_id: input.related_goal_id ?? null,
    related_project_id: input.related_project_id ?? null,
    status: input.status ?? 'success',
    tool_name: input.tool_name,
    tool_run_id: 'toolrun_1',
    updated_at: '2026-06-26T00:00:00Z',
  }
}

describe('toolSessionStore tool run memory', () => {
  let createToolRun: ReturnType<typeof vi.fn>

  beforeEach(() => {
    createToolRun = vi.fn(async (input: CreateToolRunInput) => toolRunFromInput(input))
    configureLongTermMemoryClient({
      createToolRun,
      listToolRuns: vi.fn(async () => []),
      listToolRunsForProject: vi.fn(async () => []),
    } as unknown as LongTermMemoryClientContract)
    configureAIService(null)
    useLongTermMemoryStore.getState().reset()
    useLongTermMemoryStore.setState({
      selectedGoalId: 'goal_1',
      selectedProjectId: 'project_1',
    })
    useToolSessionStore.getState().reset()
  })

  it('records a successful tool session run', async () => {
    configureAIService(new MockAIService(async () => result()))

    await useToolSessionStore.getState().runSession(request)

    expect(createToolRun).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'Run Workout Planner',
        related_goal_id: 'goal_1',
        related_project_id: 'project_1',
        status: 'success',
        tool_name: 'Workout Planner',
      }),
    )
    expect(createToolRun.mock.calls[0][0].output_summary).toContain('Generated a workout plan.')
  })

  it('records warnings as needing user confirmation', async () => {
    configureAIService(new MockAIService(async () => result(['Review generated times.'])))

    await useToolSessionStore.getState().runSession(request)

    expect(createToolRun).toHaveBeenCalledWith(
      expect.objectContaining({
        output_summary: expect.stringContaining('Review generated times.'),
        status: 'needs_user_confirmation',
      }),
    )
  })

  it('records a failed tool session run without swallowing the original error', async () => {
    configureAIService(
      new MockAIService(async () => {
        throw new Error('Planner failed')
      }),
    )

    await expect(useToolSessionStore.getState().runSession(request)).rejects.toThrow('Planner failed')

    expect(createToolRun).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Planner failed',
        output_summary: 'Tool session failed: Planner failed',
        status: 'failed',
      }),
    )
  })
})
