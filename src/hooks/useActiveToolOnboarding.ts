import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  activeToolClarificationQuestions,
  applySkippedClarificationImpact,
  fitnessSafetyWasConfirmed,
  planBlockingIssues,
} from '../domain/logic/activeToolOnboarding'
import {
  actionNeedsPlanningDate,
  actionScheduleQuestionContext,
  actionScheduleQuestionWasAsked,
  applyActionScheduleAnswer,
  scheduleGoalPlan,
  userConfirmedNoFixedDeadline,
} from '../domain/logic/goalActionScheduling'
import { getLocalTimeContext } from '../domain/logic/timeContext'
import { GoalActivationPlanSchema } from '../domain/schemas/goalActivationPlan.schema'
import type {
  ActivationFunnelEventInput,
  ActivationFunnelEventName,
  ActiveToolOnboardingSeed,
  AIUsageMode,
  GoalActivationPlan,
  GoalConversationMessage,
  GoalConversationThread,
} from '../domain/types/goalControl'
import { goalControlGateway } from '../store/goalControlStore'
import { useConfigStore } from '../store/configStore'
import { useLongTermMemoryStore } from '../store/longTermMemoryStore'
import { requestScheduleRecompute } from '../store/schedulingStore'
import { useAuth } from './useAuth'

function restoredPlan(messages: GoalConversationMessage[]): GoalActivationPlan | null {
  const message = [...messages].reverse().find((item) => item.structured.kind === 'plan_preview')
  const parsed = GoalActivationPlanSchema.safeParse(message?.structured.plan)
  return parsed.success ? (parsed.data as GoalActivationPlan) : null
}

function restoredScheduleIssues(messages: GoalConversationMessage[]): string[] {
  const structured = messages.at(-1)?.structured
  if (structured?.context !== 'action_schedule' || !Array.isArray(structured.issueMessages)) {
    return []
  }
  return structured.issueMessages.filter((value): value is string => typeof value === 'string')
}

function seedMatchesThread(thread: GoalConversationThread, seed: ActiveToolOnboardingSeed) {
  return (
    thread.template_id === seed.template.id &&
    thread.metadata.journeyId === seed.journeyId &&
    thread.status === 'draft'
  )
}

function normalizePlan(
  plan: GoalActivationPlan,
  seed: ActiveToolOnboardingSeed,
  messages: GoalConversationMessage[],
): GoalActivationPlan {
  const normalized: GoalActivationPlan = {
    ...plan,
    activation_form: { ...seed.activationForm, ...(plan.activation_form ?? {}) },
    activation_journey_id: seed.journeyId,
    adapter_id:
      seed.template.adapterId ?? (seed.template.id === 'fitness-ai' ? 'ai-progress' : 'generic'),
    route_tags: seed.routeTags ?? seed.template.routeTags ?? [],
    safety_confirmation: fitnessSafetyWasConfirmed(messages, seed),
    source: seed.source,
    template_id: seed.template.id,
    template_label: seed.template.label,
    tool_kind: seed.template.toolKind ?? null,
    tool_name: seed.template.toolName ?? seed.template.label,
  }
  return GoalActivationPlanSchema.parse(
    applySkippedClarificationImpact(normalized, messages),
  ) as GoalActivationPlan
}

function failureCategory(error: unknown): ActivationFunnelEventInput['errorCategory'] {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
  if (message.includes('conflict') || message.includes('already')) return 'conflict'
  if (message.includes('valid') || message.includes('schema') || message.includes('required')) {
    return 'validation'
  }
  if (message.includes('network') || message.includes('fetch')) return 'network'
  if (message.includes('provider') || message.includes('model') || message.includes('planning')) {
    return 'provider'
  }
  return 'unknown'
}

function skippedAnswerCount(answers: Record<string, unknown>): number {
  return Object.values(answers).filter(
    (value) =>
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      (value as Record<string, unknown>).skipped === true,
  ).length
}

