import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import App from '../../src/App'
import GoalPlannerPanel from '../../src/components/tools/goal-planner/GoalPlannerPanel'
import { createActiveToolMetadata } from '../../src/domain/logic/enabledTools'
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
import { LocalAIService } from '../../src/services/ai/localAIService'
import {
  RuntimeConfigService,
  BackendConfigApiService,
} from '../../src/services/config/runtimeConfigService'
import { LocalEventTypeService } from '../../src/services/eventTypes/localEventTypeService'
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
    const progress: LongTermProgressLog = {
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
    this.progress = [progress, ...this.progress]
    return progress
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

  async search() {
    return []
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

  async updateProject(
    projectId: string,
    changes: Partial<CreateProjectInput> & { status?: ProjectStatus },
  ) {
    const current = this.projects.find((project) => project.project_id === projectId)
    if (!current) throw new Error('Missing project')
    const updated = {
      ...current,
      ...changes,
      metadata: changes.metadata ?? current.metadata,
      updated_at: timestamp(),
    }
    this.projects = this.projects.map((project) =>
      project.project_id === projectId ? updated : project,
    )
    return updated
  }
}

describe('Goal Planner tool', () => {
  let memoryClient: MockLongTermMemoryClient

  beforeEach(() => {
    localStorage.clear()
    memoryClient = new MockLongTermMemoryClient()
    configureConfigServices(
      new RuntimeConfigService(localStorage, 'test_goal_planner_runtime_config'),
      new BackendConfigApiService(
        () => 'http://test.local',
        async () => backendStatusResponse(),
      ),
    )
    configureEventSync(null)
    configureEventTypeService(new LocalEventTypeService(localStorage, 'test_goal_planner_types'))
    configureLongTermMemoryClient(memoryClient)
    useAIStore.getState().reset()
    useCalendarStore.getState().reset({ focusedDate: '2026-06-26', view: 'month' })
    useConfigStore.getState().reset()
    useEventStore.getState().reset()
    useEventTypeStore.getState().reset()
    useLongTermMemoryStore.getState().reset()
    useUIStore.getState().reset()
    configureAIService(new LocalAIService(), { model: 'local', provider: 'local' })
  })

  it('registers a Goal Planner active tool from the template library', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Tool Templates' }))
    await user.click(screen.getByRole('button', { name: 'Goal Planner' }))

    expect(screen.getByRole('heading', { name: 'Tool Templates' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Goal title')).not.toBeInTheDocument()

    await user.type(
      screen.getByLabelText('Requirements'),
      'Manage durable project memory for a launch plan with milestones and action items.',
    )
    await user.click(screen.getByRole('button', { name: 'Send requirement' }))
    const aliasInput = await screen.findByLabelText('Active tool name')
    await user.clear(aliasInput)
    await user.type(aliasInput, 'Planning Ops')
    await user.click(screen.getByRole('button', { name: 'Register active tool' }))

    expect(await screen.findByRole('heading', { name: 'Active Tools' })).toBeInTheDocument()
    expect(screen.getAllByText('Planning Ops').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Goal Planner').length).toBeGreaterThan(0)
    expect(memoryClient.projects[0].metadata).toMatchObject({
      adapterId: 'generic',
      implementationPath: [],
      instanceAlias: 'Planning Ops',
      parentTemplateId: 'goal-planner',
      parentTemplateLabel: 'Goal Planner',
      roadmapFormatVersion: 1,
      sourceToolId: 'goal-planner',
      toolCategory: 'active-tool',
      toolName: 'Goal Planner',
    })
    expect(memoryClient.goals[0].metadata).toMatchObject({
      instanceAlias: 'Planning Ops',
      parentTemplateId: 'goal-planner',
      roadmapFormatVersion: 1,
      toolCategory: 'active-tool',
    })

    const activeToolNameInput = await screen.findByLabelText('Active tool name')
    expect(screen.getByLabelText('Roadmap')).toBeInTheDocument()
    expect(screen.getByText('Implementation path')).toBeInTheDocument()
    expect(activeToolNameInput).toHaveValue('Planning Ops')
    await user.clear(activeToolNameInput)
    await user.type(activeToolNameInput, 'Planning Ops Renamed')
    await user.click(screen.getByRole('button', { name: 'Save name' }))

    expect((await screen.findAllByText('Planning Ops Renamed')).length).toBeGreaterThan(0)
    expect(memoryClient.projects[0]).toMatchObject({
      metadata: expect.objectContaining({
        instanceAlias: 'Planning Ops Renamed',
        parentTemplateId: 'goal-planner',
        roadmapFormatVersion: 1,
      }),
      title: 'Planning Ops Renamed',
    })
  }, 15_000)

  it('shows and edits the selected project roadmap in Goal Planner', async () => {
    const user = userEvent.setup()
    memoryClient.goals = [
      {
        created_at: timestamp(),
        description: 'Coordinate launch outcomes',
        goal_id: 'goal_1',
        metadata: {},
        status: 'active',
        title: 'Launch goal',
        updated_at: timestamp(),
      },
    ]
    memoryClient.projects = [
      {
        created_at: timestamp(),
        description: 'Manage the launch project',
        goal_id: 'goal_1',
        metadata: {},
        project_id: 'project_1',
        status: 'active',
        title: 'Launch project',
        updated_at: timestamp(),
      },
    ]
    memoryClient.milestones = [
      {
        created_at: timestamp(),
        description: 'Scope the work',
        due_date: '2026-07-15',
        metadata: {},
        milestone_id: 'milestone_1',
        project_id: 'project_1',
        status: 'in_progress',
        title: 'Discovery',
        updated_at: timestamp(),
      },
    ]
    memoryClient.actions = [
      {
        action_id: 'action_1',
        created_at: timestamp(),
        description: 'Draft the constraints',
        due_date: null,
        metadata: {},
        milestone_id: 'milestone_1',
        project_id: 'project_1',
        status: 'done',
        title: 'Draft constraints',
        updated_at: timestamp(),
      },
    ]

    render(<GoalPlannerPanel />)

    expect(await screen.findByLabelText('Roadmap')).toBeInTheDocument()
    expect(screen.getAllByText('Launch goal').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Discovery').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Edit implementation path' }))
    const pathInput = screen.getByLabelText(/One step per line/i)
    await user.clear(pathInput)
    await user.type(pathInput, 'Research | Map constraints\nDelivery | Ship workflow')
    await user.click(screen.getByRole('button', { name: 'Save implementation path' }))

    expect(memoryClient.projects[0].metadata).toMatchObject({
      implementationPath: [
        { description: 'Map constraints', id: 'path-1', order: 1, title: 'Research' },
        { description: 'Ship workflow', id: 'path-2', order: 2, title: 'Delivery' },
      ],
      roadmapFormatVersion: 1,
    })
    expect(
      await screen.findByText('Saved implementation path for Launch project'),
    ).toBeInTheDocument()
    expect(await screen.findByText(/Research/)).toBeInTheDocument()
  })

  it('shows a mock plan and edits the long-term plan and tool characteristics in Active Tools', async () => {
    const user = userEvent.setup()
    const mockPlan = [
      {
        description: 'Document the existing planning workflow',
        id: 'path-1',
        order: 1,
        title: 'Audit current workflow',
      },
      {
        description: 'Validate the first automated review',
        id: 'path-2',
        order: 2,
        title: 'Run pilot review',
      },
    ]
    const metadata = createActiveToolMetadata({
      activationSummary: 'Keep the planning system aligned with the long-term outcome.',
      adapterId: 'ai-progress',
      implementationPath: mockPlan,
      instanceAlias: 'Planning System',
      longTermGoalLabel: 'Build a repeatable planning system',
      parentTemplateId: 'goal-planner',
      parentTemplateLabel: 'Goal Planner',
      routeTags: ['planning', 'weekly review'],
      toolFeatures: ['Durable progress memory', 'Reviewable calendar drafts'],
      toolName: 'Goal Planner',
    })
    memoryClient.goals = [
      {
        created_at: timestamp(),
        description: 'Make planning reliable',
        goal_id: 'goal_1',
        metadata,
        status: 'active',
        title: 'Planning operations',
        updated_at: timestamp(),
      },
    ]
    memoryClient.projects = [
      {
        created_at: timestamp(),
        description: 'Operate the planning system',
        goal_id: 'goal_1',
        metadata,
        project_id: 'project_1',
        status: 'active',
        title: 'Planning System',
        updated_at: timestamp(),
      },
    ]

    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Active Tools' }))

    expect(await screen.findByText('Build a repeatable planning system')).toBeInTheDocument()
    expect(screen.getByText(/Audit current workflow/)).toBeInTheDocument()
    expect(screen.getByText('Durable progress memory')).toBeInTheDocument()
    expect(screen.getByText('Reviewable calendar drafts')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit plan & characteristics' }))
    const dialog = screen.getByRole('dialog', {
      name: 'Edit long-term plan and tool characteristics',
    })
    const planInput = within(dialog).getByLabelText('Implementation path')
    const featuresInput = within(dialog).getByLabelText('Tool characteristics')

    await user.clear(planInput)
    await user.type(
      planInput,
      'Prototype workflow | Validate the automation\nShip rollout | Release the planning system',
    )
    await user.clear(featuresInput)
    await user.type(featuresInput, 'Durable progress memory\nWeekly variance review')
    await user.click(within(dialog).getByRole('button', { name: 'Save plan & characteristics' }))

    expect(await screen.findByText(/Prototype workflow/)).toBeInTheDocument()
    expect(screen.getByText(/Ship rollout/)).toBeInTheDocument()
    expect(screen.getByText('Weekly variance review')).toBeInTheDocument()
    expect(memoryClient.projects[0].metadata).toMatchObject({
      implementationPath: [
        {
          description: 'Validate the automation',
          id: 'path-1',
          order: 1,
          title: 'Prototype workflow',
        },
        {
          description: 'Release the planning system',
          id: 'path-2',
          order: 2,
          title: 'Ship rollout',
        },
      ],
      longTermGoalLabel: 'Build a repeatable planning system',
      toolFeatures: ['Durable progress memory', 'Weekly variance review'],
    })
  })
})
