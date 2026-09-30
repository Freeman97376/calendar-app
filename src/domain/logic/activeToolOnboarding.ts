import { GoalActivationPlanSchema } from '../schemas/goalActivationPlan.schema'
import { missingPlanningDateActions } from './goalActionScheduling'
import type {
  ActiveToolOnboardingSeed,
  GoalActivationPlan,
  QuestionBatchItem,
} from '../types/goalControl'

export const REVIEW_FIRST_TEMPLATE_IDS = ['goal-planner', 'fitness-ai'] as const

export function isReviewFirstTemplate(templateId: string): boolean {
  return REVIEW_FIRST_TEMPLATE_IDS.includes(
    templateId as (typeof REVIEW_FIRST_TEMPLATE_IDS)[number],
  )
}

function hasPattern(value: string, pattern: RegExp): boolean {
  return pattern.test(value)
}

const capacityQuestion: QuestionBatchItem = {
  id: 'capacity',
  prompt: 'How much time is realistically available each week? / 每周现实可用时间？',
  selectionMode: 'single',
  allowCustom: true,
  required: false,
  accuracyImpact:
    'Without weekly capacity, workload estimates may be less realistic. / 缺少每周容量会降低工作量估算准确度。',
  choices: [
    { id: '120', label: '2 hours / 2 小时' },
    { id: '180', label: '3 hours / 3 小时' },
    { id: '240', label: '4 hours / 4 小时' },
    { id: '360', label: '6 hours / 6 小时' },
  ],
}

const horizonQuestion: QuestionBatchItem = {
  id: 'deadline',
  prompt: 'What planning horizon should this plan use? / 计划周期是多久？',
  selectionMode: 'single',
  allowCustom: true,
  required: false,
  accuracyImpact:
    'Without a horizon, milestone dates remain provisional. / 缺少周期时，里程碑日期只能作为暂定值。',
  choices: [
    { id: '4w', label: '4 weeks / 4 周' },
    { id: '6w', label: '6 weeks / 6 周' },
    { id: '8w', label: '8 weeks / 8 周' },
    { id: 'open', label: 'No fixed date / 暂无期限' },
  ],
}

const goalConstraintsQuestion: QuestionBatchItem = {
  id: 'current_constraints',
  prompt: 'Which constraints must the plan respect? / 计划必须尊重哪些限制？',
  selectionMode: 'multiple',
  allowCustom: true,
  required: false,
  accuracyImpact:
    'Unstated constraints may make the first plan less practical. / 未说明限制可能降低初始计划的可执行性。',
  choices: [
    { id: 'schedule', label: 'Schedule or energy / 时间或精力' },
    { id: 'resources', label: 'Equipment or resources / 设备或资源' },
    { id: 'responsibilities', label: 'Work or family duties / 工作或家庭责任' },
    { id: 'none', label: 'No major constraint / 暂无重大限制' },
  ],
}

const fitnessSafetyQuestion: QuestionBatchItem = {
  id: 'fitness_safety_constraints',
  prompt:
    'Confirm any injury, pain, medical concern, or movement restriction. / 请明确确认受伤、疼痛、医疗顾虑或动作限制。',
  selectionMode: 'single',
  allowCustom: true,
  required: true,
  choices: [
    { id: 'none_known', label: 'No known safety constraint / 暂无已知安全限制' },
    { id: 'has_constraint', label: 'I have a constraint to describe / 我有需要说明的限制' },
  ],
}

const fitnessFrequencyQuestion: QuestionBatchItem = {
  id: 'frequency',
  prompt: 'How many sessions per week are realistic? / 每周现实可完成几次？',
  selectionMode: 'single',
  allowCustom: true,
  required: false,
  accuracyImpact:
    'Frequency affects progression and recovery estimates. / 训练频率会影响进度与恢复估算。',
  choices: [
    { id: '2', label: '2 sessions / 2 次' },
    { id: '3', label: '3 sessions / 3 次' },
    { id: '4', label: '4 sessions / 4 次' },
  ],
}

const fitnessSessionLengthQuestion: QuestionBatchItem = {
  id: 'sessionLength',
  prompt: 'How long should each session be? / 每次训练多长时间？',
  selectionMode: 'single',
  required: false,
  accuracyImpact:
    'Session length affects exercise selection and workload. / 单次时长会影响动作选择和训练量。',
  allowCustom: true,
  choices: [
    { id: '20', label: '20 minutes / 20 分钟' },
    { id: '30', label: '30 minutes / 30 分钟' },
    { id: '45', label: '45 minutes / 45 分钟' },
  ],
}

export function activeToolClarificationQuestions(
  seed: ActiveToolOnboardingSeed,
): QuestionBatchItem[] {
  const request = seed.originalRequest
  const questions: QuestionBatchItem[] = []

  if (seed.template.id === 'fitness-ai') {
    const safetyWasExplicit =
      hasExplicitFitnessSafetyText(seed.activationForm.constraints ?? '') ||
      hasExplicitFitnessSafetyText(request)
    const frequencyWasExplicit = hasPattern(
      request,
      /每周\s*\d+\s*次|\d+\s*(?:times|sessions)\s*(?:per|a)\s*week/i,
    )
    const sessionLengthWasExplicit = hasPattern(request, /\d{1,3}\s*(?:分钟|minutes|min)\b/i)

    if (!safetyWasExplicit) questions.push(fitnessSafetyQuestion)
    if (!frequencyWasExplicit) questions.push(fitnessFrequencyQuestion)
    if (!sessionLengthWasExplicit) questions.push(fitnessSessionLengthQuestion)
    return questions.slice(0, 3)
  }

  const capacityWasExplicit = hasPattern(
    request,
    /每周.{0,8}\d+\s*(?:小时|分钟)|\d+\s*(?:hours?|minutes?)\s*(?:per|a)\s*week/i,
  )
  const horizonWasExplicit = hasPattern(
    request,
    /\d+\s*(?:天|周|个月|days?|weeks?|months?)|截止|deadline|by\s+\d{4}-\d{2}-\d{2}|暂无期限|无固定期限|没有具体日期|没有明确日期|no fixed date|open[- ]ended/i,
  )
  const constraintsWereExplicit = hasPattern(
    request,
    /限制|约束|只能|不能|预算|时间|资源|constraint|only|cannot|budget|resource/i,
  )

  if (!capacityWasExplicit) questions.push(capacityQuestion)
  if (!horizonWasExplicit) questions.push(horizonQuestion)
  if (!constraintsWereExplicit) questions.push(goalConstraintsQuestion)
  return questions.slice(0, 3)
}

