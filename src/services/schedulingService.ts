import {
  ScheduleProposalResponseSchema,
  ScheduleProposalSchema,
  type ScheduleProposal,
} from '../domain/schemas/scheduling.schema'
import { apiErrorFromResponse, apiUrl, authenticatedFetch } from './appApiClient'

export class SchedulingApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly latestProposal: ScheduleProposal | null = null,
  ) {
    super(message)
    this.name = 'SchedulingApiError'
  }
}

async function request(path: string, init?: RequestInit): Promise<ScheduleProposal | null> {
  const response = await authenticatedFetch(apiUrl(path), init)
  if (!response.ok) {
    const payload = (await response
      .clone()
      .json()
      .catch(() => null)) as {
      error?: { details?: { latestProposal?: unknown }; message?: string }
    } | null
    const latest = ScheduleProposalSchema.safeParse(payload?.error?.details?.latestProposal)
    const fallback = await apiErrorFromResponse(response)
    throw new SchedulingApiError(
      payload?.error?.message ?? fallback.message,
      response.status,
      latest.success ? latest.data : null,
    )
  }
  return ScheduleProposalResponseSchema.parse(await response.json()).proposal
}

export function loadCurrentScheduleProposal() {
  return request('/api/scheduling/proposals/current')
}

export type SchedulingProjectPatch = {
  projectId: string
  baseVersionId?: string
  changes: {
    title?: string
    description?: string
    status?: 'active' | 'paused' | 'completed'
    metadata?: Record<string, unknown>
    policy?: {
      weeklyCapacityMinutes?: number
      bufferPercent?: number
      availableDays?: string[]
    }
    actions?: Array<{
      actionId: string
      title?: string
      description?: string
      dueDate?: string | null
      estimatedMinutes?: number
      executionTier?: 'minimum' | 'standard' | 'stretch'
      priority?: 'high' | 'medium' | 'low'
    }>
    dependencies?: Array<{
      predecessorActionId: string
      successorActionId: string
    }>
  }
}

export function recomputeScheduleProposal(reason: string, projectPatch?: SchedulingProjectPatch) {
  return request('/api/scheduling/proposals/recompute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason, ...(projectPatch ? { projectPatch } : {}) }),
  })
}

export function resolveScheduleProposal(
  proposalId: string,
  decision: 'accept' | 'reject',
  inputFingerprint: string,
) {
  return request(`/api/scheduling/proposals/${encodeURIComponent(proposalId)}/resolve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision, inputFingerprint }),
  })
}
