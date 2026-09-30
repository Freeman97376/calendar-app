import { create } from 'zustand'

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
} from '../domain/types/longTermMemory'
import { LongTermMemoryClient } from '../services/longTermMemoryClient'

export type LongTermMemoryClientContract = {
  createAction: (input: CreateActionItemInput) => Promise<LongTermActionItem>
  createGoal: (input: CreateGoalInput) => Promise<LongTermGoal>
  createGoalProject: (input: CreateGoalProjectInput) => Promise<CreateGoalProjectResult>
  createMilestone: (input: CreateMilestoneInput) => Promise<LongTermMilestone>
  createProgress: (input: CreateProgressLogInput) => Promise<LongTermProgressLog>
  createProject: (input: CreateProjectInput) => Promise<LongTermProject>
  createToolRun: (input: CreateToolRunInput) => Promise<LongTermToolRun>
  getProject: (projectId: string) => Promise<LongTermProject>
  listActions: (projectId: string) => Promise<LongTermActionItem[]>
  listGoals: () => Promise<LongTermGoal[]>
  listMilestones: (projectId: string) => Promise<LongTermMilestone[]>
  listProgress: (projectId: string) => Promise<LongTermProgressLog[]>
  listProjects: () => Promise<LongTermProject[]>
  listToolRuns: () => Promise<LongTermToolRun[]>
  listToolRunsForProject: (projectId: string) => Promise<LongTermToolRun[]>
  search: (query: string) => Promise<LongTermMemorySearchResult[]>
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
  loadedProjectId: string
  milestones: LongTermMilestone[]
  progress: LongTermProgressLog[]
  projects: LongTermProject[]
  selectedGoalId: string
  selectedProjectId: string
  toolRuns: LongTermToolRun[]
  createAction: (input: CreateActionItemInput) => Promise<LongTermActionItem>
  createGoal: (input: CreateGoalInput) => Promise<LongTermGoal>
  createGoalProject: (input: CreateGoalProjectInput) => Promise<CreateGoalProjectResult>
  createMilestone: (input: CreateMilestoneInput) => Promise<LongTermMilestone>
  createProgress: (input: CreateProgressLogInput) => Promise<LongTermProgressLog>
  createProject: (input: CreateProjectInput) => Promise<LongTermProject>
  createToolRun: (input: CreateToolRunInput) => Promise<LongTermToolRun>
  getProject: (projectId: string) => Promise<LongTermProject>
  loadOverview: () => Promise<void>
  loadProjectDetails: (projectId: string) => Promise<void>
  reset: () => void
  selectGoal: (goalId: string) => void
  selectProject: (projectId: string) => void
  search: (query: string) => Promise<LongTermMemorySearchResult[]>
  updateAction: (
    actionId: string,
    changes: Partial<CreateActionItemInput> & { status?: ActionItemStatus },
  ) => Promise<LongTermActionItem>
  updateMilestone: (
    milestoneId: string,
    changes: Partial<CreateMilestoneInput> & { status?: MilestoneStatus },
  ) => Promise<LongTermMilestone>
  updateProject: (
    projectId: string,
    changes: Partial<CreateProjectInput> & { status?: ProjectStatus },
  ) => Promise<LongTermProject>
  updateActionStatus: (actionId: string, status: ActionItemStatus) => Promise<LongTermActionItem>
  updateGoalStatus: (goalId: string, status: GoalStatus) => Promise<LongTermGoal>
  updateMilestoneStatus: (
    milestoneId: string,
    status: MilestoneStatus,
  ) => Promise<LongTermMilestone>
  updateProjectStatus: (projectId: string, status: ProjectStatus) => Promise<LongTermProject>
}

let longTermMemoryClient: LongTermMemoryClientContract | null = null
let overviewLoadGeneration = 0
let projectDetailLoadGeneration = 0

