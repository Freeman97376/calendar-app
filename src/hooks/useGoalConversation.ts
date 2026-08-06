import { useCallback, useEffect, useState } from 'react'

import type {
  AIUsageMode,
  GoalActivationPlan,
  GoalConversationMessage,
  GoalConversationThread,
  QuestionBatchItem,
} from '../domain/types/goalControl'
import { goalControlGateway } from '../store/goalControlStore'
import { useLongTermMemoryStore } from '../store/longTermMemoryStore'
import { useUIStore } from '../store/uiStore'
import { useAuth } from './useAuth'

function restoredPlan(messages: GoalConversationMessage[]): GoalActivationPlan | null {
  const message = [...messages].reverse().find((item) => item.structured.kind === 'plan_preview')
  return (message?.structured.plan as GoalActivationPlan | undefined) ?? null
}

export function useGoalConversation() {
  const auth = useAuth()
  const [threads, setThreads] = useState<GoalConversationThread[]>([])
  const [thread, setThread] = useState<GoalConversationThread | null>(null)
  const [messages, setMessages] = useState<GoalConversationMessage[]>([])
  const [plan, setPlan] = useState<GoalActivationPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const loadOverview = useLongTermMemoryStore((state) => state.loadOverview)
  const openEnabledTools = useUIStore((state) => state.openEnabledToolsPanel)
  const selectedMode =
    (auth.preferences.aiUsageMode as AIUsageMode) ||
    auth.capabilities?.aiDefaultUsageMode ||
    'balanced'

  const refreshThreads = useCallback(async () => {
    const values = await goalControlGateway.listThreads()
    setThreads(values)
    return values
  }, [])

  const selectThread = useCallback(async (value: GoalConversationThread) => {
    setBusy(true)
    setError('')
    try {
      const loaded = await goalControlGateway.getThread(value.thread_id)
      setThread(loaded.thread)
      setMessages(loaded.messages)
      setPlan(restoredPlan(loaded.messages))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    refreshThreads()
      .then((values) => {
        const draft = values.find((item) => item.status === 'draft')
        if (draft) void selectThread(draft)
      })
      .catch((loadError: unknown) =>
        setError(loadError instanceof Error ? loadError.message : String(loadError)),
      )
  }, [refreshThreads, selectThread])

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
      const answerCount = messages.filter(
        (message) => message.role === 'user' && message.structured.kind === 'question_answers',
      ).length
      const answer = await goalControlGateway.addMessage(thread.thread_id, {
        role: 'user',
        content: JSON.stringify(answers),
        structured: { kind: 'question_answers', answers },
      })
      const nextMessages = [...messages, answer]
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
      const preview = await goalControlGateway.addMessage(thread.thread_id, {
        role: 'assistant',
        content: `Plan preview: ${nextPlan.summary}`,
        structured: { kind: 'plan_preview', plan: nextPlan },
        summaryUpdate: nextPlan.rollingSummary,
      })
      setMessages((current) => [...current, preview])
      if (nextPlan.rollingSummary) {
        setThread((current) =>
          current
            ? { ...current, rolling_summary: nextPlan.rollingSummary || current.rolling_summary }
            : current,
        )
      }
      setPlan(nextPlan)
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
      const result = await goalControlGateway.activate(thread.thread_id, plan)
      await loadOverview()
      openEnabledTools(result.project.project_id)
    } catch (activationError) {
      setError(activationError instanceof Error ? activationError.message : String(activationError))
      setBusy(false)
    }
  }

  const userAnswerCount = messages.filter(
    (message) => message.role === 'user' && message.structured.kind === 'question_answers',
  ).length
  return {
    activate,
    busy,
    error,
    generatePlan,
    messages,
    plan,
    planReady: Boolean(
      thread &&
      (messages.at(-1)?.structured.kind === 'planning_ready' ||
        (userAnswerCount >= 3 && messages.at(-1)?.structured.kind !== 'question_batch')),
    ),
    refreshThreads,
    selectedMode,
    selectThread,
    setPlan,
    start,
    submitAnswers,
    thread,
    threads,
  }
}
