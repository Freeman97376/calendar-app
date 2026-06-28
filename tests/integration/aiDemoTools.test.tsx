import { render, screen, waitFor, within } from '@testing-library/react'
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
  LongTermMemorySearchResult,
  LongTermMilestone,
  LongTermProgressLog,
  LongTermProject,
  LongTermToolRun,
  MilestoneStatus,
  ProjectStatus,
} from '../../src/domain/types/longTermMemory'
import { LocalAIService } from '../../src/services/ai/localAIService'
import { RuntimeConfigService } from '../../src/services/config/runtimeConfigService'
import { LocalEventTypeService } from '../../src/services/eventTypes/localEventTypeService'
import { LocalTodoService } from '../../src/services/todos/localTodoService'
import { configureAIService, useAIStore } from '../../src/store/aiStore'
import { useCalendarStore } from '../../src/store/calendarStore'
import { configureConfigServices, useConfigStore } from '../../src/store/configStore'
import { configureEventSync, useEventStore } from '../../src/store/eventStore'
import { configureEventTypeService, useEventTypeStore } from '../../src/store/eventTypeStore'
import {
  configureLongTermMemoryClient,
  useLongTermMemoryStore,
  type LongTermMemoryClientContract,
} from '../../src/store/longTermMemoryStore'
import { configureTodoService, useTodoStore } from '../../src/store/todoStore'
import { useUIStore } from '../../src/store/uiStore'

function timestamp() {
  return '2026-06-18T00:00:00.000Z'
}

