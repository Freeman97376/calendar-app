import { useCallback, useEffect, useMemo, useState } from 'react'

import { planBlockingIssues } from '../domain/logic/activeToolOnboarding'
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
  AIUsageMode,
  GoalActivationPlan,
  GoalConversationMessage,
  GoalConversationThread,
  QuestionBatchItem,
} from '../domain/types/goalControl'
import { useConfigStore } from '../store/configStore'
import { goalControlGateway } from '../store/goalControlStore'
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

export function useGoalConversation() {
  const auth = useAuth()
  const [threads, setThreads] = useState<GoalConversationThread[]>([])
  const [thread, setThread] = useState<GoalConversationThread | null>(null)
  const [messages, setMessages] = useState<GoalConversationMessage[]>([])
  const [plan, setPlan] = useState<GoalActivationPlan | null>(null)
  const [scheduleIssues, setScheduleIssues] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [activationMessage, setActivationMessage] = useState('')
  const loadOverview = useLongTermMemoryStore((state) => state.loadOverview)
  const timezoneOverride = useConfigStore((state) => state.config.timezoneOverride)
  const selectedMode =
    (auth.preferences.aiUsageMode as AIUsageMode) ||
    auth.capabilities?.aiDefaultUsageMode ||
    'balanced'

  function todayForPlan(candidate: GoalActivationPlan): string {
    return getLocalTimeContext(new Date(), candidate.review_cadence.timezone || timezoneOverride)
      .currentDate
  }

  const refreshThreads = useCallback(async () => {
    const values = await goalControlGateway.listThreads()
    const drafts = values.filter((item) => item.status === 'draft')
    setThreads(drafts)
    return drafts
  }, [])

  const selectThread = useCallback(async (value: GoalConversationThread) => {
    setBusy(true)
    setError('')
    try {
      const loaded = await goalControlGateway.getThread(value.thread_id)
      setThread(loaded.thread)
      setMessages(loaded.messages)
      setPlan(restoredPlan(loaded.messages))
      setScheduleIssues(restoredScheduleIssues(loaded.messages))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    refreshThreads().catch((loadError: unknown) =>
      setError(loadError instanceof Error ? loadError.message : String(loadError)),
    )
  }, [refreshThreads])

  function newConversation() {
    setThread(null)
    setMessages([])
    setPlan(null)
    setScheduleIssues([])
    setError('')
    setActivationMessage('')
  }

  async function start(title: string, questions: QuestionBatchItem[]) {
    setBusy(true)
    setError('')
    try {
      const created = await goalControlGateway.createThread({ title: title.trim() })
      const prompt = await goalControlGateway.addMessage(created.thread_id, {
        role: 'assistant',
        content:
          'First, let’s anchor the plan to your current situation, evidence, and real constraints. / 先确认你当前所处阶段、已有依据和现实限制。',
        structured: { kind: 'question_batch', questions },
      })
      setThread(created)
      setMessages([prompt])
      setPlan(null)
      await refreshThreads()
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : String(startError))
    } finally {
      setBusy(false)
    }
  }

  async function submitAnswers(
    answers: Record<string, unknown>,
    nextQuestionBatches: QuestionBatchItem[][],
  ) {
    if (!thread) return
    setBusy(true)
    setError('')
    try {
      const activeScheduleContext = actionScheduleQuestionContext(messages.at(-1))
      const answerCount = messages.filter(
        (message) => message.role === 'user' && message.structured.kind === 'question_answers',
      ).length
      const answer = await goalControlGateway.addMessage(thread.thread_id, {
        role: 'user',
        content: JSON.stringify(answers),
        structured: {
          kind: 'question_answers',
          answers,
          ...(activeScheduleContext
            ? {
                context: 'action_schedule',
                planFingerprint: activeScheduleContext.planFingerprint,
              }
            : {}),
        },
      })
      const nextMessages = [...messages, answer]
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
        if (resolution.manual) {
          const manualMessage =
            resolution.error || '请在计划审阅中修改日期或容量；系统不会再次询问本次排程问题。'
          const manual = await goalControlGateway.addMessage(thread.thread_id, {
            role: 'assistant',
            content: manualMessage,
            structured: {
              context: 'action_schedule',
              issueMessages: resolution.error
                ? [resolution.error]
                : activeScheduleContext.issueMessages,
              kind: 'schedule_manual_entry',
              planFingerprint: activeScheduleContext.planFingerprint,
            },
          })
          setMessages([...nextMessages, manual])
          setPlan(resolution.plan)
          setScheduleIssues(
            resolution.error ? [resolution.error] : activeScheduleContext.issueMessages,
          )
          if (resolution.error) setError(resolution.error)
          return
        }
        const prepared = scheduleGoalPlan(resolution.plan, {
          rollingWithoutDeadline:
            resolution.rollingWithoutDeadline ||
            userConfirmedNoFixedDeadline(nextMessages, thread.title),
          today: todayForPlan(resolution.plan),
        })
        const preview = await goalControlGateway.addMessage(thread.thread_id, {
          role: 'assistant',
          content: 'Updated plan preview: ' + prepared.plan.summary,
          structured: { kind: 'plan_preview', plan: prepared.plan },
          summaryUpdate: prepared.plan.rollingSummary,
        })
        const resolvedMessages = [...nextMessages, preview]
        setPlan(prepared.plan)
        setScheduleIssues(prepared.issues.map((issue) => issue.message))
        if (prepared.status === 'needs_clarification') {
          const issueMessages = prepared.issues.map((issue) => issue.message)
          const blocked = await goalControlGateway.addMessage(thread.thread_id, {
            role: 'assistant',
            content: '排程仍不可行：' + issueMessages.join(' '),
            structured: {
              context: 'action_schedule',
              issueMessages,
              kind: 'schedule_blocked',
              planFingerprint: prepared.fingerprint,
            },
          })
          setMessages([...resolvedMessages, blocked])
          setError('排程仍不可行：' + issueMessages.join(' '))
          return
        }
        setMessages(resolvedMessages)
        setScheduleIssues([])
        return
      }
      const nextQuestions = nextQuestionBatches[answerCount]
      const followup = nextQuestions
        ? await goalControlGateway.addMessage(thread.thread_id, {
            role: 'assistant',
            content:
              answerCount === 0
                ? 'Current situation anchored. Now define the desired outcome, time horizon, and realistic weekly capacity. / 当前情况已锚定，接下来确认目标结果、周期和现实可用时间。'
                : 'Now choose tracking signals, execution level, and pause rules. / 接下来选择追踪指标、执行档位和暂停规则。',
            structured: { kind: 'question_batch', questions: nextQuestions },
          })
        : await goalControlGateway.addMessage(thread.thread_id, {
            role: 'assistant',
            content:
              'The planning brief is ready and anchored to your current situation. Generate a measurable plan when you are ready; it will not be activated until you confirm. / 规划简报已结合你的当前情况，生成后仍需你确认才会激活。',
            structured: { kind: 'planning_ready' },
          })
      setMessages([...nextMessages, followup])
    } catch (submitError) {
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
      const nextPlan = await goalControlGateway.generatePlan({
        mode: selectedMode,
        threadId: thread.thread_id,
        threadTitle: thread.title,
        rollingSummary: thread.rolling_summary,
        messages,
      })
      const prepared = scheduleGoalPlan(nextPlan, {
        rollingWithoutDeadline: userConfirmedNoFixedDeadline(messages, thread.title),
        today: todayForPlan(nextPlan),
      })
      const preview = await goalControlGateway.addMessage(thread.thread_id, {
        role: 'assistant',
        content: 'Plan preview: ' + prepared.plan.summary,
        structured: { kind: 'plan_preview', plan: prepared.plan },
        summaryUpdate: prepared.plan.rollingSummary,
      })
      const nextMessages = [...messages, preview]
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
      }
      setMessages(nextMessages)
      if (prepared.plan.rollingSummary) {
        setThread((current) =>
          current
            ? {
                ...current,
                rolling_summary: prepared.plan.rollingSummary || current.rolling_summary,
              }
            : current,
        )
      }
      setPlan(prepared.plan)
      setScheduleIssues(prepared.issues.map((issue) => issue.message))
    } catch (planningError) {
      setError(planningError instanceof Error ? planningError.message : String(planningError))
    } finally {
      setBusy(false)
    }
  }

  async function activate() {
    if (!thread || !plan) return
    setBusy(true)
    setError('')
    try {
      const prepared = scheduleGoalPlan(plan, {
        rollingWithoutDeadline: userConfirmedNoFixedDeadline(messages, thread.title),
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
              content: 'Updated plan preview: ' + prepared.plan.summary,
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
        } else {
          setError('计划仍无法激活：' + prepared.issues.map((issue) => issue.message).join(' '))
        }
        return
      }
      if (prepared.changed) {
        const preview = await goalControlGateway.addMessage(thread.thread_id, {
          role: 'assistant',
          content: 'Updated plan preview: ' + prepared.plan.summary,
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
      await goalControlGateway.activate(thread.thread_id, prepared.plan)
      await loadOverview()
      requestScheduleRecompute('active_tool_activated')
      setActivationMessage(
        `${plan.title} 已激活。全局排程影响将在当前工作区生成提案，确认前不会写入日历。`,
      )
      await refreshThreads()
    } catch (activationError) {
      setError(activationError instanceof Error ? activationError.message : String(activationError))
    } finally {
      setBusy(false)
    }
  }

  const editPlan = useCallback((nextPlan: GoalActivationPlan) => {
    setPlan(nextPlan)
    setScheduleIssues([])
    setError('')
  }, [])

  const userAnswerCount = messages.filter(
    (message) => message.role === 'user' && message.structured.kind === 'question_answers',
  ).length
  const blockingIssues = useMemo(
    () => (plan ? [...planBlockingIssues(plan), ...scheduleIssues] : []),
    [plan, scheduleIssues],
  )
  return {
    activate,
    blockingIssues,
    busy,
    error,
    generatePlan,
    messages,
    activationMessage,
    newConversation,
    plan,
    planReady: Boolean(
      thread &&
      (messages.at(-1)?.structured.kind === 'planning_ready' ||
        (userAnswerCount >= 3 && messages.at(-1)?.structured.kind !== 'question_batch')),
    ),
    refreshThreads,
    requiresPlanningDate: actionNeedsPlanningDate,
    selectedMode,
    selectThread,
    setPlan: editPlan,
    start,
    submitAnswers,
    thread,
    threads,
  }
}
