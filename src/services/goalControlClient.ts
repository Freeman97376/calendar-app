import type {
  AIUsageSummary,
  GoalActivationPlan,
  GoalControlDashboard,
  GoalConversationMessage,
  GoalConversationThread,
  PlanChangeProposal,
} from '../domain/types/goalControl'
import { apiUrl, authenticatedFetch } from './appApiClient'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(apiUrl(path), init)
  const payload = (await response.json().catch(() => null)) as
    | ({ error?: { message?: string } } & T)
    | null
  if (!response.ok) throw new Error(payload?.error?.message ?? `Goal control request failed (${response.status})`)
  return payload as T
}

function json(method: 'POST' | 'PATCH', body: unknown): RequestInit {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
}

export const goalControlClient = {
  async listThreads() {
    const payload = await request<{ threads: GoalConversationThread[] }>('/api/goal-conversations')
    return payload.threads
  },
  async createThread(input: { title: string; template_id?: string }) {
    const payload = await request<{ thread: GoalConversationThread }>('/api/goal-conversations', json('POST', input))
    return payload.thread
  },
  async getThread(threadId: string) {
    return request<{ thread: GoalConversationThread; messages: GoalConversationMessage[] }>(`/api/goal-conversations/${encodeURIComponent(threadId)}`)
  },
  async addMessage(threadId: string, input: { role: string; content: string; structured?: Record<string, unknown>; summaryUpdate?: string; summaryThroughMessageId?: string }) {
    const payload = await request<{ message: GoalConversationMessage }>(`/api/goal-conversations/${encodeURIComponent(threadId)}/messages`, json('POST', input))
    return payload.message
  },
  async activate(threadId: string, plan: GoalActivationPlan) {
    return request<{ project: { project_id: string } }>(`/api/goal-conversations/${encodeURIComponent(threadId)}/activate`, json('POST', plan))
  },
  async dashboard(projectId: string) {
    const payload = await request<{ dashboard: GoalControlDashboard }>(`/api/memory/projects/${encodeURIComponent(projectId)}/dashboard`)
    return payload.dashboard
  },
  async updatePolicy(projectId: string, patch: Record<string, unknown>) {
    const payload = await request<{ policy: GoalControlDashboard['policy'] }>(`/api/memory/projects/${encodeURIComponent(projectId)}/control-policy`, json('PATCH', patch))
    return payload.policy
  },
  async addMetricEntry(metricId: string, value: Record<string, unknown>) {
    return request(`/api/metrics/${encodeURIComponent(metricId)}/entries`, json('POST', value))
  },
  async ensureCheckIns() {
    return request<{ checkIns: unknown[] }>('/api/check-ins/ensure', json('POST', {}))
  },
  async pendingCheckIns() {
    const payload = await request<{ checkIns: Array<Record<string, unknown>> }>('/api/check-ins/pending')
    return payload.checkIns
  },
  async answerCheckIn(checkInId: string, answers: Record<string, unknown>) {
    return request<Record<string, unknown> & { project_id: string; thread_id?: string | null; includes_review?: boolean; summary?: { requires_ai_summary?: boolean } }>(`/api/check-ins/${encodeURIComponent(checkInId)}/answer`, json('POST', { answers }))
  },
  async usage(projectId?: string) {
    const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''
    const payload = await request<{ usage: AIUsageSummary }>(`/api/me/ai-usage${query}`)
    return payload.usage
  },
  async rollback(versionId: string) {
    return request(`/api/plan-versions/${encodeURIComponent(versionId)}/rollback`, json('POST', {}))
  },
  async createVersion(projectId: string, input: Record<string, unknown>) {
    return request(`/api/memory/projects/${encodeURIComponent(projectId)}/plan-versions`, json('POST', input))
  },
  async createProposal(input: Record<string, unknown>) {
    const payload = await request<{ proposal: PlanChangeProposal }>('/api/plan-change-proposals', json('POST', input))
    return payload.proposal
  },
  async resolveProposal(proposalId: string, accept: boolean, acceptedDiffIds?: string[]) {
    const payload = await request<{ proposal: PlanChangeProposal }>(
      `/api/plan-change-proposals/${encodeURIComponent(proposalId)}/resolve`,
      json('POST', { accept, ...(acceptedDiffIds ? { accepted_diff_ids: acceptedDiffIds } : {}) }),
    )
    return payload.proposal
  },
}
