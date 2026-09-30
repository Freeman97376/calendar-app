import type { GoalActivationPlan, GoalPlanAction, QuestionBatchItem } from '../types/goalControl'

const DAY_MS = 86_400_000
const DEFAULT_ROLLING_WEEKS = 4
const MAX_SEARCH_WEEKS = 56

export type ActionScheduleIssueCode =
  | 'capacity_conflict'
  | 'date_conflict'
  | 'dependency_conflict'
  | 'missing_horizon'

export type ActionScheduleIssue = {
  actionTitles: string[]
  code: ActionScheduleIssueCode
  message: string
}

export type ActionScheduleQuestionContext = {
  context: 'action_schedule'
  issueCodes: ActionScheduleIssueCode[]
  issueMessages: string[]
  optionalActionTitles: string[]
  planFingerprint: string
  suggestedTargetDate?: string
  suggestedWeeklyCapacity?: number
}

export type ActionScheduleResult = {
  changed: boolean
  fingerprint: string
  issues: ActionScheduleIssue[]
  plan: GoalActivationPlan
  question: QuestionBatchItem | null
  questionContext: ActionScheduleQuestionContext | null
  status: 'ready' | 'needs_clarification'
}

export type ActionScheduleAnswerResult = {
  manual: boolean
  plan: GoalActivationPlan
  rollingWithoutDeadline: boolean
  error?: string
}

type StructuredScheduleMessage = {
  structured: Record<string, unknown>
}

type ScheduleOptions = {
  rollingHorizonWeeks?: number
  rollingWithoutDeadline?: boolean
  today: string
}

type ScheduleAnswer = {
  custom?: string
  selected?: string[]
}

export function actionScheduleQuestionContext(
  message?: StructuredScheduleMessage,
): ActionScheduleQuestionContext | null {
  const structured = message?.structured
  if (
    structured?.context !== 'action_schedule' ||
    typeof structured.planFingerprint !== 'string' ||
    !Array.isArray(structured.issueCodes) ||
    !Array.isArray(structured.issueMessages) ||
    !Array.isArray(structured.optionalActionTitles)
  ) {
    return null
  }
  const validIssueCodes = new Set<ActionScheduleIssueCode>([
    'capacity_conflict',
    'date_conflict',
    'dependency_conflict',
    'missing_horizon',
  ])
  return {
    context: 'action_schedule',
    issueCodes: structured.issueCodes.filter(
      (value): value is ActionScheduleIssueCode =>
        typeof value === 'string' && validIssueCodes.has(value as ActionScheduleIssueCode),
    ),
    issueMessages: structured.issueMessages.filter(
      (value): value is string => typeof value === 'string',
    ),
    optionalActionTitles: structured.optionalActionTitles.filter(
      (value): value is string => typeof value === 'string',
    ),
    planFingerprint: structured.planFingerprint,
    ...(typeof structured.suggestedTargetDate === 'string'
      ? { suggestedTargetDate: structured.suggestedTargetDate }
      : {}),
    ...(typeof structured.suggestedWeeklyCapacity === 'number'
      ? { suggestedWeeklyCapacity: structured.suggestedWeeklyCapacity }
      : {}),
  }
}

export function actionScheduleQuestionWasAsked(
  messages: StructuredScheduleMessage[],
  fingerprint: string,
): boolean {
  return messages.some(
    (message) =>
      message.structured.context === 'action_schedule' &&
      message.structured.planFingerprint === fingerprint,
  )
}

function clonePlan(plan: GoalActivationPlan): GoalActivationPlan {
  return {
    ...plan,
    actions: plan.actions.map((action) => ({
      ...action,
      metadata: action.metadata ? { ...action.metadata } : undefined,
    })),
    dependencies: (plan.dependencies ?? []).map((dependency) => ({ ...dependency })),
    milestones: plan.milestones.map((milestone) => ({
      ...milestone,
      metadata: milestone.metadata ? { ...milestone.metadata } : undefined,
    })),
    policy: { ...plan.policy },
  }
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return formatDate(date) === value ? date : null
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * DAY_MS)
}

function laterDate(first: Date, second: Date): Date {
  return first.getTime() >= second.getTime() ? first : second
}

function earlierDate(first: Date, second: Date): Date {
  return first.getTime() <= second.getTime() ? first : second
}

