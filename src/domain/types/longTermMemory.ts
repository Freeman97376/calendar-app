export type GoalStatus = 'active' | 'paused' | 'completed' | 'archived'
export type ProjectStatus = 'active' | 'paused' | 'completed'
export type MilestoneStatus = 'not_started' | 'in_progress' | 'done' | 'blocked' | 'skipped'
export type ActionItemStatus = 'todo' | 'scheduled' | 'done' | 'blocked' | 'skipped'
export type ProgressLogType = 'update' | 'decision' | 'blocker' | 'review' | 'tool_result'
export type ToolRunStatus = 'success' | 'failed' | 'needs_user_confirmation'

export type LongTermGoal = {
  goal_id: string
  title: string
  description: string
  status: GoalStatus
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type LongTermProject = {
  project_id: string
  goal_id: string
  title: string
  description: string
  status: ProjectStatus
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type LongTermMilestone = {
  milestone_id: string
  project_id: string
  title: string
  description: string
  due_date: string | null
  status: MilestoneStatus
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type LongTermActionItem = {
  action_id: string
  project_id: string
  milestone_id: string | null
  title: string
  description: string
  due_date: string | null
  status: ActionItemStatus
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type LongTermProgressLog = {
  progress_id: string
  project_id: string
  goal_id: string | null
  action_id: string | null
  log_type: ProgressLogType
  summary: string
  details: string
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type LongTermToolRun = {
  id: string
  tool_run_id: string
  tool_name: string
  intent: string
  input_summary: string
  output_summary: string
  related_goal_id: string | null
  related_project_id: string | null
  status: ToolRunStatus
  project_id: string | null
  goal_id: string | null
  input: Record<string, unknown>
  output: Record<string, unknown>
  error: string
  created_at: string
  updated_at: string
}

export type LongTermMemorySearchResult = {
  entity_type: 'goal' | 'project' | 'milestone' | 'action_item' | 'progress_log' | 'tool_run'
  item_id: string
  project_id: string | null
  goal_id: string | null
  title: string
  description: string
  status: string
  updated_at: string
}

export type CreateGoalInput = {
  description?: string
  metadata?: Record<string, unknown>
  status?: GoalStatus
  title: string
}

export type CreateProjectInput = {
  description?: string
  goal_id: string
  metadata?: Record<string, unknown>
  status?: ProjectStatus
  title: string
}

export type CreateMilestoneInput = {
  description?: string
  due_date?: string
  metadata?: Record<string, unknown>
  project_id: string
  status?: MilestoneStatus
  title: string
}

export type CreateActionItemInput = {
  description?: string
  due_date?: string
  metadata?: Record<string, unknown>
  milestone_id?: string
  project_id: string
  status?: ActionItemStatus
  title: string
}

export type CreateProgressLogInput = {
  action_id?: string
  details?: string
  goal_id?: string
  log_type?: ProgressLogType
  metadata?: Record<string, unknown>
  project_id: string
  summary: string
}

export type CreateToolRunInput = {
  error?: string
  input?: Record<string, unknown>
  input_summary?: string
  intent?: string
  output?: Record<string, unknown>
  output_summary?: string
  related_goal_id?: string
  related_project_id?: string
  status?: ToolRunStatus
  tool_name: string
}