class MemoryClient implements LongTermMemoryClientContract {
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
      metadata: input.metadata ?? {},
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
      metadata: input.metadata ?? {},
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
      metadata: input.metadata ?? {},
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
    const entry: LongTermProgressLog = {
      action_id: input.action_id ?? null,
      created_at: timestamp(),
      details: input.details ?? '',
      goal_id: input.goal_id ?? null,
      log_type: input.log_type ?? 'update',
      metadata: input.metadata ?? {},
      progress_id: `progress_${this.progress.length + 1}`,
      project_id: input.project_id,
      summary: input.summary,
      updated_at: timestamp(),
    }
    this.progress = [entry, ...this.progress]
    return entry
  }

  async createProject(input: CreateProjectInput): Promise<LongTermProject> {
    const project: LongTermProject = {
      created_at: timestamp(),
      description: input.description ?? '',
      goal_id: input.goal_id,
      metadata: input.metadata ?? {},
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

  async getProject(projectId: string): Promise<LongTermProject> {
    const project = this.projects.find((candidate) => candidate.project_id === projectId)
    if (!project) throw new Error('Missing project')
    return project
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

  async search(query: string): Promise<LongTermMemorySearchResult[]> {
    const lower = query.toLowerCase()
    return this.projects
      .filter((project) => project.title.toLowerCase().includes(lower) || lower.includes(project.title.toLowerCase()))
      .map((project) => ({
        description: project.description,
        entity_type: 'project',
        goal_id: project.goal_id,
        item_id: project.project_id,
        project_id: project.project_id,
        status: project.status,
        title: project.title,
        updated_at: project.updated_at,
      }))
  }

  async updateAction(actionId: string, changes: Partial<CreateActionItemInput> & { status?: ActionItemStatus }) {
    const action = this.actions.find((candidate) => candidate.action_id === actionId)
    if (!action) throw new Error('Missing action')
    Object.assign(action, {
      ...changes,
      due_date: changes.due_date ?? action.due_date,
      metadata: changes.metadata ?? action.metadata,
      milestone_id: changes.milestone_id ?? action.milestone_id,
      updated_at: timestamp(),
    })
    return action
  }

  async updateGoal(goalId: string, changes: Partial<CreateGoalInput> & { status?: GoalStatus }) {
    const goal = this.goals.find((candidate) => candidate.goal_id === goalId)
    if (!goal) throw new Error('Missing goal')
    Object.assign(goal, { ...changes, metadata: changes.metadata ?? goal.metadata, updated_at: timestamp() })
    return goal
  }

  async updateMilestone(
    milestoneId: string,
    changes: Partial<CreateMilestoneInput> & { status?: MilestoneStatus },
  ) {
    const milestone = this.milestones.find((candidate) => candidate.milestone_id === milestoneId)
    if (!milestone) throw new Error('Missing milestone')
    Object.assign(milestone, {
      ...changes,
      due_date: changes.due_date ?? milestone.due_date,
      metadata: changes.metadata ?? milestone.metadata,
      updated_at: timestamp(),
    })
    return milestone
  }

  async updateProject(projectId: string, changes: Partial<CreateProjectInput> & { status?: ProjectStatus }) {
    const project = this.projects.find((candidate) => candidate.project_id === projectId)
    if (!project) throw new Error('Missing project')
    Object.assign(project, { ...changes, metadata: changes.metadata ?? project.metadata, updated_at: timestamp() })
    return project
  }
}

describe('AI demo tools and Todo long projects', () => {
  let memoryClient: MemoryClient

  beforeEach(() => {
    localStorage.clear()
    memoryClient = new MemoryClient()
    configureConfigServices(new RuntimeConfigService(localStorage, 'test_ai_demo_runtime_config'))
    configureEventSync(null)
    configureEventTypeService(new LocalEventTypeService(localStorage, 'test_ai_demo_event_types'))
    configureLongTermMemoryClient(memoryClient)
    configureTodoService(new LocalTodoService(localStorage, 'test_ai_demo_todos'))
    useAIStore.getState().reset()
    useCalendarStore.getState().reset({ focusedDate: '2026-06-18', view: 'month' })
    useConfigStore.getState().reset()
    useEventStore.getState().reset()
    useEventTypeStore.getState().reset()
    useLongTermMemoryStore.getState().reset()
    useTodoStore.getState().reset()
    useUIStore.getState().reset()
    configureAIService(new LocalAIService(), { model: 'local', provider: 'local' })
  })

  it('runs Fitness AI and applies preview calendar events', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Tools' }))
    expect(screen.getByText('AI Demo')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Fitness AI' }))

    await user.type(screen.getByLabelText('Training goal'), 'Build strength')
    await user.click(screen.getByRole('button', { name: 'Generate / Adjust plan' }))

    expect(await screen.findByText(/Built a 3 times per week beginner fitness plan/i)).toBeInTheDocument()
    expect(screen.getByText('Baseline and habit setup')).toBeInTheDocument()
    expect(screen.getByText('Calendar Preview')).toBeInTheDocument()
    expect(screen.getByText('Progress Log')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Conversation message'), 'Make the first week lower impact')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect((await screen.findAllByText(/Make the first week lower impact/i)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/updated the workout plan/i)).length).toBeGreaterThan(0)
    expect(memoryClient.progress[0].summary).toMatch(/Updated local fitness progress plan/i)

    await user.click(screen.getByRole('button', { name: 'Apply events' }))

    await waitFor(() => {
      expect(useEventStore.getState().events.length).toBeGreaterThan(0)
    })
    expect(memoryClient.toolRuns.map((toolRun) => toolRun.tool_name)).toContain('Fitness AI')
  }, 15_000)

  it('runs Agent Learning and shows learning route milestones', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Tools' }))
    await user.click(screen.getByRole('button', { name: 'Agent Learning' }))
    await user.click(screen.getByRole('button', { name: 'Generate / Adjust plan' }))

    expect(await screen.findByText(/Built an AI agent learning route/i)).toBeInTheDocument()
    expect(screen.getByText('Tool use and structured outputs')).toBeInTheDocument()
    expect(screen.getByText('AI agent skill block: task framing')).toBeInTheDocument()
  }, 15_000)

  it('creates a Todo long project and updates progress from expanded details', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Todos' }))
    await user.type(screen.getByLabelText('Task'), 'Launch long project')
    await user.click(screen.getByRole('checkbox', { name: /Long project/i }))
    await user.click(screen.getByRole('button', { name: 'Add task' }))

    expect(await screen.findByText('Launch long project')).toBeInTheDocument()
    await user.click(screen.getByText('Details'))

    const longProjectLabels = await screen.findAllByText('Long project')
    const details = longProjectLabels[longProjectLabels.length - 1]
    expect(details).toBeInTheDocument()
    expect(screen.getByText('0/1 complete from actions')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Long project action status for Define first milestone'), 'done')

    await waitFor(() => {
      expect(screen.getByText('1/1 complete from actions')).toBeInTheDocument()
    })
    expect(within(details.closest('section') as HTMLElement).getByText('100%')).toBeInTheDocument()
  }, 15_000)
})
