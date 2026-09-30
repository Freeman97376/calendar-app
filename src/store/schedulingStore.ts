import { create } from 'zustand'

import { EventSchema } from '../domain/schemas/event.schema'
import type { ScheduleProposal } from '../domain/schemas/scheduling.schema'
import {
  loadCurrentScheduleProposal,
  recomputeScheduleProposal,
  resolveScheduleProposal,
  SchedulingApiError,
  type SchedulingProjectPatch,
} from '../services/schedulingService'
import { useEventStore } from './eventStore'

type SchedulingStore = {
  proposal: ScheduleProposal | null
  isLoading: boolean
  error: string | null
  load: () => Promise<ScheduleProposal | null>
  recompute: (
    reason?: string,
    projectPatch?: SchedulingProjectPatch,
  ) => Promise<ScheduleProposal | null>
  resolve: (decision: 'accept' | 'reject') => Promise<ScheduleProposal | null>
  reset: () => void
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '无法处理全局排程提案。'
}

let sessionGeneration = 0
let requestQueue: Promise<unknown> = Promise.resolve()

function enqueue(operation: (generation: number) => Promise<ScheduleProposal | null>) {
  const generation = sessionGeneration
  const next = requestQueue
    .catch(() => undefined)
    .then(async () => {
      if (generation !== sessionGeneration) return null
      useSchedulingStore.setState({ isLoading: true, error: null })
      try {
        const proposal = await operation(generation)
        if (generation === sessionGeneration)
          useSchedulingStore.setState({ proposal, isLoading: false })
        return proposal
      } catch (error) {
        if (generation === sessionGeneration)
          useSchedulingStore.setState({
            ...(error instanceof SchedulingApiError && error.latestProposal
              ? { proposal: error.latestProposal }
              : {}),
            error: messageOf(error),
            isLoading: false,
          })
        throw error
      }
    })
  requestQueue = next
  return next
}

export const useSchedulingStore = create<SchedulingStore>((set, get) => ({
  proposal: null,
  isLoading: false,
  error: null,
  load: () => enqueue(() => loadCurrentScheduleProposal()),
  recompute: (reason = 'manual', projectPatch) =>
    enqueue(() => recomputeScheduleProposal(reason, projectPatch)),
  resolve: (decision) => {
    const current = get().proposal
    if (!current) return Promise.resolve(null)
    return enqueue(async (generation) => {
      const proposal = await resolveScheduleProposal(
        current.proposalId,
        decision,
        current.inputFingerprint,
      )
      if (generation !== sessionGeneration) return null
      const applyResult = proposal?.proposal.applyResult
      if (decision === 'accept' && applyResult) {
        const parsedEvents = EventSchema.array().safeParse(applyResult.events)
        const deletedIds = Array.isArray(applyResult.deletedEventIds)
          ? applyResult.deletedEventIds.filter(
              (value): value is string => typeof value === 'string',
            )
          : []
        useEventStore
          .getState()
          .reconcileBatch(parsedEvents.success ? parsedEvents.data : [], deletedIds)
        const projectId = applyResult.updatedProjectId
        if (typeof projectId === 'string') {
          const { useLongTermMemoryStore } = await import('./longTermMemoryStore')
          if (generation !== sessionGeneration) return null
          await useLongTermMemoryStore.getState().loadOverview()
          if (generation !== sessionGeneration) return null
          await useLongTermMemoryStore.getState().loadProjectDetails(projectId)
        }
      }
      return proposal
    })
  },
  reset: () => {
    sessionGeneration += 1
    requestQueue = Promise.resolve()
    resetScheduleRecomputeTimer()
    set({ proposal: null, isLoading: false, error: null })
  },
}))

let recomputeTimer: ReturnType<typeof setTimeout> | null = null
let pendingReason = 'calendar_changed'

export function requestScheduleRecompute(reason = 'calendar_changed') {
  pendingReason = reason
  if (recomputeTimer) clearTimeout(recomputeTimer)
  recomputeTimer = setTimeout(() => {
    recomputeTimer = null
    void useSchedulingStore
      .getState()
      .recompute(pendingReason)
      .catch(() => undefined)
  }, 350)
}

export function resetScheduleRecomputeTimer() {
  if (recomputeTimer) clearTimeout(recomputeTimer)
  recomputeTimer = null
}