function mondayOf(value: Date): Date {
  const offset = (value.getUTCDay() + 6) % 7
  return addDays(value, -offset)
}

const weekdayAliases: Record<string, number> = {
  monday: 0,
  mon: 0,
  周一: 0,
  星期一: 0,
  礼拜一: 0,
  tuesday: 1,
  tue: 1,
  tues: 1,
  周二: 1,
  星期二: 1,
  礼拜二: 1,
  wednesday: 2,
  wed: 2,
  周三: 2,
  星期三: 2,
  礼拜三: 2,
  thursday: 3,
  thu: 3,
  thur: 3,
  thurs: 3,
  周四: 3,
  星期四: 3,
  礼拜四: 3,
  friday: 4,
  fri: 4,
  周五: 4,
  星期五: 4,
  礼拜五: 4,
  saturday: 5,
  sat: 5,
  周六: 5,
  星期六: 5,
  礼拜六: 5,
  sunday: 6,
  sun: 6,
  周日: 6,
  周天: 6,
  星期日: 6,
  星期天: 6,
  礼拜日: 6,
  礼拜天: 6,
}

function availableDayOffsets(value: unknown): number[] {
  if (!Array.isArray(value)) return [6]
  const offsets = value.flatMap((item) => {
    if (typeof item !== 'string') return []
    const offset = weekdayAliases[item.trim().toLowerCase()]
    return offset === undefined ? [] : [offset]
  })
  const unique = [...new Set(offsets)].sort((first, second) => first - second)
  return unique.length ? unique : [6]
}

function dateForWeek(
  weekStart: Date,
  earliest: Date,
  latest: Date,
  availableOffsets: number[],
): Date | null {
  for (const offset of [...availableOffsets].sort((first, second) => second - first)) {
    const candidate = addDays(weekStart, offset)
    if (candidate.getTime() >= earliest.getTime() && candidate.getTime() <= latest.getTime()) {
      return candidate
    }
  }
  return null
}

export function actionNeedsPlanningDate(action: GoalPlanAction): boolean {
  return (
    (action.execution_tier === 'minimum' || action.execution_tier === 'standard') &&
    action.status !== 'done' &&
    action.status !== 'skipped'
  )
}

export function missingPlanningDateActions(plan: GoalActivationPlan): GoalPlanAction[] {
  return plan.actions.filter(
    (action) => actionNeedsPlanningDate(action) && !parseDate(action.due_date),
  )
}

function scheduleFingerprint(plan: GoalActivationPlan): string {
  const serialized = JSON.stringify({
    actions: plan.actions.map((action) => ({
      action_id: action.action_id ?? null,
      due_date: action.due_date ?? null,
      estimated_minutes: action.estimated_minutes,
      execution_tier: action.execution_tier,
      milestone_id: action.milestone_id ?? null,
      milestone_title: action.milestone_title ?? null,
      priority: action.priority,
      status: action.status ?? 'todo',
      title: action.title,
    })),
    dependencies: plan.dependencies ?? [],
    milestones: plan.milestones.map((milestone) => ({
      due_date: milestone.due_date ?? null,
      milestone_id: milestone.milestone_id ?? null,
      title: milestone.title,
    })),
    policy: {
      available_days: plan.policy.available_days ?? [],
      buffer_percent: plan.policy.buffer_percent ?? 20,
      weekly_capacity_minutes: plan.policy.weekly_capacity_minutes ?? 300,
    },
    target_date: plan.target_date ?? null,
  })
  let hash = 2_166_136_261
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return `schedule-${(hash >>> 0).toString(16)}`
}

function actionIndexes(plan: GoalActivationPlan) {
  const ids = new Map<string, number>()
  const titles = new Map<string, number | null>()
  plan.actions.forEach((action, index) => {
    if (action.action_id) ids.set(action.action_id, index)
    const title = action.title.trim().toLowerCase()
    if (!title) return
    titles.set(title, titles.has(title) ? null : index)
  })
  return { ids, titles }
}

function dependencyIndex(
  dependency: Record<string, unknown>,
  side: 'predecessor' | 'successor',
  indexes: ReturnType<typeof actionIndexes>,
): number | null {
  const id = dependency[`${side}_action_id`]
  if (typeof id === 'string' && indexes.ids.has(id)) return indexes.ids.get(id) ?? null
  const title = dependency[`${side}_title`]
  if (typeof title !== 'string') return null
  return indexes.titles.get(title.trim().toLowerCase()) ?? null
}

