import { create } from 'zustand'

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
} from '../domain/types/longTermMemory'
import { LongTermMemoryClient } from '../services/longTermMemoryClient'

export type LongTermMemoryClientContract = {
  createAction: (input: CreateActionItemInput) => Promise<LongTermActionItem>
  createGoal: (input: CreateGoalInput) => Promise<LongTermGoal>
  createMilestone: (input: CreateMilestoneInput) => Promise<LongTermMilestone>
  createProgress: (input: CreateProgressLogInput) => Promise<LongTermProgressLog>
  createProject: (input: CreateProjectInput) => Promise<LongTermProject>
  createToolRun: (input: CreateToolRunInput) => Promise<LongTermToolRun>
  listActions: (projectId: string) => Promise<LongTermActionItem[]>
  listGoals: () => Promise<LongTermGoal[]>
  listMilestones: (projectId: string) => Promise<LongTermMilestone[]>
  listProgress: (projectId: string) => Promise<LongTermProgressLog[]>
  listProjects: () => Promise<LongTermProject[]>
  listToolRuns: () => Promise<LongTermToolRun[]>
  listToolRunsForProject: (projectId: string) => Promise<LongTermToolRun[]>
  updateAction: (
    actionId: string,
    changes: Partial<CreateActionItemInput> & { status?: ActionItemStatus },
  ) => Promise<LongTermActionItem>
  updateGoal: (
    goalId: string,
    changes: Partial<CreateGoalInput> & { status?: GoalStatus },
  ) => Promise<LongTermGoal>
  updateMilestone: (
    milestoneId: string,
    changes: Partial<CreateMilestoneInput> & { status?: MilestoneStatus },
  ) => Promise<LongTermMilestone>
  updateProject: (
    projectId: string,
    changes: Partial<CreateProjectInput> & { status?: ProjectStatus },
  ) => Promise<LongTermProject>
}

export type LongTermMemoryStore = {
  actions: LongTermActionItem[]
  error: string | null
  goals: LongTermGoal[]
  isDetailLoading: boolean
  isLoading: boolean
  milestones: LongTermMilestone[]
  progress: LongTermProgressLog[]
  projects: LongTermProject[]
  selectedGoalId: string
  selectedProjectId: string
  toolRuns: LongTermToolRun[]
  createAction: (input: CreateActionItemInput) => Promise<LongTermActionItem>
  createGoal: (input: CreateGoalInput) => Promise<LongTermGoal>
  createMilestone: (input: CreateMilestoneInput) => Promise<LongTermMilestone>
  createProgress: (input: CreateProgressLogInput) => Promise<LongTermProgressLog>
  createProject: (input: CreateProjectInput) => Promise<LongTermProject>
  createToolRun: (input: CreateToolRunInput) => Promise<LongTermToolRun>
  loadOverview: () => Promise<void>
  loadProjectDetails: (projectId: string) => Promise<void>
  reset: () => void
  selectGoal: (goalId: string) => void
  selectProject: (projectId: string) => void
  updateActionStatus: (actionId: string, status: ActionItemStatus) => Promise<LongTermActionItem>
  updateGoalStatus: (goalId: string, status: GoalStatus) => Promise<LongTermGoal>
  updateMilestoneStatus: (
    milestoneId: string,
    status: MilestoneStatus,
  ) => Promise<LongTermMilestone>
  updateProjectStatus: (projectId: string, status: ProjectStatus) => Promise<LongTermProject>
}

let longTermMemoryClient: LongTermMemoryClientContract | null = null

export function configureLongTermMemoryClient(client: LongTermMemoryClientContract | null) {
  longTermMemoryClient = client
}

function getClient(): LongTermMemoryClientContract {
  if (!longTermMemoryClient) {
    longTermMemoryClient = new LongTermMemoryClient()
  }

  return longTermMemoryClient
}

