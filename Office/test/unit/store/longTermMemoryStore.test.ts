import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  LongTermActionItem,
  LongTermGoal,
  LongTermMilestone,
  LongTermProgressLog,
  LongTermProject,
  LongTermToolRun,
} from '../../../../src/domain/types/longTermMemory'
import {
  configureLongTermMemoryClient,
  type LongTermMemoryClientContract,
  useLongTermMemoryStore,
} from '../../../../src/store/longTermMemoryStore'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function projectAction(projectId: string): LongTermActionItem {
  return {
    action_id: `action-${projectId}`,
    created_at: '2026-08-12T00:00:00Z',
    description: '',
    due_date: null,
    metadata: {},
    milestone_id: null,
    project_id: projectId,
    status: 'todo',
    title: `Action for ${projectId}`,
    updated_at: '2026-08-12T00:00:00Z',
  }
}

function atomicPair(): { goal: LongTermGoal; project: LongTermProject } {
  const goal: LongTermGoal = {
    created_at: '2026-08-12T00:00:00Z',
    description: 'Atomic pair',
    goal_id: 'goal-atomic',
    metadata: {},
    status: 'active',
    title: 'Atomic goal',
    updated_at: '2026-08-12T00:00:00Z',
  }
  return {
    goal,
    project: {
      created_at: '2026-08-12T00:00:00Z',
      description: 'Atomic pair',
      goal_id: goal.goal_id,
      metadata: {},
      project_id: 'project-atomic',
      status: 'active',
      title: 'Atomic project',
      updated_at: '2026-08-12T00:00:00Z',
    },
  }
}

