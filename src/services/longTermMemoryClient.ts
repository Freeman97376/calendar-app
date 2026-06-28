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
} from '../domain/types/longTermMemory'

type ClientOptions = {
  baseUrl?: string
  fetcher?: typeof fetch
}

const defaultFetcher: typeof fetch = (input, init) => globalThis.fetch(input, init)

function defaultBaseUrl(): string {
  return (
    import.meta.env.VITE_MEMORY_API_BASE_URL ??
    import.meta.env.VITE_FRIDGE_API_BASE_URL ??
    'http://127.0.0.1:8787'
  )
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const payload = (await response.json()) as unknown

  if (!response.ok) {
    const message =
      typeof payload === 'object' &&
      payload !== null &&
      'error' in payload &&
      typeof payload.error === 'object' &&
      payload.error !== null &&
      'message' in payload.error
        ? String(payload.error.message)
        : `Memory API request failed with status ${response.status}`
    throw new Error(message)
  }

  return payload
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value)
}

export class LongTermMemoryClient {
  private readonly baseUrl: string
  private readonly fetcher: typeof fetch

  constructor(options: ClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? defaultBaseUrl()).replace(/\/$/, '')
    this.fetcher = options.fetcher ?? defaultFetcher
  }

  async listGoals(): Promise<LongTermGoal[]> {
    const payload = (await this.get('/api/memory/goals')) as { goals: LongTermGoal[] }
    return payload.goals
  }

  async createGoal(input: CreateGoalInput): Promise<LongTermGoal> {
    const payload = (await this.post('/api/memory/goals', input)) as { goal: LongTermGoal }
    return payload.goal
  }

  async updateGoal(goalId: string, changes: Partial<CreateGoalInput> & { status?: GoalStatus }) {
    const payload = (await this.patch(`/api/memory/goals/${encodePathSegment(goalId)}`, changes)) as {
      goal: LongTermGoal
    }
    return payload.goal
  }

  async listProjects(): Promise<LongTermProject[]> {
    const payload = (await this.get('/api/memory/projects')) as { projects: LongTermProject[] }
    return payload.projects
  }

  async createProject(input: CreateProjectInput): Promise<LongTermProject> {
    const payload = (await this.post('/api/memory/projects', input)) as { project: LongTermProject }
    return payload.project
  }

  async getProject(projectId: string): Promise<LongTermProject> {
    const payload = (await this.get(`/api/memory/projects/${encodePathSegment(projectId)}`)) as {
      project: LongTermProject
    }
    return payload.project
  }

  async updateProject(
    projectId: string,
    changes: Partial<CreateProjectInput> & { status?: ProjectStatus },
  ): Promise<LongTermProject> {
    const payload = (await this.patch(
      `/api/memory/projects/${encodePathSegment(projectId)}`,
      changes,
    )) as { project: LongTermProject }
    return payload.project
  }

  async listMilestones(projectId: string): Promise<LongTermMilestone[]> {
    const payload = (await this.get(
      `/api/memory/projects/${encodePathSegment(projectId)}/milestones`,
    )) as { milestones: LongTermMilestone[] }
    return payload.milestones
  }

  async createMilestone(input: CreateMilestoneInput): Promise<LongTermMilestone> {
    const payload = (await this.post('/api/memory/milestones', input)) as {
      milestone: LongTermMilestone
    }
    return payload.milestone
  }

  async updateMilestone(
    milestoneId: string,
    changes: Partial<CreateMilestoneInput> & { status?: MilestoneStatus },
  ): Promise<LongTermMilestone> {
    const payload = (await this.patch(
      `/api/memory/milestones/${encodePathSegment(milestoneId)}`,
      changes,
    )) as { milestone: LongTermMilestone }
    return payload.milestone
  }

  async listActions(projectId: string): Promise<LongTermActionItem[]> {
    const payload = (await this.get(
      `/api/memory/projects/${encodePathSegment(projectId)}/actions`,
    )) as { actions: LongTermActionItem[] }
    return payload.actions
  }

  async createAction(input: CreateActionItemInput): Promise<LongTermActionItem> {
    const payload = (await this.post('/api/memory/actions', input)) as {
      action: LongTermActionItem
    }
    return payload.action
  }

  async updateAction(
    actionId: string,
    changes: Partial<CreateActionItemInput> & { status?: ActionItemStatus },
  ): Promise<LongTermActionItem> {
    const payload = (await this.patch(
      `/api/memory/actions/${encodePathSegment(actionId)}`,
      changes,
    )) as { action: LongTermActionItem }
    return payload.action
  }

  async listProgress(projectId: string): Promise<LongTermProgressLog[]> {
    const payload = (await this.get(
      `/api/memory/projects/${encodePathSegment(projectId)}/progress`,
    )) as { progress: LongTermProgressLog[] }
    return payload.progress
  }

  async createProgress(input: CreateProgressLogInput): Promise<LongTermProgressLog> {
    const payload = (await this.post('/api/memory/progress', input)) as {
      progress: LongTermProgressLog
    }
    return payload.progress
  }

  async createToolRun(input: CreateToolRunInput): Promise<LongTermToolRun> {
    const payload = (await this.post('/api/memory/tool-runs', input)) as {
      tool_run: LongTermToolRun
    }
    return payload.tool_run
  }

  async listToolRuns(): Promise<LongTermToolRun[]> {
    const payload = (await this.get('/api/memory/tool-runs')) as { tool_runs: LongTermToolRun[] }
    return payload.tool_runs
  }

  async listToolRunsForProject(projectId: string): Promise<LongTermToolRun[]> {
    const payload = (await this.get(
      `/api/memory/projects/${encodePathSegment(projectId)}/tool-runs`,
    )) as { tool_runs: LongTermToolRun[] }
    return payload.tool_runs
  }

  async search(query: string): Promise<LongTermMemorySearchResult[]> {
    const payload = (await this.get(`/api/memory/search?q=${encodeURIComponent(query)}`)) as {
      results: LongTermMemorySearchResult[]
    }
    return payload.results
  }

  private async get(path: string): Promise<unknown> {
    const response = await this.fetcher(`${this.baseUrl}${path}`)
    return parseJsonResponse(response)
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return parseJsonResponse(response)
  }

  private async patch(path: string, body: unknown): Promise<unknown> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return parseJsonResponse(response)
  }
}