export function configureLongTermMemoryClient(client: LongTermMemoryClientContract | null) {
  overviewLoadGeneration += 1
  projectDetailLoadGeneration += 1
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
  loadedProjectId: '',
  milestones: [],
  progress: [],
  projects: [],
  selectedGoalId: '',
  selectedProjectId: '',
  toolRuns: [],
  createAction: async (input) => {
    try {
      const action = await getClient().createAction(input)
      const updatesSelectedProject = action.project_id === get().selectedProjectId
      if (updatesSelectedProject) projectDetailLoadGeneration += 1
      set((state) => ({
        actions: updatesSelectedProject ? [action, ...state.actions] : state.actions,
        error: null,
        isDetailLoading: updatesSelectedProject ? false : state.isDetailLoading,
      }))
      return action
    } catch (error) {
      set({ error: errorMessage(error, 'Unable to add action item') })
      throw error
    }
  },
  createGoal: async (input) => {
    try {
      const goal = await getClient().createGoal(input)
      overviewLoadGeneration += 1
      projectDetailLoadGeneration += 1
      set((state) => ({
        actions: [],
        error: null,
        goals: [goal, ...state.goals],
        isDetailLoading: false,
        isLoading: false,
        loadedProjectId: '',
        milestones: [],
        progress: [],
        selectedGoalId: goal.goal_id,
        selectedProjectId: '',
        toolRuns: [],
      }))
      return goal
    } catch (error) {
      set({ error: errorMessage(error, 'Unable to create goal') })
      throw error
    }
  },
  createGoalProject: async (input) => {
    try {
      const created = await getClient().createGoalProject(input)
      overviewLoadGeneration += 1
      projectDetailLoadGeneration += 1
      set((state) => ({
        actions: [],
        error: null,
        goals: [created.goal, ...state.goals],
        isDetailLoading: false,
        isLoading: false,
        loadedProjectId: '',
        milestones: [],
        progress: [],
        projects: [created.project, ...state.projects],
        selectedGoalId: created.goal.goal_id,
        selectedProjectId: created.project.project_id,
        toolRuns: [],
      }))
      return created
    } catch (error) {
      set({ error: errorMessage(error, 'Unable to create goal and project') })
      throw error
    }
  },
  createMilestone: async (input) => {
    try {
      const milestone = await getClient().createMilestone(input)
      const updatesSelectedProject = milestone.project_id === get().selectedProjectId
      if (updatesSelectedProject) projectDetailLoadGeneration += 1
      set((state) => ({
        error: null,
        isDetailLoading: updatesSelectedProject ? false : state.isDetailLoading,
        milestones: updatesSelectedProject ? [milestone, ...state.milestones] : state.milestones,
      }))
      return milestone
    } catch (error) {
      set({ error: errorMessage(error, 'Unable to add milestone') })
      throw error
    }
  },
  createProgress: async (input) => {
    try {
      const progress = await getClient().createProgress(input)
      const updatesSelectedProject = progress.project_id === get().selectedProjectId
      if (updatesSelectedProject) projectDetailLoadGeneration += 1
      set((state) => ({
        error: null,
        isDetailLoading: updatesSelectedProject ? false : state.isDetailLoading,
        progress: updatesSelectedProject ? [progress, ...state.progress] : state.progress,
      }))
      return progress
    } catch (error) {
      set({ error: errorMessage(error, 'Unable to add progress log') })
      throw error
    }
  },
  createProject: async (input) => {
    try {
      const project = await getClient().createProject(input)
      overviewLoadGeneration += 1
      projectDetailLoadGeneration += 1
      set((state) => ({
        actions: [],
        error: null,
        isDetailLoading: false,
        isLoading: false,
        loadedProjectId: '',
        milestones: [],
        progress: [],
        projects: [project, ...state.projects],
        selectedGoalId: project.goal_id,
        selectedProjectId: project.project_id,
        toolRuns: [],
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
      const updatesSelectedProject =
        !toolRun.related_project_id || toolRun.related_project_id === get().selectedProjectId
      if (updatesSelectedProject) projectDetailLoadGeneration += 1
      set((state) => ({
        error: null,
        isDetailLoading: updatesSelectedProject ? false : state.isDetailLoading,
        toolRuns: updatesSelectedProject ? [toolRun, ...state.toolRuns] : state.toolRuns,
      }))
      return toolRun
    } catch (error) {
      set({ error: errorMessage(error, 'Unable to record tool run') })
      throw error
    }
  },
  getProject: async (projectId) => {
    try {
      return await getClient().getProject(projectId)
    } catch (error) {
      set({ error: errorMessage(error, 'Unable to load project') })
      throw error
    }
  },
  loadOverview: async () => {
    const loadGeneration = ++overviewLoadGeneration
    set({ error: null, isLoading: true })
    try {
      const [goals, projects] = await Promise.all([
        getClient().listGoals(),
        getClient().listProjects(),
      ])
      if (loadGeneration !== overviewLoadGeneration) return

      set((state) => {
        const selectedGoalExists = goals.some((goal) => goal.goal_id === state.selectedGoalId)
        const selectedGoalId = selectedGoalExists ? state.selectedGoalId : (goals[0]?.goal_id ?? '')
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
            : (goalProjects[0]?.project_id ?? ''),
        }
      })
    } catch (error) {
      if (loadGeneration !== overviewLoadGeneration) return
      set({ error: errorMessage(error, 'Unable to load memory'), isLoading: false })
      throw error
    }
  },
  loadProjectDetails: async (projectId) => {
    const loadGeneration = ++projectDetailLoadGeneration
    if (!projectId) {
      set({
        actions: [],
        error: null,
        isDetailLoading: false,
        loadedProjectId: '',
        milestones: [],
        progress: [],
        toolRuns: [],
      })
      return
    }

    set({
      actions: [],
      error: null,
      isDetailLoading: true,
      loadedProjectId: '',
      milestones: [],
      progress: [],
      selectedProjectId: projectId,
      toolRuns: [],
    })
    try {
      const [milestones, actions, progress, toolRuns] = await Promise.all([
        getClient().listMilestones(projectId),
        getClient().listActions(projectId),
        getClient().listProgress(projectId),
        getClient().listToolRunsForProject(projectId),
      ])
      if (loadGeneration !== projectDetailLoadGeneration) return
      set({
        actions,
        error: null,
        isDetailLoading: false,
        loadedProjectId: projectId,
        milestones,
        progress,
        toolRuns,
      })
    } catch (error) {
      if (loadGeneration !== projectDetailLoadGeneration) return
      set({ error: errorMessage(error, 'Unable to load project memory'), isDetailLoading: false })
      throw error
    }
  },
  reset: () => {
    overviewLoadGeneration += 1
    projectDetailLoadGeneration += 1
    set({
      actions: [],
      error: null,
      goals: [],
      isDetailLoading: false,
      isLoading: false,
      loadedProjectId: '',
      milestones: [],
      progress: [],
      projects: [],
      selectedGoalId: '',
      selectedProjectId: '',
      toolRuns: [],
    })
  },
  selectGoal: (goalId) => {
    const project = get().projects.find((candidate) => candidate.goal_id === goalId)
    projectDetailLoadGeneration += 1
    set({
      actions: [],
      isDetailLoading: false,
      loadedProjectId: '',
      milestones: [],
      progress: [],
      selectedGoalId: goalId,
      selectedProjectId: project?.project_id ?? '',
      toolRuns: [],
    })
  },
  selectProject: (projectId) => {
    if (projectId === get().selectedProjectId) return
    projectDetailLoadGeneration += 1
    set({
      actions: [],
      isDetailLoading: false,
      loadedProjectId: '',
      milestones: [],
      progress: [],
      selectedProjectId: projectId,
      toolRuns: [],
    })
  },
  search: async (query) => {
    try {
      return await getClient().search(query)
    } catch (error) {
      set({ error: errorMessage(error, 'Unable to search memory') })
      throw error
    }
  },
  updateAction: async (actionId, changes) => {
    try {
      const action = await getClient().updateAction(actionId, changes)
      const updatesSelectedProject = action.project_id === get().selectedProjectId
      if (updatesSelectedProject) projectDetailLoadGeneration += 1
      set((state) => ({
        actions: updatesSelectedProject
          ? replaceById(state.actions, 'action_id', action)
          : state.actions,
        error: null,
        isDetailLoading: updatesSelectedProject ? false : state.isDetailLoading,
      }))
      return action
    } catch (error) {
      set({ error: errorMessage(error, 'Unable to update action item') })
      throw error
    }
  },
  updateActionStatus: (actionId, status) => get().updateAction(actionId, { status }),
  updateGoalStatus: async (goalId, status) => {
    try {
      const goal = await getClient().updateGoal(goalId, { status })
      overviewLoadGeneration += 1
      set((state) => ({
        error: null,
        goals: replaceById(state.goals, 'goal_id', goal),
        isLoading: false,
      }))
      return goal
    } catch (error) {
      set({ error: errorMessage(error, 'Unable to update goal') })
      throw error
    }
  },
  updateMilestone: async (milestoneId, changes) => {
    try {
      const milestone = await getClient().updateMilestone(milestoneId, changes)
      const updatesSelectedProject = milestone.project_id === get().selectedProjectId
      if (updatesSelectedProject) projectDetailLoadGeneration += 1
      set((state) => ({
        error: null,
        isDetailLoading: updatesSelectedProject ? false : state.isDetailLoading,
        milestones: updatesSelectedProject
          ? replaceById(state.milestones, 'milestone_id', milestone)
          : state.milestones,
      }))
      return milestone
    } catch (error) {
      set({ error: errorMessage(error, 'Unable to update milestone') })
      throw error
    }
  },
  updateMilestoneStatus: (milestoneId, status) => get().updateMilestone(milestoneId, { status }),
  updateProject: async (projectId, changes) => {
    try {
      const project = await getClient().updateProject(projectId, changes)
      overviewLoadGeneration += 1
      set((state) => ({
        error: null,
        isLoading: false,
        projects: replaceById(state.projects, 'project_id', project),
      }))
      return project
    } catch (error) {
      set({ error: errorMessage(error, 'Unable to update project') })
      throw error
    }
  },
  updateProjectStatus: async (projectId, status) => {
    try {
      const project = await getClient().updateProject(projectId, { status })
      overviewLoadGeneration += 1
      set((state) => ({
        error: null,
        isLoading: false,
        projects: replaceById(state.projects, 'project_id', project),
      }))
      return project
    } catch (error) {
      set({ error: errorMessage(error, 'Unable to update project') })
      throw error
    }
  },
}))

export async function recordLongTermToolRun(
  input: CreateToolRunInput,
): Promise<LongTermToolRun | null> {
  try {
    const toolRun = await getClient().createToolRun(input)
    const updatesSelectedProject =
      !toolRun.related_project_id ||
      toolRun.related_project_id === useLongTermMemoryStore.getState().selectedProjectId
    if (updatesSelectedProject) projectDetailLoadGeneration += 1
    useLongTermMemoryStore.setState((state) => ({
      isDetailLoading: updatesSelectedProject ? false : state.isDetailLoading,
      toolRuns: updatesSelectedProject ? [toolRun, ...state.toolRuns] : state.toolRuns,
    }))
    return toolRun
  } catch {
    return null
  }
}
