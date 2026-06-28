import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import App from '../../src/App'
import type {
  ActionItemStatus,
  CreateActionItemInput,
  CreateGoalInput,
  CreateMilestoneInput,
  CreateProgressLogInput,
  CreateProjectInput,
  CreateToolRunInput,
  GoalStatus,
  LongTermActionItem,
  LongTermGoal,
  LongTermMilestone,
  LongTermProgressLog,
  LongTermProject,
  LongTermToolRun,
  MilestoneStatus,
  ProjectStatus,
} from '../../src/domain/types/longTermMemory'
import { RuntimeConfigService, BackendConfigApiService } from '../../src/services/config/runtimeConfigService'
import { LocalEventTypeService } from '../../src/services/eventTypes/localEventTypeService'
import { configureConfigServices, useConfigStore } from '../../src/store/configStore'
import { configureEventTypeService, useEventTypeStore } from '../../src/store/eventTypeStore'
import {
  configureLongTermMemoryClient,
  useLongTermMemoryStore,
  type LongTermMemoryClientContract,
} from '../../src/store/longTermMemoryStore'
import { useUIStore } from '../../src/store/uiStore'

function backendStatusResponse() {
  return new Response(
    JSON.stringify({
      success: true,
      deepseek: {
        configured: false,
        base_url: 'https://api.deepseek.com',
        model: 'deepseek-chat',
      },
      fridge: {
        data_dir: 'test-fridge-data',
      },
    }),
    {
      headers: { 'content-type': 'application/json' },
      status: 200,
    },
  )
}

function timestamp() {
  return '2026-06-26T00:00:00Z'
}

class MockLongTermMemoryClient implements LongTermMemoryClientContract {
  actions: LongTermActionItem[] = []
  goals: LongTermGoal[] = []
  milestones: LongTermMilestone[] = []
  progress: LongTermProgressLog[] = []
  projects: LongTermProject[] = []
  toolRuns: LongTermToolRun[] = []

  async createAction(input: CreateActionItemInput): Promise<LongTermActionItem> {
    const action: LongTermActionItem = {
      action_id: `action_${this.actions.length + 1}`,
      created_at: timestamp(),
      description: input.description ?? '',
      due_date: input.due_date ?? null,
      metadata: {},
      milestone_id: input.milestone_id ?? null,
      project_id: input.project_id,
      status: input.status ?? 'todo',
      title: input.title,
      updated_at: timestamp(),
    }
    this.actions = [action, ...this.actions]
    return action
  }

  async createGoal(input: CreateGoalInput): Promise<LongTermGoal> {
    const goal: LongTermGoal = {
      created_at: timestamp(),
      description: input.description ?? '',
      goal_id: `goal_${this.goals.length + 1}`,
      metadata: {},
      status: input.status ?? 'active',
      title: input.title,
      updated_at: timestamp(),
    }
    this.goals = [goal, ...this.goals]
    return goal
  }

  async createMilestone(input: CreateMilestoneInput): Promise<LongTermMilestone> {
    const milestone: LongTermMilestone = {
      created_at: timestamp(),
      description: input.description ?? '',
      due_date: input.due_date ?? null,
      metadata: {},
      milestone_id: `milestone_${this.milestones.length + 1}`,
      project_id: input.project_id,
      status: input.status ?? 'not_started',
      title: input.title,
      updated_at: timestamp(),
    }
    this.milestones = [milestone, ...this.milestones]
    return milestone
  }

  async createProgress(input: CreateProgressLogInput): Promise<LongTermProgressLog> {
    const progress: LongTermProgressLog = {
      action_id: input.action_id ?? null,
      created_at: timestamp(),
      details: input.details ?? '',
      goal_id: input.goal_id ?? null,
      log_type: input.log_type ?? 'update',
      metadata: {},
      progress_id: `progress_${this.progress.length + 1}`,
      project_id: input.project_id,
      summary: input.summary,
      updated_at: timestamp(),
    }
    this.progress = [progress, ...this.progress]
    return progress
  }

  async createProject(input: CreateProjectInput): Promise<LongTermProject> {
    const project: LongTermProject = {
      created_at: timestamp(),
      description: input.description ?? '',
      goal_id: input.goal_id,
      metadata: {},
      project_id: `project_${this.projects.length + 1}`,
      status: input.status ?? 'active',
      title: input.title,
      updated_at: timestamp(),
    }
    this.projects = [project, ...this.projects]
    return project
  }

  async createToolRun(input: CreateToolRunInput): Promise<LongTermToolRun> {
    const toolRun: LongTermToolRun = {
      created_at: timestamp(),
      error: input.error ?? '',
      goal_id: input.related_goal_id ?? null,
      id: `toolrun_${this.toolRuns.length + 1}`,
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
      tool_run_id: `toolrun_${this.toolRuns.length + 1}`,
      updated_at: timestamp(),
    }
    this.toolRuns = [toolRun, ...this.toolRuns]
    return toolRun
  }

  async listActions(projectId: string): Promise<LongTermActionItem[]> {
    return this.actions.filter((action) => action.project_id === projectId)
  }

  async listGoals(): Promise<LongTermGoal[]> {
    return this.goals
  }

  async listMilestones(projectId: string): Promise<LongTermMilestone[]> {
    return this.milestones.filter((milestone) => milestone.project_id === projectId)
  }

