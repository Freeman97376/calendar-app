import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../support/mocks/server'
import { beforeEach, describe, expect, it } from 'vitest'

import App from '../../../src/App'
import { createActiveToolMetadata } from '../../../src/domain/logic/enabledTools'
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
import { LocalTodoService } from '../../../src/services/todos/localTodoService'
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
import { configureTodoService, useTodoStore } from '../../../src/store/todoStore'
import { useUIStore } from '../../../src/store/uiStore'

function timestamp() {
  return '2026-06-18T00:00:00.000Z'
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
  atomicGoalProjectCreates = 0
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
      energy_needed: input.energy_needed,
      estimated_minutes: input.estimated_minutes,
      execution_tier: input.execution_tier,
      metadata: input.metadata ?? {},
      milestone_id: input.milestone_id ?? null,
      priority: input.priority,
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
    this.atomicGoalProjectCreates += 1
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
      .filter(
        (project) =>
          project.title.toLowerCase().includes(lower) ||
          lower.includes(project.title.toLowerCase()),
      )
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
  ) {
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

  async updateProject(
    projectId: string,
    changes: Partial<CreateProjectInput> & { status?: ProjectStatus },
  ) {
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

describe('AI demo tools and Todo long projects', () => {
  let memoryClient: MemoryClient
  let stagedPlans: Array<Record<string, unknown>>

  beforeEach(() => {
    localStorage.clear()
    memoryClient = new MemoryClient()
    stagedPlans = []
    server.use(
      http.get('*/api/memory/projects/:projectId/dashboard', ({ params }) =>
        HttpResponse.json({
          success: true,
          dashboard: {
            project: memoryClient.projects.find((item) => item.project_id === params.projectId),
            goal: memoryClient.goals[0] ?? null,
            actions: [],
            milestones: [],
            metrics: [],
            dependencies: [],
            effort: [],
            policy: {
              active_tier: 'standard',
              weekly_capacity_minutes: 300,
              buffer_percent: 20,
              available_days: [],
            },
            health: { status: 'on_track', factors: [], confidence: 'high' },
            critical_path: { action_ids: [], total_minutes: 0, has_cycle: false },
            milestone_predictions: [],
            review: {
              recommend_replan: false,
              recommend_pause: false,
              triggers: [],
              trigger_count: 0,
              safety_warnings: [],
              adjustment_question: '',
            },
            pending_check_in: null,
            versions: [],
            proposals: [],
            threads: [],
            usage: {
              selected_mode: 'balanced',
              effective_mode: 'balanced',
              allowed_modes: ['balanced'],
              degraded: false,
            },
          },
        }),
      ),
      http.post('*/api/plan-change-proposals', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        stagedPlans.push(body)
        return HttpResponse.json({
          success: true,
          proposal: {
            ...body,
            proposal_id: 'staged-tool-plan',
            status: 'pending',
            created_at: timestamp(),
            updated_at: timestamp(),
          },
        })
      }),
    )
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

  it('reviews Fitness AI before activation and routes the approved active tool', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Tool Templates' }))
    expect(screen.getByText('AI Demo')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Fitness AI' }))

    await user.type(
      screen.getByLabelText('Requirements'),
      'Build strength with dumbbells 3 times per week.',
    )
    await user.click(screen.getByRole('button', { name: 'Send requirement' }))

    const strengthAliasInput = await screen.findByLabelText('Active tool name')
    await user.clear(strengthAliasInput)
    await user.type(strengthAliasInput, 'Strength Coach')
    await user.click(screen.getByRole('button', { name: 'Review initial plan' }))
    expect(
      await screen.findByRole('heading', { name: /Fitness AI · Initial plan/ }),
    ).toBeInTheDocument()
    const onboardingSeed = useUIStore.getState().pendingActiveToolOnboarding
    if (!onboardingSeed) throw new Error('Expected Fitness AI review seed.')
    expect(onboardingSeed.suggestedInstanceAlias).toBe('Strength Coach')
    expect(memoryClient.projects).toHaveLength(0)
    const metadata = createActiveToolMetadata({
      activationForm: onboardingSeed.activationForm,
      activationSummary: onboardingSeed.activationSummary ?? 'Approved strength plan',
      adapterId: onboardingSeed.template.adapterId ?? 'ai-progress',
      instanceAlias: 'Strength Coach',
      parentTemplateId: onboardingSeed.template.id,
      parentTemplateLabel: onboardingSeed.template.label,
      parentTemplateToolName: onboardingSeed.template.toolName ?? onboardingSeed.template.label,
      routeTags: onboardingSeed.routeTags ?? onboardingSeed.template.routeTags ?? [],
      routingEnabled: true,
      sourceToolId: onboardingSeed.template.id,
      templateId: onboardingSeed.template.id,
      toolFeatures: onboardingSeed.template.capabilityTags ?? [],
      toolKind: onboardingSeed.template.toolKind,
      toolName: onboardingSeed.template.toolName ?? onboardingSeed.template.label,
    })
    const approved = await memoryClient.createGoalProject({
      goal: {
        description: onboardingSeed.activationSummary,
        metadata,
        title: 'Strength Coach',
      },
      project: {
        description: onboardingSeed.activationSummary,
        metadata,
        title: 'Strength Coach',
      },
    })
    await act(async () => {
      await useLongTermMemoryStore.getState().loadOverview()
      useUIStore.getState().clearActiveToolOnboarding()
      useUIStore.getState().openEnabledToolsPanel(approved.project.project_id)
    })

    expect(await screen.findByRole('heading', { name: 'Active Tools' })).toBeInTheDocument()
    expect(screen.getAllByText('Strength Coach').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Fitness AI').length).toBeGreaterThan(0)
    expect(memoryClient.projects[0].metadata).toMatchObject({
      instanceAlias: 'Strength Coach',
      parentTemplateId: 'fitness-ai',
      parentTemplateLabel: 'Fitness AI',
      toolCategory: 'active-tool',
      toolName: 'Fitness AI',
    })
    expect(memoryClient.atomicGoalProjectCreates).toBe(1)

    await openWorkspaceEntry(user, 'AI Assistant')
    await submitAIChat(user, 'Generate next week full workout plan with 5 sessions.')

    expect(await screen.findByText(/Route this to Strength Coach/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Dispatch' }))
    await waitFor(() => expect(memoryClient.toolRuns).toHaveLength(1))
    expect(useUIStore.getState().activeWorkspacePanel).toBe('ai')
    expect(memoryClient.actions).toHaveLength(0)
    expect(memoryClient.milestones).toHaveLength(0)
    expect(stagedPlans).toHaveLength(1)
    await openWorkspaceEntry(user, 'Active Tools')

    expect(await screen.findByRole('heading', { name: 'Active Tools' })).toBeInTheDocument()
    expect(stagedPlans[0].diff).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity: 'milestone',
          after: expect.objectContaining({ title: 'Baseline and habit setup' }),
        }),
      ]),
    )
    expect(screen.getByText('Latest Calendar Plan')).toBeInTheDocument()
    expect(stagedPlans[0].diff).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity: 'action',
          after: expect.objectContaining({
            energy_needed: expect.stringMatching(/^(high|medium|low)$/),
            estimated_minutes: 45,
            priority: expect.stringMatching(/^(high|medium|low)$/),
            title: 'Complete baseline workout',
          }),
        }),
      ]),
    )
    expect(useEventStore.getState().events).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Review plan' }))
    await user.click(await screen.findByRole('button', { name: 'Apply to calendar' }))
    await waitFor(() => {
      expect(useEventStore.getState().events).toHaveLength(5)
    })
    expect(await screen.findByText('Applied 5 calendar events.')).toBeInTheDocument()
    const appliedIds = useEventStore.getState().events.map((event) => event.id)
    await user.click(screen.getByRole('button', { name: 'Apply to calendar' }))
    await waitFor(() => {
      expect(useEventStore.getState().events).toHaveLength(5)
    })
    // Replaying the same batch returns its original result and entity IDs.
    expect(await screen.findByText('Applied 5 calendar events.')).toBeInTheDocument()
    expect(useEventStore.getState().events.map((event) => event.id)).toEqual(appliedIds)
    expect(memoryClient.toolRuns.map((toolRun) => toolRun.tool_name)).toContain('Fitness AI')
  }, 15_000)

  it('creates an SEO Learning Assistant instance and routes SEO learning to it', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Tool Templates' }))
    await user.click(screen.getByRole('button', { name: 'SEO Learning' }))
    await user.type(
      screen.getByLabelText('Requirements'),
      'Learn SEO for a SaaS blog and build a repeatable audit workflow.',
    )
    await user.click(screen.getByRole('button', { name: 'Send requirement' }))
    const seoAliasInput = await screen.findByLabelText('Active tool name')
    await user.clear(seoAliasInput)
    await user.type(seoAliasInput, 'SEO Coach')
    await user.click(screen.getByRole('button', { name: 'Register active tool' }))

    expect((await screen.findAllByText('SEO Coach')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Learning Assistant').length).toBeGreaterThan(0)
    expect(memoryClient.atomicGoalProjectCreates).toBe(1)

    await openWorkspaceEntry(user, 'AI Assistant')
    await submitAIChat(user, 'Make a full-week SEO learning plan with 5 sessions.')
    expect(await screen.findByText(/Route this to SEO Coach/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Dispatch' }))
    await waitFor(() => expect(memoryClient.toolRuns).toHaveLength(1))
    expect(useUIStore.getState().activeWorkspacePanel).toBe('ai')
    expect(memoryClient.actions).toHaveLength(0)
    expect(memoryClient.milestones).toHaveLength(0)
    expect(stagedPlans).toHaveLength(1)
    await openWorkspaceEntry(user, 'Active Tools')

    expect(stagedPlans[0].diff).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity: 'milestone',
          after: expect.objectContaining({ title: 'SEO foundations and keyword research' }),
        }),
      ]),
    )
    expect(screen.getByText('SEO learning block: baseline audit')).toBeInTheDocument()
    expect(memoryClient.toolRuns.map((toolRun) => toolRun.tool_name)).toContain(
      'Learning Assistant',
    )
  }, 15_000)

  it('creates a Todo long project and updates progress from expanded details', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Todos' }))
    await user.type(screen.getByLabelText('Task'), 'Launch long project')
    await user.click(screen.getByRole('checkbox', { name: /Long project/i }))
    await user.click(screen.getByRole('button', { name: 'Add task' }))

    expect(await screen.findByText('Launch long project')).toBeInTheDocument()
    expect(memoryClient.atomicGoalProjectCreates).toBe(1)
    await user.click(screen.getByText('Details'))

    const longProjectLabels = await screen.findAllByText('Long project')
    const details = longProjectLabels[longProjectLabels.length - 1]
    expect(details).toBeInTheDocument()
    expect(screen.getByText('0/1 complete from actions')).toBeInTheDocument()

    await user.selectOptions(
      screen.getByLabelText('Long project action status for Define first milestone'),
      'done',
    )

    await waitFor(() => {
      expect(screen.getByText('1/1 complete from actions')).toBeInTheDocument()
    })
    expect(within(details.closest('section') as HTMLElement).getByText('100%')).toBeInTheDocument()
  }, 15_000)
})