function answerHasValue(answer: unknown): boolean {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return false
  const value = answer as { selected?: unknown; custom?: unknown }
  return (
    (Array.isArray(value.selected) && value.selected.some((item) => typeof item === 'string')) ||
    (typeof value.custom === 'string' && Boolean(value.custom.trim()))
  )
}

function hasExplicitFitnessSafetyText(value: string): boolean {
  return hasPattern(
    value,
    /(?:no|without|没有|无).{0,10}(?:injur|pain|medical|physical limitation|伤病|受伤|疼痛|医疗|身体限制)|injur|pain|knee|medical|surgery|pregnan|伤病|受伤|疼痛|膝|腰伤|医疗|手术|怀孕/i,
  )
}

export function fitnessSafetyWasConfirmed(
  messages: Array<{ structured: Record<string, unknown> }>,
  seed?: ActiveToolOnboardingSeed | null,
): boolean {
  if (seed?.template.id !== 'fitness-ai') return true
  if (hasExplicitFitnessSafetyText(seed.activationForm.constraints ?? '')) return true
  if (hasExplicitFitnessSafetyText(seed.originalRequest)) return true

  return messages.some((message) => {
    if (message.structured.kind !== 'question_answers') return false
    const answers = message.structured.answers
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return false
    return answerHasValue((answers as Record<string, unknown>).fitness_safety_constraints)
  })
}

export function skippedClarificationInformation(
  messages: Array<{ structured: Record<string, unknown> }>,
): GoalActivationPlan['missing_information'] {
  const skipped = new Map<string, GoalActivationPlan['missing_information'][number]>()
  for (const message of messages) {
    if (message.structured.kind !== 'question_answers') continue
    const answers = message.structured.answers
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) continue
    for (const [id, raw] of Object.entries(answers as Record<string, unknown>)) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
      const answer = raw as Record<string, unknown>
      if (answer.skipped !== true) continue
      const impact =
        typeof answer.accuracyImpact === 'string' && answer.accuracyImpact.trim()
          ? answer.accuracyImpact.trim()
          : 'Skipping this optional detail may reduce first-plan accuracy.'
      const label =
        typeof answer.label === 'string' && answer.label.trim()
          ? answer.label.trim()
          : `Optional detail: ${id}`
      skipped.set(id, { id: `skipped-${id}`, label, impact, blocking: false })
    }
  }
  return [...skipped.values()]
}

export function applySkippedClarificationImpact(
  plan: GoalActivationPlan,
  messages: Array<{ structured: Record<string, unknown> }>,
): GoalActivationPlan {
  const skipped = skippedClarificationInformation(messages)
  if (!skipped.length) return plan
  const skippedIds = new Set(skipped.map((item) => item.id))
  const missingInformation = [
    ...plan.missing_information.filter((item) => !skippedIds.has(item.id)),
    ...skipped,
  ]
  const reason = `${skipped.length} optional clarification${skipped.length === 1 ? ' was' : 's were'} skipped.`
  const reasons = [...new Set([...plan.confidence.reasons, reason])]
  const level =
    plan.confidence.level === 'low'
      ? 'low'
      : skipped.length > 1 || plan.confidence.level === 'medium'
        ? 'low'
        : 'medium'
  return {
    ...plan,
    missing_information: missingInformation,
    confidence: { level, reasons },
  }
}
export function planBlockingIssues(plan: GoalActivationPlan): string[] {
  const issues: string[] = []
  const validation = GoalActivationPlanSchema.safeParse(plan)
  if (!validation.success) {
    const firstIssue = validation.error.issues.find(
      (issue) =>
        !(
          issue.code === 'too_small' &&
          ['title', 'summary', 'milestones', 'actions'].includes(String(issue.path[0] ?? ''))
        ),
    )
    if (firstIssue) issues.push(`Plan structure is invalid: ${firstIssue.message}`)
  }
  if (!plan.title.trim()) issues.push('Plan title is required.')
  if (!plan.summary.trim()) issues.push('Plan summary is required.')
  if (!plan.milestones.length) issues.push('At least one Milestone is required.')
  if (!plan.actions.length) issues.push('At least one Action is required.')
  const unscheduled = missingPlanningDateActions(plan)
  if (unscheduled.length) {
    issues.push(
      `必要行动缺少计划完成日：${unscheduled
        .slice(0, 5)
        .map((action) => action.title)
        .join('、')}`,
    )
  }
  if (plan.missing_information.some((item) => item.blocking)) {
    issues.push('Resolve blocking missing information before activation.')
  }
  if (plan.template_id === 'fitness-ai' && !plan.safety_confirmation) {
    issues.push('Fitness safety constraints require explicit confirmation.')
  }
  return issues
}
