import { z } from 'zod'

const ISODateSchema = z.string().date()
const MetadataSchema = z.record(z.unknown())

const GoalPlanMilestoneSchema = z
  .object({
    milestone_id: z.string().trim().min(1).max(80).optional(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(1000).default(''),
    due_date: ISODateSchema.nullable().optional(),
    status: z.enum(['not_started', 'in_progress', 'blocked', 'done']).optional(),
    metadata: MetadataSchema.optional(),
  })
  .strict()

const GoalPlanActionSchema = z
  .object({
    action_id: z.string().trim().min(1).max(80).optional(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(1000).default(''),
    milestone_id: z.string().trim().min(1).max(80).nullable().optional(),
    milestone_title: z.string().trim().max(200).nullable().optional(),
    due_date: ISODateSchema.nullable().optional(),
    estimated_minutes: z.coerce.number().int().min(5).max(10_080).default(30),
    priority: z.enum(['high', 'medium', 'low']).default('medium'),
    energy_needed: z.enum(['high', 'medium', 'low']).default('medium'),
    execution_tier: z.enum(['minimum', 'standard', 'stretch']).default('standard'),
    status: z.enum(['todo', 'in_progress', 'blocked', 'done', 'skipped']).optional(),
    metadata: MetadataSchema.optional(),
  })
  .strict()

const GoalPlanRiskSchema = z
  .object({
    label: z.string().trim().min(1).max(300),
    severity: z.enum(['low', 'medium', 'high']).default('medium'),
    mitigation: z.string().trim().max(500).optional(),
  })
  .strict()

const MissingInformationSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(200),
    impact: z.string().trim().min(1).max(500),
    blocking: z.boolean().default(false),
  })
  .strict()

const GoalPlanMetricSchema = z
  .object({
    metric_id: z.string().trim().min(1).max(80).optional(),
    name: z.string().trim().min(1).max(120),
    role: z.enum(['leading', 'lagging']).default('leading'),
    value_type: z.string().trim().min(1).max(24).default('number'),
    unit: z.string().trim().max(32).default(''),
    direction: z.enum(['increase', 'decrease', 'range', 'maintain']).default('increase'),
    baseline_value: z.number().nullable().optional(),
    target_value: z.number().nullable().optional(),
    ideal_value: z.number().nullable().optional(),
    acceptable_min: z.number().nullable().optional(),
    acceptable_max: z.number().nullable().optional(),
    safety_min: z.number().nullable().optional(),
    safety_max: z.number().nullable().optional(),
    target_date: ISODateSchema.nullable().optional(),
    cadence: z.string().trim().min(1).max(24).default('weekly'),
    is_required: z.boolean().default(false),
    is_active: z.boolean().optional(),
    metadata: MetadataSchema.optional(),
  })
  .strict()

const GoalPlanDependencySchema = z
  .object({
    dependency_id: z.string().trim().min(1).max(80).optional(),
    predecessor_action_id: z.string().trim().min(1).max(80).optional(),
    successor_action_id: z.string().trim().min(1).max(80).optional(),
    predecessor_title: z.string().trim().min(1).max(200).optional(),
    successor_title: z.string().trim().min(1).max(200).optional(),
  })
  .strict()

const GoalPlanPolicySchema = z
  .object({
    policy_id: z.string().trim().min(1).max(80).optional(),
    weekly_capacity_minutes: z.coerce.number().int().min(0).max(10_080).default(300),
    buffer_percent: z.coerce.number().min(0).max(80).default(20),
    active_tier: z.enum(['minimum', 'standard', 'stretch']).default('standard'),
    ai_usage_mode: z.enum(['inherit', 'economy', 'balanced', 'quality']).nullable().optional(),
    available_days: z.array(z.string().trim().min(1).max(24)).max(7).default([]),
    replan_thresholds: MetadataSchema.default({}),
    stop_rules: z.array(z.unknown()).max(20).default([]),
    planning_brief: MetadataSchema.default({}),
  })
  .strict()

export const GoalActivationPlanSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(2000),
    rollingSummary: z.string().trim().max(12_000).optional(),
    target_date: ISODateSchema.nullable().optional(),
    template_id: z.string().trim().min(1).max(80).default('goal-planner'),
    template_label: z.string().trim().min(1).max(120).default('Goal Planner'),
    tool_name: z.string().trim().min(1).max(120).default('Goal Planner'),
    tool_kind: z.enum(['fitness', 'agent-learning']).nullable().optional(),
    adapter_id: z.string().trim().min(1).max(80).default('ai-progress'),
    activation_form: z.record(z.string()).default({}),
    activation_journey_id: z.string().trim().min(1).max(80).optional(),
    source: z.enum(['ai-assistant', 'template-library']).optional(),
    tool_features: z.array(z.string().trim().min(1).max(80)).max(16).default([]),
    route_tags: z.array(z.string().trim().min(1).max(80)).max(24).default([]),
    assumptions: z.array(z.string().trim().min(1).max(500)).max(8).default([]),
    missing_information: z.array(MissingInformationSchema).max(8).default([]),
    constraints: z.array(z.string().trim().min(1).max(500)).max(12).default([]),
    risks: z.array(GoalPlanRiskSchema).max(12).default([]),
    review_cadence: z
      .object({
        frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly']).default('weekly'),
        local_time: z.string().trim().max(16).optional(),
        timezone: z.string().trim().max(80).optional(),
      })
      .strict()
      .default({ frequency: 'weekly' }),
    confidence: z
      .object({
        level: z.enum(['low', 'medium', 'high']).default('medium'),
        reasons: z.array(z.string().trim().min(1).max(300)).max(8).default([]),
      })
      .strict()
      .default({ level: 'medium', reasons: [] }),
    safety_confirmation: z.boolean().default(false),
    metrics: z.array(GoalPlanMetricSchema).max(12).default([]),
    milestones: z.array(GoalPlanMilestoneSchema).min(1).max(12),
    actions: z.array(GoalPlanActionSchema).min(1).max(40),
    dependencies: z.array(GoalPlanDependencySchema).max(40).default([]),
    policy: GoalPlanPolicySchema.default({}),
  })
  .strict()

export type ValidatedGoalActivationPlan = z.infer<typeof GoalActivationPlanSchema>