function dependencyOrder(plan: GoalActivationPlan): {
  order: number[]
  edges: Array<[number, number]>
  issue: ActionScheduleIssue | null
} {
  const indexes = actionIndexes(plan)
  const outgoing = new Map<number, number[]>()
  const incoming = Array.from({ length: plan.actions.length }, () => 0)
  const edges: Array<[number, number]> = []
  for (const dependency of plan.dependencies ?? []) {
    const predecessor = dependencyIndex(dependency, 'predecessor', indexes)
    const successor = dependencyIndex(dependency, 'successor', indexes)
    if (predecessor === null || successor === null || predecessor === successor) {
      return {
        edges,
        order: [],
        issue: {
          actionTitles: [],
          code: 'dependency_conflict',
          message: '计划包含无法识别或自我引用的行动依赖，请先修正依赖关系。',
        },
      }
    }
    edges.push([predecessor, successor])
    outgoing.set(predecessor, [...(outgoing.get(predecessor) ?? []), successor])
    incoming[successor] += 1
  }
  const queue = incoming.flatMap((count, index) => (count === 0 ? [index] : []))
  const order: number[] = []
  while (queue.length) {
    queue.sort((first, second) => first - second)
    const current = queue.shift()!
    order.push(current)
    for (const successor of outgoing.get(current) ?? []) {
      incoming[successor] -= 1
      if (incoming[successor] === 0) queue.push(successor)
    }
  }
  if (order.length !== plan.actions.length) {
    return {
      edges,
      order: [],
      issue: {
        actionTitles: [],
        code: 'dependency_conflict',
        message: '计划中的行动依赖形成循环，无法自动排程。',
      },
    }
  }
  return { edges, issue: null, order }
}

function milestoneBounds(plan: GoalActivationPlan) {
  const ids = new Map<string, Date>()
  const titles = new Map<string, Date | null>()
  for (const milestone of plan.milestones) {
    const due = parseDate(milestone.due_date)
    if (!due) continue
    if (milestone.milestone_id) ids.set(milestone.milestone_id, due)
    const title = milestone.title.trim().toLowerCase()
    if (title) titles.set(title, titles.has(title) ? null : due)
  }
  return { ids, titles }
}

function actionBound(
  action: GoalPlanAction,
  target: Date | null,
  bounds: ReturnType<typeof milestoneBounds>,
): Date | null {
  const milestone = action.milestone_id
    ? (bounds.ids.get(action.milestone_id) ?? null)
    : action.milestone_title
      ? (bounds.titles.get(action.milestone_title.trim().toLowerCase()) ?? null)
      : null
  if (milestone && target) return earlierDate(milestone, target)
  return milestone ?? target
}

function requiredSuccessorPredecessors(
  plan: GoalActivationPlan,
  edges: Array<[number, number]>,
): Set<number> {
  return new Set(
    edges.flatMap(([predecessor, successor]) =>
      actionNeedsPlanningDate(plan.actions[successor]) ? [predecessor] : [],
    ),
  )
}

function plannedMetadata(action: GoalPlanAction, rolling: boolean): Record<string, unknown> {
  return {
    ...(action.metadata ?? {}),
    due_date_flexibility: 'flexible',
    due_date_source: 'system_planned',
    ...(rolling ? { planning_horizon_weeks: DEFAULT_ROLLING_WEEKS } : {}),
  }
}

