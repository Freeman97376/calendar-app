import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import App from '../../../src/App'
import type {
  ActionItemStatus,
  CreateActionItemInput,
  CreateGoalProjectInput,
  CreateGoalProjectResult,
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
} from '../../../src/domain/types/longTermMemory'
import { LocalAIService } from '../../../src/services/ai/localAIService'
import { RuntimeConfigService } from '../../../src/services/config/runtimeConfigService'
import { LocalEventTypeService } from '../../../src/services/eventTypes/localEventTypeService'
import { configureAIService, useAIStore } from '../../../src/store/aiStore'
import { useCalendarStore } from '../../../src/store/calendarStore'
import { configureConfigServices, useConfigStore } from '../../../src/store/configStore'
import { configureEventSync, useEventStore } from '../../../src/store/eventStore'
import { configureEventTypeService, useEventTypeStore } from '../../../src/store/eventTypeStore'
import {
  configureLongTermMemoryClient,
  useLongTermMemoryStore,
  type LongTermMemoryClientContract,
} from '../../../src/store/longTermMemoryStore'
import { useUIStore } from '../../../src/store/uiStore'

function timestamp() {
  return '2026-06-07T00:00:00.000Z'
}

async function openWorkspaceEntry(user: ReturnType<typeof userEvent.setup>, name: string) {
  const directEntry = screen.queryByRole('button', { name })
  if (directEntry) {
    await user.click(directEntry)
    return
  }

  if (name === 'Todos' && screen.queryByRole('heading', { name: 'To-Do List' })) return
  if (screen.queryByRole('heading', { name })) return

  const closeButton = screen.queryByRole('button', { name: 'Close' })
  if (closeButton) {
    await user.click(closeButton)
  } else {
    const backButton = screen.queryByRole('button', { name: 'Back' })
    if (backButton) {
      await user.click(backButton)
    }
  }
  await user.click(await screen.findByRole('button', { name }))
}

async function submitAIChat(user: ReturnType<typeof userEvent.setup>, message: string) {
  await user.click(screen.getByRole('button', { name: 'Mode: Chat' }))
  await user.type(screen.getByLabelText('AI message'), message)
  await user.click(screen.getByRole('button', { name: 'Send message' }))
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

  async createGoalProject(input: CreateGoalProjectInput): Promise<CreateGoalProjectResult> {
    const goal = await this.createGoal(input.goal)
    const project = await this.createProject({ ...input.project, goal_id: goal.goal_id })
    return { goal, project }
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
      .filter((project) => lower.includes(project.title.toLowerCase()))
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

  async updateAction(
    actionId: string,
    changes: Partial<CreateActionItemInput> & { status?: ActionItemStatus },
  ): Promise<LongTermActionItem> {
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

  async updateGoal(
    goalId: string,
    changes: Partial<CreateGoalInput> & { status?: GoalStatus },
  ): Promise<LongTermGoal> {
    const goal = this.goals.find((candidate) => candidate.goal_id === goalId)
    if (!goal) throw new Error('Missing goal')
    Object.assign(goal, {
      ...changes,
      metadata: changes.metadata ?? goal.metadata,
      updated_at: timestamp(),
    })
    return goal
  }

  async updateMilestone(
    milestoneId: string,
    changes: Partial<CreateMilestoneInput> & { status?: MilestoneStatus },
  ): Promise<LongTermMilestone> {
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

  async updateProject(
    projectId: string,
    changes: Partial<CreateProjectInput> & { status?: ProjectStatus },
  ): Promise<LongTermProject> {
    const project = this.projects.find((candidate) => candidate.project_id === projectId)
    if (!project) throw new Error('Missing project')
    Object.assign(project, {
      ...changes,
      metadata: changes.metadata ?? project.metadata,
      updated_at: timestamp(),
    })
    return project
  }
}

describe('Fridge tool template', () => {
  let memoryClient: MemoryClient

  beforeEach(() => {
    localStorage.clear()
    memoryClient = new MemoryClient()
    configureConfigServices(
      new RuntimeConfigService(localStorage, 'test_fridge_template_runtime_config'),
    )
    configureEventSync(null)
    configureEventTypeService(
      new LocalEventTypeService(localStorage, 'test_fridge_template_event_types'),
    )
    configureLongTermMemoryClient(memoryClient)
    useAIStore.getState().reset()
    useCalendarStore.getState().reset({ focusedDate: '2026-06-07', view: 'month' })
    useConfigStore.getState().reset()
    useEventStore.getState().reset()
    useEventTypeStore.getState().reset()
    useLongTermMemoryStore.getState().reset()
    useUIStore.getState().reset()
    configureAIService(new LocalAIService(), { model: 'local', provider: 'local' })
  })

  it('registers a Fridge active tool and records routed generic runs', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Tool Templates' }))
    await user.click(screen.getByRole('button', { name: 'Fridge' }))
    await user.type(
      screen.getByLabelText('Requirements'),
      'Manage fridge receipts, groceries, expiration reminders, and weekly inventory review.',
    )
    await user.click(screen.getByRole('button', { name: 'Send requirement' }))

    const aliasInput = await screen.findByLabelText('Active tool name')
    await user.clear(aliasInput)
    await user.type(aliasInput, 'Fridge Coach')
    await user.click(screen.getByRole('button', { name: 'Register active tool' }))

    expect(await screen.findByRole('heading', { name: 'Active Tools' })).toBeInTheDocument()
    expect(memoryClient.projects[0].metadata).toMatchObject({
      instanceAlias: 'Fridge Coach',
      parentTemplateId: 'fridge',
      parentTemplateLabel: 'Fridge',
      toolCategory: 'active-tool',
      toolName: 'Fridge',
    })

    await openWorkspaceEntry(user, 'AI Assistant')
    await submitAIChat(
      user,
      'Update Fridge Coach with this week grocery receipts and expiration reminders.',
    )

    expect(await screen.findByText(/Route this to Fridge Coach/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Dispatch' }))
    await waitFor(() => expect(memoryClient.toolRuns).toHaveLength(1))
    expect(useUIStore.getState().activeWorkspacePanel).toBe('ai')
    await openWorkspaceEntry(user, 'Active Tools')

    expect(await screen.findByRole('heading', { name: 'Active Tools' })).toBeInTheDocument()
    expect(
      (await screen.findAllByText('AI Assistant routed a request to Fridge Coach.')).length,
    ).toBeGreaterThan(0)
    await waitFor(() => {
      expect(memoryClient.toolRuns[0]).toMatchObject({
        status: 'needs_user_confirmation',
        tool_name: 'Fridge',
      })
    })
  }, 15_000)
})