export function useActiveToolOnboarding(seed: ActiveToolOnboardingSeed) {
  const auth = useAuth()
  const [thread, setThread] = useState<GoalConversationThread | null>(null)
  const [messages, setMessages] = useState<GoalConversationMessage[]>([])
  const [plan, setPlan] = useState<GoalActivationPlan | null>(null)
  const [scheduleIssues, setScheduleIssues] = useState<string[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [activationMessage, setActivationMessage] = useState('')
  const editEventTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadOverview = useLongTermMemoryStore((state) => state.loadOverview)
  const timezoneOverride = useConfigStore((state) => state.config.timezoneOverride)
  const selectedMode =
    (auth.preferences.aiUsageMode as AIUsageMode) ||
    auth.capabilities?.aiDefaultUsageMode ||
    'balanced'

  const recordEvent = useCallback(
    async (
      eventName: ActivationFunnelEventName,
      extra: Partial<
        Omit<ActivationFunnelEventInput, 'eventName' | 'journeyId' | 'source' | 'templateId'>
      > = {},
    ) => {
      await goalControlGateway
        .recordFunnelEvent({
          eventName,
          journeyId: seed.journeyId,
          source: seed.source,
          templateId: seed.template.id,
          ...extra,
        })
        .catch(() => undefined)
    },
    [seed.journeyId, seed.source, seed.template.id],
  )

  const recordFailure = useCallback(
    async (
      stage: NonNullable<ActivationFunnelEventInput['stage']>,
      failure: unknown,
      threadId?: string,
    ) => {
      await recordEvent('journey_failed', {
        errorCategory: failureCategory(failure),
        stage,
        threadId,
      })
    },
    [recordEvent],
  )

  useEffect(
    () => () => {
      if (editEventTimer.current) clearTimeout(editEventTimer.current)
    },
    [],
  )

  useEffect(() => {
    let cancelled = false

    async function initialize() {
      setBusy(true)
      setError('')
      try {
        const threads = await goalControlGateway.listThreads()
        const existing = threads.find((item) => seedMatchesThread(item, seed))
        if (existing) {
          const loaded = await goalControlGateway.getThread(existing.thread_id)
          if (cancelled) return
          setThread(loaded.thread)
          setMessages(loaded.messages)
          setPlan(restoredPlan(loaded.messages))
          setScheduleIssues(restoredScheduleIssues(loaded.messages))
          await recordEvent('template_recommendation_accepted', {
            threadId: existing.thread_id,
          })
          return
        }

        const created = await goalControlGateway.createThread({
          metadata: {
            activationForm: seed.activationForm,
            journeyId: seed.journeyId,
            originalRequest: seed.originalRequest,
            routeTags: seed.routeTags ?? seed.template.routeTags ?? [],
            source: seed.source,
          },
          template_id: seed.template.id,
          title: seed.suggestedInstanceAlias?.trim() || seed.template.label,
        })
        const seedMessage = await goalControlGateway.addMessage(created.thread_id, {
          role: 'user',
          content: seed.originalRequest,
          structured: {
            activationForm: seed.activationForm,
            activationSummary: seed.activationSummary ?? '',
            journeyId: seed.journeyId,
            kind: 'active_tool_onboarding_seed',
            originalRequest: seed.originalRequest,
            routeTags: seed.routeTags ?? seed.template.routeTags ?? [],
            source: seed.source,
            templateId: seed.template.id,
            templateLabel: seed.template.label,
          },
        })
        const questions = activeToolClarificationQuestions(seed)
        const assistantMessage = await goalControlGateway.addMessage(created.thread_id, {
          role: 'assistant',
          content: questions.length
            ? 'A few details will make the first plan executable. / 补充少量信息后即可生成可执行初稿。'
            : 'The planning brief is ready for an editable first plan. / 信息已足够，可以生成可编辑的初始计划。',
          structured: questions.length
            ? { kind: 'question_batch', questions }
            : { kind: 'planning_ready' },
        })
        if (cancelled) return
        setThread(created)
        setMessages([seedMessage, assistantMessage])
        setPlan(null)
        setScheduleIssues([])
        await recordEvent('template_recommendation_accepted', { threadId: created.thread_id })
        if (questions.length) {
          await recordEvent('clarification_shown', {
            metadata: { questionCount: questions.length },
            threadId: created.thread_id,
          })
        }
      } catch (loadError) {
        await recordFailure('recommendation', loadError)
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError))
      } finally {
        if (!cancelled) setBusy(false)
      }
    }

    void initialize()
    return () => {
      cancelled = true
    }
  }, [recordEvent, recordFailure, seed])

  function todayForPlan(candidate: GoalActivationPlan): string {
    return getLocalTimeContext(new Date(), candidate.review_cadence.timezone || timezoneOverride)
      .currentDate
  }

  async function persistPreparedPlan(
    candidate: GoalActivationPlan,
    baseMessages: GoalConversationMessage[],
    previewLabel: 'Initial' | 'Revised' | 'Updated',
    rollingOverride?: boolean,
  ) {
    if (!thread) return null
    const rollingWithoutDeadline =
      rollingOverride ?? userConfirmedNoFixedDeadline(baseMessages, seed.originalRequest)
    const prepared = scheduleGoalPlan(candidate, {
      rollingWithoutDeadline,
      today: todayForPlan(candidate),
    })
    const preview = await goalControlGateway.addMessage(thread.thread_id, {
      role: 'assistant',
      content: `${previewLabel} plan preview: ${prepared.plan.summary}`,
      structured: { kind: 'plan_preview', plan: prepared.plan },
      summaryUpdate: prepared.plan.rollingSummary,
    })
    const nextMessages = [...baseMessages, preview]
    if (prepared.question && prepared.questionContext) {
      const question = await goalControlGateway.addMessage(thread.thread_id, {
        role: 'assistant',
        content:
          'The plan needs one scheduling decision before activation. / 激活前还需要一个排程决定。',
        structured: {
          kind: 'question_batch',
          questions: [prepared.question],
          ...prepared.questionContext,
        },
      })
      nextMessages.push(question)
      await recordEvent('clarification_shown', {
        metadata: { questionCount: 1 },
        threadId: thread.thread_id,
      })
    }
    setMessages(nextMessages)
    setPlan(prepared.plan)
    setScheduleIssues(prepared.issues.map((issue) => issue.message))
    return prepared
  }

  async function submitAnswers(answers: Record<string, unknown>) {
    if (!thread) return
    setBusy(true)
    setError('')
    try {
      const activeScheduleContext = actionScheduleQuestionContext(messages.at(-1))
      const answer = await goalControlGateway.addMessage(thread.thread_id, {
        role: 'user',
        content: JSON.stringify(answers),
        structured: {
          answers,
          kind: 'question_answers',
          ...(activeScheduleContext
            ? {
                context: 'action_schedule',
                planFingerprint: activeScheduleContext.planFingerprint,
              }
            : {}),
        },
      })
      if (activeScheduleContext && plan) {
        const rawAnswer = answers.action_schedule
        const scheduleAnswer =
          rawAnswer && typeof rawAnswer === 'object' && !Array.isArray(rawAnswer)
            ? (rawAnswer as { custom?: string; selected?: string[] })
            : {}
        const resolution = applyActionScheduleAnswer(
          plan,
          scheduleAnswer,
          activeScheduleContext,
          todayForPlan(plan),
        )
        const answeredMessages = [...messages, answer]
        await recordEvent('clarification_completed', {
          metadata: { questionCount: 1, skippedCount: 0 },
          threadId: thread.thread_id,
        })
        if (resolution.manual) {
          const manual = await goalControlGateway.addMessage(thread.thread_id, {
            role: 'assistant',
            content:
              resolution.error ||
              '请在计划审阅中补齐标红的计划完成日；系统不会再次询问本次排程问题。',
            structured: {
              context: 'action_schedule',
              issueMessages: resolution.error ? [resolution.error] : [],
              kind: 'schedule_manual_entry',
              planFingerprint: activeScheduleContext.planFingerprint,
            },
          })
          setMessages([...answeredMessages, manual])
          setPlan(resolution.plan)
          setScheduleIssues([])
          if (resolution.error) setError(resolution.error)
          return
        }
        const prepared = scheduleGoalPlan(resolution.plan, {
          rollingWithoutDeadline:
            resolution.rollingWithoutDeadline ||
            userConfirmedNoFixedDeadline(answeredMessages, seed.originalRequest),
          today: todayForPlan(resolution.plan),
        })
        const preview = await goalControlGateway.addMessage(thread.thread_id, {
          role: 'assistant',
          content: `Updated plan preview: ${prepared.plan.summary}`,
          structured: { kind: 'plan_preview', plan: prepared.plan },
          summaryUpdate: prepared.plan.rollingSummary,
        })
        const resolvedMessages = [...answeredMessages, preview]
        setPlan(prepared.plan)
        setScheduleIssues(prepared.issues.map((issue) => issue.message))
        if (prepared.status === 'needs_clarification') {
          const issueMessages = prepared.issues.map((issue) => issue.message)
          const blocked = await goalControlGateway.addMessage(thread.thread_id, {
            role: 'assistant',
            content: `排程仍不可行：${issueMessages.join(' ')}`,
            structured: {
              context: 'action_schedule',
              issueMessages,
              kind: 'schedule_blocked',
              planFingerprint: prepared.fingerprint,
            },
          })
          setMessages([...resolvedMessages, blocked])
          setError(`排程仍不可行：${issueMessages.join(' ')}`)
          return
        }
        setMessages(resolvedMessages)
        return
      }
      const ready = await goalControlGateway.addMessage(thread.thread_id, {
        role: 'assistant',
        content:
          'The initial-plan brief is ready. Review every field before activation. / 初始计划信息已齐，请在激活前逐项审阅。',
        structured: { kind: 'planning_ready' },
      })
      setMessages((current) => [...current, answer, ready])
      const skippedCount = skippedAnswerCount(answers)
      await recordEvent(skippedCount ? 'clarification_skipped' : 'clarification_completed', {
        metadata: {
          questionCount: Object.keys(answers).length,
          skippedCount,
        },
        threadId: thread.thread_id,
      })
    } catch (submitError) {
      await recordFailure('clarification', submitError, thread.thread_id)
      setError(submitError instanceof Error ? submitError.message : String(submitError))
    } finally {
      setBusy(false)
    }
  }

  async function generatePlan() {
    if (!thread) return
    setBusy(true)
    setError('')
    try {
      const generated = await goalControlGateway.generatePlan({
        messages,
        mode: selectedMode,
        rollingSummary: thread.rolling_summary,
        templateId: seed.template.id,
        threadId: thread.thread_id,
        threadTitle: thread.title,
      })
      const normalized = normalizePlan(generated, seed, messages)
      await persistPreparedPlan(normalized, messages, 'Initial')
      await recordEvent('initial_plan_generated', { threadId: thread.thread_id })
    } catch (planningError) {
      await recordFailure('generation', planningError, thread.thread_id)
      setError(planningError instanceof Error ? planningError.message : String(planningError))
    } finally {
      setBusy(false)
    }
  }

  async function revisePlan(instruction: string) {
    if (!thread || !plan || !instruction.trim()) return
    setBusy(true)
    setError('')
    try {
      const request = await goalControlGateway.addMessage(thread.thread_id, {
        role: 'user',
        content: instruction.trim(),
        structured: { instruction: instruction.trim(), kind: 'plan_revision_request' },
      })
      const nextMessages = [...messages, request]
      const revised = await goalControlGateway.revisePlan({
        currentPlan: plan,
        instruction: instruction.trim(),
        messages: nextMessages,
        mode: selectedMode,
        threadId: thread.thread_id,
      })
      const normalized = normalizePlan(revised, seed, nextMessages)
      await persistPreparedPlan(normalized, nextMessages, 'Revised')
      await recordEvent('initial_plan_ai_revision', {
        metadata: { revisionCount: 1 },
        threadId: thread.thread_id,
      })
    } catch (revisionError) {
      await recordFailure('revision', revisionError, thread.thread_id)
      setError(revisionError instanceof Error ? revisionError.message : String(revisionError))
    } finally {
      setBusy(false)
    }
  }

  const editPlan = useCallback(
    (nextPlan: GoalActivationPlan) => {
      setPlan(nextPlan)
      setScheduleIssues([])
      if (!thread) return
      if (editEventTimer.current) clearTimeout(editEventTimer.current)
      editEventTimer.current = setTimeout(() => {
        void recordEvent('initial_plan_structured_edit', {
          metadata: { editCount: 1 },
          threadId: thread.thread_id,
        })
      }, 600)
    },
    [recordEvent, thread],
  )

  async function activate() {
    if (!thread || !plan) return
    setBusy(true)
    setError('')
    try {
      const prepared = scheduleGoalPlan(plan, {
        rollingWithoutDeadline: userConfirmedNoFixedDeadline(messages, seed.originalRequest),
        today: todayForPlan(plan),
      })
      setPlan(prepared.plan)
      setScheduleIssues(prepared.issues.map((issue) => issue.message))
      if (prepared.status === 'needs_clarification') {
        if (
          prepared.question &&
          prepared.questionContext &&
          !actionScheduleQuestionWasAsked(messages, prepared.fingerprint)
        ) {
          const nextMessages = [...messages]
          if (prepared.changed) {
            const preview = await goalControlGateway.addMessage(thread.thread_id, {
              role: 'assistant',
              content: `Updated plan preview: ${prepared.plan.summary}`,
              structured: { kind: 'plan_preview', plan: prepared.plan },
              summaryUpdate: prepared.plan.rollingSummary,
            })
            nextMessages.push(preview)
          }
          const question = await goalControlGateway.addMessage(thread.thread_id, {
            role: 'assistant',
            content:
              'The plan needs one scheduling decision before activation. / 激活前还需要一个排程决定。',
            structured: {
              kind: 'question_batch',
              questions: [prepared.question],
              ...prepared.questionContext,
            },
          })
          nextMessages.push(question)
          setMessages(nextMessages)
          await recordEvent('clarification_shown', {
            metadata: { questionCount: 1 },
            threadId: thread.thread_id,
          })
        } else {
          setError(`计划仍无法激活：${prepared.issues.map((issue) => issue.message).join(' ')}`)
        }
        return
      }
      if (prepared.changed) {
        const preview = await goalControlGateway.addMessage(thread.thread_id, {
          role: 'assistant',
          content: `Updated plan preview: ${prepared.plan.summary}`,
          structured: { kind: 'plan_preview', plan: prepared.plan },
          summaryUpdate: prepared.plan.rollingSummary,
        })
        setMessages([...messages, preview])
        setScheduleIssues([])
        setError('系统已补齐可调整的计划完成日，请检查后再次批准。')
        return
      }
      const issues = planBlockingIssues(prepared.plan)
      if (issues.length) {
        setError(issues.join(' '))
        return
      }
      await recordEvent('initial_plan_approved', { threadId: thread.thread_id })
      const result = await goalControlGateway.activate(thread.thread_id, prepared.plan)
      await recordEvent('active_tool_created', {
        projectId: result.project.project_id,
        threadId: thread.thread_id,
      })
      await loadOverview()
      requestScheduleRecompute('active_tool_activated')
      setActivationMessage(
        `${prepared.plan.title} 已激活；最新全局排程会生成审核提案，确认前不会写入日历。`,
      )
    } catch (activationError) {
      await recordFailure('activation', activationError, thread.thread_id)
      setError(activationError instanceof Error ? activationError.message : String(activationError))
    } finally {
      setBusy(false)
    }
  }

  const pendingQuestions =
    messages.at(-1)?.structured.kind === 'question_batch' &&
    Array.isArray(messages.at(-1)?.structured.questions)
      ? (messages.at(-1)?.structured.questions as ReturnType<
          typeof activeToolClarificationQuestions
        >)
      : null
  const blockingIssues = useMemo(
    () => (plan ? [...planBlockingIssues(plan), ...scheduleIssues] : []),
    [plan, scheduleIssues],
  )

  return {
    activate,
    activationMessage,
    blockingIssues,
    busy,
    error,
    generatePlan,
    messages,
    pendingQuestions,
    plan,
    planReady: messages.at(-1)?.structured.kind === 'planning_ready',
    requiresPlanningDate: actionNeedsPlanningDate,
    revisePlan,
    selectedMode,
    setPlan: editPlan,
    submitAnswers,
    thread,
  }
}