function questionFor(
  issues: ActionScheduleIssue[],
  context: Omit<
    ActionScheduleQuestionContext,
    'context' | 'issueCodes' | 'issueMessages' | 'planFingerprint'
  >,
): QuestionBatchItem {
  const missingHorizon = issues.some((issue) => issue.code === 'missing_horizon')
  if (missingHorizon) {
    return {
      allowCustom: true,
      choices: [
        { id: 'horizon_4w', label: '4 weeks / 4 周' },
        { id: 'horizon_8w', label: '8 weeks / 8 周' },
        { id: 'horizon_12w', label: '12 weeks / 12 周' },
        {
          id: 'rolling_4w',
          label: 'No hard deadline; use a rolling 4-week plan / 无硬期限，使用滚动4周计划',
        },
        { id: 'manual_dates', label: 'I will edit dates manually / 我手动填写日期' },
      ],
      id: 'action_schedule',
      prompt: '必要行动缺少可推导的日期。请选择计划周期；也可以输入 YYYY-MM-DD 或“6周”。',
      required: true,
      selectionMode: 'single',
    }
  }
  const choices: QuestionBatchItem['choices'] = []
  if (context.suggestedTargetDate) {
    choices.push({
      id: 'extend_deadline',
      label: `Extend to ${context.suggestedTargetDate} / 延长至 ${context.suggestedTargetDate}`,
    })
  }
  if (context.suggestedWeeklyCapacity) {
    choices.push({
      id: 'increase_capacity',
      label: `Use ${context.suggestedWeeklyCapacity} minutes/week / 每周提高到 ${context.suggestedWeeklyCapacity} 分钟`,
    })
  }
  if (context.optionalActionTitles.length) {
    choices.push({
      id: 'move_optional_to_stretch',
      label: 'Move listed low-priority work to Stretch / 将列出的低优先级行动转为 Stretch',
      description: context.optionalActionTitles.join('、'),
    })
  }
  choices.push({ id: 'manual_dates', label: 'I will edit dates manually / 我手动填写日期' })
  return {
    allowCustom: false,
    choices,
    id: 'action_schedule',
    prompt: `当前计划无法在容量和日期约束内完成：${issues.map((issue) => issue.message).join(' ')}`,
    required: true,
    selectionMode: 'single',
  }
}

function parseCustomHorizon(value: string, today: Date): { rolling: boolean; target: Date | null } {
  const trimmed = value.trim()
  const explicit = parseDate(trimmed)
  if (explicit) return { rolling: false, target: explicit }
  if (/^(?:open|rolling|no fixed date|暂无期限|无期限|没有具体日期)$/i.test(trimmed)) {
    return { rolling: true, target: null }
  }
  const match = /^(\d+)\s*(天|日|周|个月|days?|weeks?|months?)$/i.exec(trimmed)
  if (!match) return { rolling: false, target: null }
  const amount = Number(match[1])
  const unit = match[2].toLowerCase()
  const days = /月|month/.test(unit) ? amount * 30 : /周|week/.test(unit) ? amount * 7 : amount
  return { rolling: false, target: addDays(today, days) }
}

export function applyActionScheduleAnswer(
  plan: GoalActivationPlan,
  answer: ScheduleAnswer,
  context: ActionScheduleQuestionContext,
  todayValue: string,
): ActionScheduleAnswerResult {
  const today = parseDate(todayValue)
  if (!today) {
    return { manual: false, plan, rollingWithoutDeadline: false, error: '当前日期无效，无法排程。' }
  }
  const selected = answer.selected?.[0] ?? ''
  const next = clonePlan(plan)
  if (selected === 'manual_dates') {
    return { manual: true, plan: next, rollingWithoutDeadline: false }
  }
  if (selected === 'rolling_4w') {
    next.target_date = null
    return { manual: false, plan: next, rollingWithoutDeadline: true }
  }
  const horizonWeeks = /^horizon_(4|8|12)w$/.exec(selected)?.[1]
  if (horizonWeeks) {
    next.target_date = formatDate(addDays(today, Number(horizonWeeks) * 7))
    return { manual: false, plan: next, rollingWithoutDeadline: false }
  }
  if (selected === 'extend_deadline' && context.suggestedTargetDate) {
    next.target_date = context.suggestedTargetDate
    return { manual: false, plan: next, rollingWithoutDeadline: false }
  }
  if (selected === 'increase_capacity' && context.suggestedWeeklyCapacity) {
    next.policy.weekly_capacity_minutes = context.suggestedWeeklyCapacity
    return { manual: false, plan: next, rollingWithoutDeadline: false }
  }
  if (selected === 'move_optional_to_stretch' && context.optionalActionTitles.length) {
    const optional = new Set(context.optionalActionTitles)
    next.actions = next.actions.map((action) =>
      optional.has(action.title)
        ? {
            ...action,
            due_date: null,
            execution_tier: 'stretch',
            metadata: { ...(action.metadata ?? {}), rolling_backlog: true },
          }
        : action,
    )
    return { manual: false, plan: next, rollingWithoutDeadline: !next.target_date }
  }
  if (answer.custom) {
    const custom = parseCustomHorizon(answer.custom, today)
    if (custom.rolling) {
      next.target_date = null
      return { manual: false, plan: next, rollingWithoutDeadline: true }
    }
    if (custom.target) {
      next.target_date = formatDate(custom.target)
      return { manual: false, plan: next, rollingWithoutDeadline: false }
    }
  }
  return {
    error: '无法识别排程选择，请手动填写行动日期。',
    manual: true,
    plan: next,
    rollingWithoutDeadline: false,
  }
}

