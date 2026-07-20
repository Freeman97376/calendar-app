export type AIUsageMode = 'economy' | 'balanced' | 'quality'
export type AIUsageModeSelection = AIUsageMode | 'inherit'

export type QuestionChoice = {
  id: string
  label: string
  description?: string
}

export type QuestionBatchItem = {
  id: string
  prompt: string
  selectionMode: 'single' | 'multiple'
  choices: QuestionChoice[]
  allowCustom: boolean
}

export type QuestionBatchValue = {
  kind: 'question_batch'
  questions: QuestionBatchItem[]
}

export type GoalConversationMessage = {
  message_id: string
  thread_id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  structured: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type GoalConversationThread = {
  thread_id: string
  kind: 'goal_draft' | 'active_goal'
  status: 'draft' | 'active' | 'archived'
  title: string
  goal_id?: string | null
  project_id?: string | null
  template_id?: string | null
  rolling_summary: string
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type MetricEntry = {
  entry_id: string
  metric_id: string
  observed_at: string
  numeric_value?: number | null
  text_value?: string | null
  source: string
  confidence: number
  is_anomaly: boolean
  anomaly_reason: string
  notes: string
}

export type MetricDefinition = {
  metric_id: string
  project_id: string
  name: string
  role: 'leading' | 'lagging'
  unit: string
  direction: 'increase' | 'decrease' | 'range' | 'maintain'
  baseline_value?: number | null
  target_value?: number | null
  ideal_value?: number | null
  acceptable_min?: number | null
  acceptable_max?: number | null
  target_date?: string | null
  cadence: string
  is_required: boolean
  is_active: boolean
  entries: MetricEntry[]
}

export type UsageResolution = {
  selected_mode: AIUsageMode
  effective_mode: AIUsageMode
  administrator_maximum_mode: AIUsageMode
  server_default_mode: AIUsageMode
  limits: Record<string, unknown>
}

export type PlanChangeDiff = {
  id: string
  entity: 'milestone' | 'action'
  operation: 'create' | 'update' | 'delete'
  external_id: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
}

export type PlanChangeProposal = {
  proposal_id: string
  project_id?: string | null
  thread_id?: string | null
  base_version_id?: string | null
  status: 'pending' | 'accepted' | 'rejected'
  proposal: Record<string, unknown> & {
    snapshot?: Record<string, unknown>
    capacityImpact?: { before_minutes: number; after_minutes: number; available_minutes: number }
    calendarImpact?: { draft_count: number; auto_apply: boolean }
  }
  diff: PlanChangeDiff[]
  reason: string
  created_at: string
  updated_at: string
}

export type GoalControlDashboard = {
  project: Record<string, unknown> & {
    project_id: string
    title: string
    description: string
    status: string
  }
  goal: (Record<string, unknown> & { goal_id: string; title: string }) | null
  actions: Array<
    Record<string, unknown> & {
      action_id: string
      title: string
      status: string
      estimated_minutes: number
      execution_tier: string
      due_date?: string | null
    }
  >
  milestones: Array<
    Record<string, unknown> & {
      milestone_id: string
      title: string
      status: string
      due_date?: string | null
    }
  >
  metrics: MetricDefinition[]
  policy: Record<string, unknown> & {
    ai_usage_mode?: AIUsageMode | null
    active_tier: string
    weekly_capacity_minutes: number
    buffer_percent: number
    planning_brief?: Record<string, unknown>
  }
  dependencies: Array<Record<string, unknown>>
  effort: Array<Record<string, unknown> & { minutes: number; occurred_on: string }>
  health: {
    status: 'on_track' | 'attention' | 'at_risk' | 'paused'
    factors: Array<{ key: string; label: string; value: number; severity: string }>
    confidence: string
  }
  critical_path: {
    action_ids: string[]
    total_minutes: number
    has_cycle: boolean
    projected_finish?: string | null
    usable_weekly_minutes?: number
  }
  milestone_predictions: Array<{
    milestone_id: string
    projected_finish: string
    due_date?: string | null
    at_risk: boolean
  }>
  review: {
    recommend_replan: boolean
    recommend_pause: boolean
    triggers: Array<{ key: string; label: string }>
    trigger_count: number
    safety_warnings: Array<{ key: string; label: string }>
    adjustment_question: string
  }
  pending_check_in:
    | (Record<string, unknown> & { check_in_id: string; questions: QuestionBatchItem[] })
    | null
  versions: Array<
    Record<string, unknown> & {
      version_id: string
      version_number: number
      summary: string
      source: string
      created_at: string
      is_pinned: boolean
      snapshot?: Record<string, unknown>
    }
  >
  proposals: PlanChangeProposal[]
  threads: GoalConversationThread[]
  usage: UsageResolution
}

export type AIUsageSummary = {
  selected_mode: AIUsageMode
  effective_mode: AIUsageMode
  administrator_maximum_mode: AIUsageMode
  server_default_mode: AIUsageMode
  routine_input_tokens: number
  routine_output_tokens: number
  planning_input_tokens: number
  planning_output_tokens: number
  total_tokens: number
  request_count: number
  soft_limit: number
  hard_limit: number
  percent_used: number
  degraded: boolean
  warning: boolean
  month: string
  reset_at?: string
}

export type GoalActivationPlan = {
  title: string
  summary: string
  rollingSummary?: string
  target_date?: string
  template_id?: string
  template_label?: string
  tool_features?: string[]
  route_tags?: string[]
  metrics: Array<Record<string, unknown> & { name: string }>
  milestones: Array<Record<string, unknown> & { title: string }>
  actions: Array<Record<string, unknown> & { title: string }>
  dependencies?: Array<Record<string, unknown>>
  policy: Record<string, unknown>
}
