import { useCallback, useEffect, useMemo, useState } from 'react'

import type {
  GoalControlDashboard,
  GoalConversationMessage,
  MetricDefinition,
} from '../domain/types/goalControl'
import { goalControlGateway } from '../store/goalControlStore'

export function useGoalControlDashboard(projectId: string) {
  const [dashboard, setDashboard] = useState<GoalControlDashboard | null>(null)
  const [messages, setMessages] = useState<GoalConversationMessage[]>([])
  const [brief, setBrief] = useState('')
  const [chatDraft, setChatDraft] = useState('')
  const [metricDrafts, setMetricDrafts] = useState<Record<string, string>>({})
  const [proposalSelections, setProposalSelections] = useState<Record<string, string[]>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const value = await goalControlGateway.dashboard(projectId)
      setDashboard(value)
      setProposalSelections(
        Object.fromEntries(
          (value.proposals ?? [])
            .filter((item) => item.status === 'pending')
            .map((item) => [item.proposal_id, item.diff.map((diff) => diff.id)]),
        ),
      )
      const planningBrief = value.policy.planning_brief
      setBrief(
        typeof planningBrief?.summary === 'string'
          ? planningBrief.summary
          : value.project.description,
      )
      const activeThread = value.threads[0]
      setMessages(
        activeThread ? (await goalControlGateway.getThread(activeThread.thread_id)).messages : [],
      )
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setBusy(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    const refresh = () => {
      void load()
    }
    window.addEventListener('calendar:session-restored', refresh)
    return () => window.removeEventListener('calendar:session-restored', refresh)
  }, [load])
  const plannedMinutes = useMemo(() => {
    const rank = { minimum: 0, standard: 1, stretch: 2 }
    const activeRank = rank[(dashboard?.policy.active_tier || 'standard') as keyof typeof rank] ?? 1
    return (
      dashboard?.actions
        .filter(
          (action) =>
            !['done', 'skipped'].includes(action.status) &&
            (rank[action.execution_tier as keyof typeof rank] ?? 1) <= activeRank,
        )
        .reduce((sum, action) => sum + Number(action.estimated_minutes || 0), 0) ?? 0
    )
  }, [dashboard?.actions, dashboard?.policy.active_tier])
  const actualMinutes = useMemo(
    () => dashboard?.effort.reduce((sum, item) => sum + Number(item.minutes || 0), 0) ?? 0,
    [dashboard?.effort],
  )

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError))
    } finally {
      setBusy(false)
    }
  }
  async function patchPolicy(patch: Record<string, unknown>) {
    await run(async () => {
      await goalControlGateway.updatePolicy(projectId, patch)
      await goalControlGateway.createVersion(projectId, {
        source: 'manual',
        summary: 'Updated goal control settings.',
      })
      await load()
    })
  }
  async function addMetric(metric: MetricDefinition) {
    const value = Number(metricDrafts[metric.metric_id])
    if (!Number.isFinite(value)) return
    await run(async () => {
      await goalControlGateway.addMetricEntry(metric.metric_id, {
        numeric_value: value,
        source: 'manual',
        confidence: 1,
      })
      setMetricDrafts((current) => ({ ...current, [metric.metric_id]: '' }))
      await load()
    })
  }
  async function sendMessage() {
    const thread = dashboard?.threads[0]
    if (!thread || !chatDraft.trim()) return
    await run(async () => {
      const message = await goalControlGateway.addMessage(thread.thread_id, {
        role: 'user',
        content: chatDraft.trim(),
        structured: { kind: 'user_plan_message' },
      })
      setMessages((current) => [...current, message])
      setChatDraft('')
    })
  }
  async function answerCheckIn(checkInId: string, answers: Record<string, unknown>) {
    await run(async () => {
      await goalControlGateway.answerCheckIn(checkInId, answers)
      await load()
    })
  }
  async function skipCheckIn(checkInId: string) {
    await run(async () => {
      await goalControlGateway.skipCheckIn(checkInId)
      await load()
    })
  }
  async function rollback(versionId: string) {
    await run(async () => {
      await goalControlGateway.rollback(versionId)
      await load()
    })
  }
  async function resolveProposal(proposalId: string, accept: boolean) {
    await run(async () => {
      await goalControlGateway.resolveProposal(
        proposalId,
        accept,
        accept ? (proposalSelections[proposalId] ?? []) : undefined,
      )
      await load()
    })
  }
  function toggleProposalDiff(proposalId: string, diffId: string) {
    setProposalSelections((current) => {
      const selected = new Set(current[proposalId] ?? [])
      if (selected.has(diffId)) selected.delete(diffId)
      else selected.add(diffId)
      return { ...current, [proposalId]: [...selected] }
    })
  }

  return {
    actualMinutes,
    addMetric,
    answerCheckIn,
    brief,
    busy,
    chatDraft,
    dashboard,
    error,
    messages,
    metricDrafts,
    patchPolicy,
    plannedMinutes,
    proposalSelections,
    resolveProposal,
    rollback,
    sendMessage,
    setBrief,
    setChatDraft,
    setMetricDrafts,
    skipCheckIn,
    toggleProposalDiff,
  }
}