describe('longTermMemoryStore request ordering', () => {
  beforeEach(() => {
    configureLongTermMemoryClient(null)
    useLongTermMemoryStore.getState().reset()
  })

  it('keeps the latest project details when an older request resolves last', async () => {
    const actionsA = deferred<LongTermActionItem[]>()
    const actionsB = deferred<LongTermActionItem[]>()
    const emptyMilestones = Promise.resolve([] as LongTermMilestone[])
    const emptyProgress = Promise.resolve([] as LongTermProgressLog[])
    const emptyToolRuns = Promise.resolve([] as LongTermToolRun[])
    const client = {
      listActions: vi.fn((projectId: string) =>
        projectId === 'project-a' ? actionsA.promise : actionsB.promise,
      ),
      listMilestones: vi.fn(() => emptyMilestones),
      listProgress: vi.fn(() => emptyProgress),
      listToolRunsForProject: vi.fn(() => emptyToolRuns),
    } as unknown as LongTermMemoryClientContract
    configureLongTermMemoryClient(client)

    const loadA = useLongTermMemoryStore.getState().loadProjectDetails('project-a')
    const loadB = useLongTermMemoryStore.getState().loadProjectDetails('project-b')
    actionsB.resolve([projectAction('project-b')])
    await loadB
    actionsA.resolve([projectAction('project-a')])
    await loadA

    expect(useLongTermMemoryStore.getState()).toMatchObject({
      actions: [{ project_id: 'project-b' }],
      error: null,
      isDetailLoading: false,
    })
  })

  it('does not restore stale details after the account stores reset', async () => {
    const actions = deferred<LongTermActionItem[]>()
    const client = {
      listActions: vi.fn(() => actions.promise),
      listMilestones: vi.fn(async () => []),
      listProgress: vi.fn(async () => []),
      listToolRunsForProject: vi.fn(async () => []),
    } as unknown as LongTermMemoryClientContract
    configureLongTermMemoryClient(client)

    const pending = useLongTermMemoryStore.getState().loadProjectDetails('project-a')
    useLongTermMemoryStore.getState().reset()
    actions.resolve([projectAction('project-a')])
    await pending

    expect(useLongTermMemoryStore.getState()).toMatchObject({
      actions: [],
      isDetailLoading: false,
      selectedProjectId: '',
    })
  })

  it('does not let a pending detail load overwrite a newly created action', async () => {
    const staleActions = deferred<LongTermActionItem[]>()
    const createdAction = projectAction('project-a')
    const client = {
      createAction: vi.fn(async () => createdAction),
      listActions: vi.fn(() => staleActions.promise),
      listMilestones: vi.fn(async () => []),
      listProgress: vi.fn(async () => []),
      listToolRunsForProject: vi.fn(async () => []),
    } as unknown as LongTermMemoryClientContract
    configureLongTermMemoryClient(client)
    useLongTermMemoryStore.getState().selectProject('project-a')

    const pending = useLongTermMemoryStore.getState().loadProjectDetails('project-a')
    await useLongTermMemoryStore.getState().createAction({
      project_id: 'project-a',
      title: createdAction.title,
    })
    staleActions.resolve([])
    await pending

    expect(useLongTermMemoryStore.getState()).toMatchObject({
      actions: [createdAction],
      error: null,
      isDetailLoading: false,
      selectedProjectId: 'project-a',
    })
  })

  it('does not commit pending details after the selected project changes', async () => {
    const staleActions = deferred<LongTermActionItem[]>()
    const client = {
      listActions: vi.fn(() => staleActions.promise),
      listMilestones: vi.fn(async () => []),
      listProgress: vi.fn(async () => []),
      listToolRunsForProject: vi.fn(async () => []),
    } as unknown as LongTermMemoryClientContract
    configureLongTermMemoryClient(client)
    useLongTermMemoryStore.getState().selectProject('project-a')

    const pending = useLongTermMemoryStore.getState().loadProjectDetails('project-a')
    useLongTermMemoryStore.getState().selectProject('project-b')
    staleActions.resolve([projectAction('project-a')])
    await pending

    expect(useLongTermMemoryStore.getState()).toMatchObject({
      actions: [],
      isDetailLoading: false,
      selectedProjectId: 'project-b',
    })
  })

  it('creates and selects a goal-project pair through one client operation', async () => {
    const { goal, project } = atomicPair()
    const createGoalProject = vi.fn(async () => ({ goal, project }))
    configureLongTermMemoryClient({ createGoalProject } as unknown as LongTermMemoryClientContract)

    const created = await useLongTermMemoryStore.getState().createGoalProject({
      goal: { title: goal.title },
      project: { title: project.title },
    })

    expect(createGoalProject).toHaveBeenCalledOnce()
    expect(created).toEqual({ goal, project })
    expect(useLongTermMemoryStore.getState()).toMatchObject({
      goals: [goal],
      projects: [project],
      selectedGoalId: goal.goal_id,
      selectedProjectId: project.project_id,
    })
  })

  it('does not let an older overview overwrite a newly created goal-project pair', async () => {
    const oldGoals = deferred<LongTermGoal[]>()
    const oldProjects = deferred<LongTermProject[]>()
    const { goal, project } = atomicPair()
    const client = {
      createGoalProject: vi.fn(async () => ({ goal, project })),
      listGoals: vi.fn(() => oldGoals.promise),
      listProjects: vi.fn(() => oldProjects.promise),
    } as unknown as LongTermMemoryClientContract
    configureLongTermMemoryClient(client)

    const pendingOverview = useLongTermMemoryStore.getState().loadOverview()
    expect(useLongTermMemoryStore.getState().isLoading).toBe(true)

    await useLongTermMemoryStore.getState().createGoalProject({
      goal: { title: goal.title },
      project: { title: project.title },
    })
    expect(useLongTermMemoryStore.getState()).toMatchObject({
      goals: [goal],
      isLoading: false,
      projects: [project],
    })

    oldGoals.resolve([])
    oldProjects.resolve([])
    await pendingOverview

    expect(useLongTermMemoryStore.getState()).toMatchObject({
      goals: [goal],
      isLoading: false,
      projects: [project],
      selectedGoalId: goal.goal_id,
      selectedProjectId: project.project_id,
    })
  })
})