export function userConfirmedNoFixedDeadline(
  messages: Array<{ role?: string; structured: Record<string, unknown> }>,
  originalRequest = '',
): boolean {
  if (
    /暂无期限|无固定期限|没有具体日期|没有明确日期|no fixed date|open[- ]ended/i.test(
      originalRequest,
    )
  ) {
    return true
  }
  return messages.some((message) => {
    if (message.role && message.role !== 'user') return false
    if (message.structured.kind !== 'question_answers') return false
    const answers = message.structured.answers
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return false
    const deadline = (answers as Record<string, unknown>).deadline
    if (!deadline || typeof deadline !== 'object' || Array.isArray(deadline)) return false
    const selected = (deadline as Record<string, unknown>).selected
    return Array.isArray(selected) && selected.includes('open')
  })
}

export function scheduleGoalPlan(
  inputPlan: GoalActivationPlan,
  options: ScheduleOptions,
): ActionScheduleResult {
  const plan = clonePlan(inputPlan)
  const today = parseDate(options.today)
  if (!today) throw new Error('Schedule today must use YYYY-MM-DD.')
  const rollingWeeks = options.rollingHorizonWeeks ?? DEFAULT_ROLLING_WEEKS
  const rolling = Boolean(options.rollingWithoutDeadline && !plan.target_date)
  const target = parseDate(plan.target_date) ?? (rolling ? addDays(today, rollingWeeks * 7) : null)
  const capacity = Number(plan.policy.weekly_capacity_minutes ?? 300)
  const buffer = Number(plan.policy.buffer_percent ?? 20)
  const usableCapacity = Math.floor(capacity * (1 - buffer / 100))
  const offsets = availableDayOffsets(plan.policy.available_days)
  const issues: ActionScheduleIssue[] = []
  let changed = false
  const fallbackMilestoneDate = target ?? addDays(today, rollingWeeks * 7)
  plan.milestones = plan.milestones.map((milestone) => {
    const due = parseDate(milestone.due_date)
    if (!due || due.getTime() >= today.getTime()) return milestone
    if (milestone.metadata?.due_date_source === 'user_fixed') {
      issues.push({
        actionTitles: [milestone.title],
        code: 'date_conflict',
        message: `${milestone.title} 使用了已过去的固定里程碑日期 ${formatDate(due)}。`,
      })
      return milestone
    }
    changed = true
    return {
      ...milestone,
      due_date: formatDate(fallbackMilestoneDate),
      metadata: {
        ...(milestone.metadata ?? {}),
        due_date_flexibility: 'flexible',
        due_date_source: 'system_planned',
      },
    }
  })
  const bounds = milestoneBounds(plan)
  const dependency = dependencyOrder(plan)
  let suggestedTarget: Date | null = null
  let suggestedWeeklyCapacity = 0

  if (dependency.issue) issues.push(dependency.issue)
  const missing = missingPlanningDateActions(plan)
  if (!target && missing.some((action) => !actionBound(action, null, bounds))) {
    issues.push({
      actionTitles: missing.map((action) => action.title),
      code: 'missing_horizon',
      message: `以下必要行动没有目标或里程碑日期：${missing.map((action) => action.title).join('、')}`,
    })
  }
  if (usableCapacity <= 0 && plan.actions.some(actionNeedsPlanningDate)) {
    issues.push({
      actionTitles: plan.actions.filter(actionNeedsPlanningDate).map((action) => action.title),
      code: 'capacity_conflict',
      message: '每周可用容量扣除缓冲后为0，无法安排必要行动。',
    })
    suggestedWeeklyCapacity = Math.max(60, capacity || 60)
  }

  const dueDates = new Map<number, Date>()
  const weeklyUsage = new Map<string, number>()
  if (usableCapacity > 0) {
    plan.actions
      .map((action, index) => ({ action, index, due: parseDate(action.due_date) }))
      .filter((item) => actionNeedsPlanningDate(item.action) && item.due)
      .sort((first, second) => first.due!.getTime() - second.due!.getTime())
      .forEach(({ action, index, due }) => {
        if (!actionNeedsPlanningDate(action)) return
        if (!due) return
        const isUserFixed = action.metadata?.due_date_source === 'user_fixed'
        if (due.getTime() < today.getTime()) {
          if (isUserFixed) {
            issues.push({
              actionTitles: [action.title],
              code: 'date_conflict',
              message: `${action.title} 使用了已过去的固定日期 ${formatDate(due)}。`,
            })
            return
          }
          plan.actions[index] = {
            ...action,
            due_date: null,
            metadata: {
              ...(action.metadata ?? {}),
              due_date_flexibility: 'flexible',
              due_date_source: 'system_planned',
            },
          }
          changed = true
          return
        }
        dueDates.set(index, due)
        let remaining = Math.max(0, Number(action.estimated_minutes))
        let cursor = mondayOf(today)
        const lastWeek = mondayOf(due)
        while (remaining > 0 && cursor.getTime() <= lastWeek.getTime()) {
          const key = formatDate(cursor)
          const available = Math.max(0, usableCapacity - (weeklyUsage.get(key) ?? 0))
          const reserved = Math.min(available, remaining)
          if (reserved > 0) weeklyUsage.set(key, (weeklyUsage.get(key) ?? 0) + reserved)
          remaining -= reserved
          cursor = addDays(cursor, 7)
        }
        if (remaining > 0) {
          const availableWeeks = Math.max(
            1,
            Math.floor((lastWeek.getTime() - mondayOf(today).getTime()) / (7 * 86400000)) + 1,
          )
          const cumulativeMinutes =
            Array.from(weeklyUsage.values()).reduce((sum, value) => sum + value, 0) + remaining
          issues.push({
            actionTitles: [action.title],
            code: 'capacity_conflict',
            message: `${action.title} 无法在 ${formatDate(due)} 前分散到已有周容量中。`,
          })
          suggestedWeeklyCapacity = Math.max(
            suggestedWeeklyCapacity,
            Math.ceil(cumulativeMinutes / availableWeeks / Math.max(0.01, 1 - buffer / 100)),
          )
        }
        const bound = actionBound(action, target, bounds)
        if (bound && due.getTime() > bound.getTime()) {
          issues.push({
            actionTitles: [action.title],
            code: 'date_conflict',
            message: `${action.title} 的已有日期晚于里程碑或目标日期。`,
          })
        }
      })
  }

  const predecessorIndexes = new Map<number, number[]>()
  for (const [predecessor, successor] of dependency.edges) {
    predecessorIndexes.set(successor, [...(predecessorIndexes.get(successor) ?? []), predecessor])
  }
  const requiredPredecessors = requiredSuccessorPredecessors(plan, dependency.edges)

  if (
    !dependency.issue &&
    usableCapacity > 0 &&
    !issues.some((issue) => issue.code === 'missing_horizon')
  ) {
    for (const index of dependency.order) {
      const action = plan.actions[index]
      if (!actionNeedsPlanningDate(action) || parseDate(action.due_date)) continue
      const bound = actionBound(action, target, bounds)
      if (!bound) continue
      const predecessors = predecessorIndexes.get(index) ?? []
      const unresolvedPredecessor = predecessors.find(
        (predecessor) =>
          actionNeedsPlanningDate(plan.actions[predecessor]) && !dueDates.get(predecessor),
      )
      if (unresolvedPredecessor !== undefined) {
        issues.push({
          actionTitles: [action.title],
          code: 'dependency_conflict',
          message: `${action.title} 的前置行动没有可用日期，无法继续排程。`,
        })
        continue
      }
      let earliest = today
      for (const predecessor of predecessors) {
        const predecessorDue = dueDates.get(predecessor)
        if (predecessorDue) earliest = laterDate(earliest, predecessorDue)
      }
      const minutes = Math.max(0, Number(action.estimated_minutes))
      let candidate: Date | null = null
      let week = mondayOf(earliest)
      for (let attempt = 0; attempt < MAX_SEARCH_WEEKS; attempt += 1) {
        const weekEnd = addDays(week, 6)
        const latest = earlierDate(weekEnd, bound)
        const due = dateForWeek(week, earliest, latest, offsets)
        const key = formatDate(week)
        if (due && (weeklyUsage.get(key) ?? 0) + minutes <= usableCapacity) {
          candidate = due
          break
        }
        if (week.getTime() > bound.getTime()) break
        week = addDays(week, 7)
      }
      if (!candidate) {
        const mayBecomeBacklog =
          rolling &&
          action.execution_tier === 'standard' &&
          action.priority === 'low' &&
          !requiredPredecessors.has(index)
        if (mayBecomeBacklog) {
          plan.actions[index] = {
            ...action,
            due_date: null,
            execution_tier: 'stretch',
            metadata: { ...(action.metadata ?? {}), rolling_backlog: true },
          }
          changed = true
          continue
        }
        let extendedWeek = addDays(mondayOf(bound), 7)
        for (let attempt = 0; attempt < MAX_SEARCH_WEEKS; attempt += 1) {
          const extendedDue = dateForWeek(extendedWeek, earliest, addDays(extendedWeek, 6), offsets)
          const key = formatDate(extendedWeek)
          if (extendedDue && (weeklyUsage.get(key) ?? 0) + minutes <= usableCapacity) {
            suggestedTarget = suggestedTarget
              ? laterDate(suggestedTarget, extendedDue)
              : extendedDue
            break
          }
          extendedWeek = addDays(extendedWeek, 7)
        }
        suggestedWeeklyCapacity = Math.max(
          suggestedWeeklyCapacity,
          Math.ceil(minutes / Math.max(0.01, 1 - buffer / 100)),
        )
        issues.push({
          actionTitles: [action.title],
          code: 'capacity_conflict',
          message: `${action.title} 无法在当前容量和日期上限内安排。`,
        })
        continue
      }
      const key = formatDate(mondayOf(candidate))
      weeklyUsage.set(key, (weeklyUsage.get(key) ?? 0) + minutes)
      dueDates.set(index, candidate)
      plan.actions[index] = {
        ...action,
        due_date: formatDate(candidate),
        metadata: plannedMetadata(action, rolling),
      }
      changed = true
    }
  }

  for (const [predecessor, successor] of dependency.edges) {
    const predecessorDue =
      dueDates.get(predecessor) ?? parseDate(plan.actions[predecessor].due_date)
    const successorDue = dueDates.get(successor) ?? parseDate(plan.actions[successor].due_date)
    if (predecessorDue && successorDue && predecessorDue.getTime() > successorDue.getTime()) {
      issues.push({
        actionTitles: [plan.actions[predecessor].title, plan.actions[successor].title],
        code: 'dependency_conflict',
        message: `${plan.actions[predecessor].title} 的日期晚于后续行动 ${plan.actions[successor].title}。`,
      })
    }
  }

  const uniqueIssues = issues.filter(
    (issue, index) =>
      issues.findIndex((candidate) => candidate.message === issue.message) === index,
  )
  const optionalActionTitles = plan.actions
    .filter(
      (action, index) =>
        action.execution_tier === 'standard' &&
        action.priority === 'low' &&
        action.status !== 'done' &&
        action.status !== 'skipped' &&
        !requiredPredecessors.has(index),
    )
    .map((action) => action.title)
  const fingerprint = scheduleFingerprint(plan)
  if (!uniqueIssues.length) {
    return {
      changed,
      fingerprint,
      issues: [],
      plan,
      question: null,
      questionContext: null,
      status: 'ready',
    }
  }
  const questionValues = {
    optionalActionTitles,
    ...(suggestedTarget ? { suggestedTargetDate: formatDate(suggestedTarget) } : {}),
    ...(suggestedWeeklyCapacity
      ? { suggestedWeeklyCapacity: Math.min(10_080, suggestedWeeklyCapacity) }
      : {}),
  }
  const questionContext: ActionScheduleQuestionContext = {
    context: 'action_schedule',
    issueCodes: [...new Set(uniqueIssues.map((issue) => issue.code))],
    issueMessages: uniqueIssues.map((issue) => issue.message),
    planFingerprint: fingerprint,
    ...questionValues,
  }
  return {
    changed,
    fingerprint,
    issues: uniqueIssues,
    plan,
    question: questionFor(uniqueIssues, questionValues),
    questionContext,
    status: 'needs_clarification',
  }
}