  async listProgress(projectId: string): Promise<LongTermProgressLog[]> {
    return this.progress.filter((entry) => entry.project_id === projectId)
  }

  async listProjects(): Promise<LongTermProject[]> {
    return this.projects
  }

  async listToolRuns(): Promise<LongTermToolRun[]> {
    return this.toolRuns
  }

  async listToolRunsForProject(projectId: string): Promise<LongTermToolRun[]> {
    return this.toolRuns.filter((toolRun) => toolRun.related_project_id === projectId)
  }

  async updateAction(actionId: string, changes: { status?: ActionItemStatus }) {
    const updated = this.actions.find((action) => action.action_id === actionId)
    if (!updated) throw new Error('Missing action')
    Object.assign(updated, changes, { updated_at: timestamp() })
    return updated
  }

  async updateGoal(goalId: string, changes: { status?: GoalStatus }) {
    const updated = this.goals.find((goal) => goal.goal_id === goalId)
    if (!updated) throw new Error('Missing goal')
    Object.assign(updated, changes, { updated_at: timestamp() })
    return updated
  }

  async updateMilestone(milestoneId: string, changes: { status?: MilestoneStatus }) {
    const updated = this.milestones.find((milestone) => milestone.milestone_id === milestoneId)
    if (!updated) throw new Error('Missing milestone')
    Object.assign(updated, changes, { updated_at: timestamp() })
    return updated
  }

  async updateProject(projectId: string, changes: { status?: ProjectStatus }) {
    const updated = this.projects.find((project) => project.project_id === projectId)
    if (!updated) throw new Error('Missing project')
    Object.assign(updated, changes, { updated_at: timestamp() })
    return updated
  }
}

describe('Goal Planner tool', () => {
  beforeEach(() => {
    localStorage.clear()
    configureConfigServices(
      new RuntimeConfigService(localStorage, 'test_goal_planner_runtime_config'),
      new BackendConfigApiService(
        () => 'http://test.local',
        async () => backendStatusResponse(),
      ),
    )
    configureEventTypeService(new LocalEventTypeService(localStorage, 'test_goal_planner_types'))
    configureLongTermMemoryClient(new MockLongTermMemoryClient())
    useConfigStore.getState().reset()
    useEventTypeStore.getState().reset()
    useLongTermMemoryStore.getState().reset()
    useUIStore.getState().reset()
  })

  it('creates a goal, project, milestone, action item, and progress log', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Tools' }))
    await user.click(screen.getByRole('button', { name: 'Goal Planner' }))

    expect(screen.getByRole('heading', { name: 'Goal Planner' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Goal title'), 'Launch AI planning')
    await user.type(screen.getByLabelText('Goal description'), 'Manage durable project memory')
    await user.click(screen.getByRole('button', { name: 'Create goal' }))

    expect(await screen.findByText('Created goal Launch AI planning')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Goal status for Launch AI planning'), 'paused')

    await user.type(screen.getByLabelText('Project title'), 'Planner MVP')
    await user.type(screen.getByLabelText('Project description'), 'Local memory foundation')
    await user.click(screen.getByRole('button', { name: 'Create project' }))

    expect(await screen.findByText('Created project Planner MVP')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Project status for Planner MVP'), 'completed')

    await act(async () => {
      await useLongTermMemoryStore.getState().createToolRun({
        intent: 'Run Workout Planner',
        output_summary: 'Generated 3 workout event drafts.',
        related_project_id: useLongTermMemoryStore.getState().selectedProjectId,
        status: 'needs_user_confirmation',
        tool_name: 'Workout Planner',
      })
    })

    expect(await screen.findByText('Workout Planner')).toBeInTheDocument()
    expect(screen.getByText('Intent: Run Workout Planner')).toBeInTheDocument()
    expect(screen.getByText('Generated 3 workout event drafts.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Milestone'), 'Schema and API ready')
    await user.click(screen.getByRole('button', { name: 'Add milestone' }))

    expect(await screen.findByText('Added milestone Schema and API ready')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Milestone status for Schema and API ready'), 'done')

    await user.type(screen.getByLabelText('Action item'), 'Write first memory test')
    await user.click(screen.getByRole('button', { name: 'Add action' }))

    expect(await screen.findByText('Added action Write first memory test')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Action status for Write first memory test'), 'done')

    await user.selectOptions(screen.getByLabelText('Log type'), 'decision')
    await user.type(screen.getByLabelText('Summary'), 'Keep memory local')
    await user.type(screen.getByLabelText('Details'), 'SQLite is enough for the first implementation.')
    await user.click(screen.getByRole('button', { name: 'Add progress log' }))

    expect(await screen.findByText('Logged decision')).toBeInTheDocument()
    expect(screen.getByText('Keep memory local')).toBeInTheDocument()
    expect(screen.getByText('SQLite is enough for the first implementation.')).toBeInTheDocument()

    await waitFor(() => {
      const state = useLongTermMemoryStore.getState()
      expect(state.goals[0].status).toBe('paused')
      expect(state.projects[0].status).toBe('completed')
      expect(state.milestones[0].status).toBe('done')
      expect(state.actions[0].status).toBe('done')
      expect(state.progress[0].log_type).toBe('decision')
    })
  }, 15_000)
})