function replaceById<T extends Record<string, unknown>>(items: T[], key: keyof T, updated: T): T[] {
  return items.map((item) => (item[key] === updated[key] ? updated : item))
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export const useLongTermMemoryStore = create<LongTermMemoryStore>((set, get) => ({
  actions: [],
  error: null,
  goals: [],
  isDetailLoading: false,
  isLoading: false,
  milestones: [],
  progress: [],
  projects: [],
  selectedGoalId: '',
  selectedProjectId: '',
  toolRuns: [],
  createAction: async (input) => {
    try {
      const action = await getClient().createAction(input)
      set((state) => ({ actions: [action, ...state.actions], error: null }))
      return action
    } catch (error) {
      set({ error: errorMessage(error, 'Unable to add action item') })
      throw error
    }
  },
  createGoal: async (input) => {
    try {
      const goal = await getClient().createGoal(input)
      set((state) => ({
        error: null,
        goals: [goal, ...state.goals],
        selectedGoalId: goal.goal_id,
        selectedProjectId: '',
      }))
      return goal
    } catch (error) {
      set({ error: errorMessage(error, 'Unable to create goal') })
      throw error
    }
  },
  createMilestone: async (input) => {
    try {
      const milestone = await getClient().createMilestone(input)
      set((state) => ({ error: null, milestones: [milestone, ...state.milestones] }))
      return milestone
    } catch (error) {
      set({ error: errorMessage(error, 'Unable to add milestone') })
      throw error
    }
  },
  createProgress: async (input) => {
    try {
      const progress = await getClient().createProgress(input)
      set((state) => ({ error: null, progress: [progress, ...state.progress] }))
      return progress
    } catch (error) {
      set({ error: errorMessage(error, 'Unable to add progress log') })
      throw error
    }
  },
  createProject: async (input) => {
    try {
      const project = await getClient().createProject(input)
      set((state) => ({
        error: null,
        projects: [project, ...state.projects],
        selectedGoalId: project.goal_id,
        selectedProjectId: project.project_id,
      }))
      return project
    } catch (error) {
      set({ error: errorMessage(error, 'Unable to create project') })
      throw error
    }
  },
  createToolRun: async (input) => {
    try {
      const toolRun = await getClient().createToolRun(input)
      set((state) => ({
        error: null,
        toolRuns:
          !toolRun.related_project_id || toolRun.related_project_id === state.selectedProjectId
            ? [toolRun, ...state.toolRuns]
            : state.toolRuns,
      }))
      return toolRun
    } catch (error) {
      set({ error: errorMessage(error, 'Unable to record tool run') })
      throw error
    }
  },
  loadOverview: async () => {
    set({ error: null, isLoading: true })
    try {
      const [goals, projects] = await Promise.all([getClient().listGoals(), getClient().listProjects()])
      set((state) => {
        const selectedGoalExists = goals.some((goal) => goal.goal_id === state.selectedGoalId)
        const selectedGoalId = selectedGoalExists ? state.selectedGoalId : goals[0]?.goal_id ?? ''
        const goalProjects = projects.filter((project) => project.goal_id === selectedGoalId)
        const selectedProjectExists = goalProjects.some(
          (project) => project.project_id === state.selectedProjectId,
        )

        return {
          error: null,
          goals,
          isLoading: false,
          projects,
          selectedGoalId,
          selectedProjectId: selectedProjectExists
            ? state.selectedProjectId
            : goalProjects[0]?.project_id ?? '',
        }
      })
    } catch (error) {
      set({ error: errorMessage(error, 'Unable to load memory'), isLoading: false })
      throw error
    }
  },
  loadProjectDetails: async (projectId) => {
    if (!projectId) {
      set({ actions: [], milestones: [], progress: [], toolRuns: [] })
      return
    }

    set({ error: null, isDetailLoading: true })
    try {
      const [milestones, actions, progress, toolRuns] = await Promise.all([
        getClient().listMilestones(projectId),
        getClient().listActions(projectId),
        getClient().listProgress(projectId),
        getClient().listToolRunsForProject(projectId),
      ])
      set({ actions, error: null, isDetailLoading: false, milestones, progress, toolRuns })
    } catch (error) {
      set({ error: errorMessage(error, 'Unable to load project memory'), isDetailLoading: false })
      throw error
    }
  },
  reset: () =>
    set({
      actions: [],
      error: null,
      goals: [],
      isDetailLoading: false,
      isLoading: false,
      milestones: [],
      progress: [],
      projects: [],
      selectedGoalId: '',
      selectedProjectId: '',
      toolRuns: [],
    }),
  selectGoal: (goalId) => {
    const project = get().projects.find((candidate) => candidate.goal_id === goalId)
    set({
      actions: [],
      milestones: [],
      progress: [],
      selectedGoalId: goalId,
      selectedProjectId: project?.project_id ?? '',
      toolRuns: [],
    })
  },
  selectProject: (projectId) => set({ selectedProjectId: projectId }),
  updateActionStatus: async (actionId, status) => {
    try {
      const action = await getClient().updateAction(actionId, { status })
      set((state) => ({
        actions: replaceById(state.actions, 'action_id', action),
        error: null,
      }))
      return action
    } catch (error) {
      set({ error: errorMessage(error, 'Unable to update action item') })
      throw error
    }
  },
  updateGoalStatus: async (goalId, status) => {
    try {
      const goal = await getClient().updateGoal(goalId, { status })
      set((state) => ({
        error: null,
        goals: replaceById(state.goals, 'goal_id', goal),
      }))
      return goal
    } catch (error) {
      set({ error: errorMessage(error, 'Unable to update goal') })
      throw error
    }
  },
  updateMilestoneStatus: async (milestoneId, status) => {
    try {
      const milestone = await getClient().updateMilestone(milestoneId, { status })
      set((state) => ({
        error: null,
        milestones: replaceById(state.milestones, 'milestone_id', milestone),
      }))
      return milestone
    } catch (error) {
      set({ error: errorMessage(error, 'Unable to update milestone') })
      throw error
    }
  },
  updateProjectStatus: async (projectId, status) => {
    try {
      const project = await getClient().updateProject(projectId, { status })
      set((state) => ({
        error: null,
        projects: replaceById(state.projects, 'project_id', project),
      }))
      return project
    } catch (error) {
      set({ error: errorMessage(error, 'Unable to update project') })
      throw error
    }
  },
}))

export async function recordLongTermToolRun(input: CreateToolRunInput): Promise<LongTermToolRun | null> {
  try {
    const toolRun = await getClient().createToolRun(input)
    useLongTermMemoryStore.setState((state) => ({
      toolRuns:
        !toolRun.related_project_id || toolRun.related_project_id === state.selectedProjectId
          ? [toolRun, ...state.toolRuns]
          : state.toolRuns,
    }))
    return toolRun
  } catch {
    return null
  }
}
