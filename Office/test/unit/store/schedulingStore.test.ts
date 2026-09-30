import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import type { ScheduleProposal } from '../../../../src/domain/schemas/scheduling.schema'
import * as service from '../../../../src/services/schedulingService'
import { useSchedulingStore } from '../../../../src/store/schedulingStore'

function proposal(id: string): ScheduleProposal {
  return {
    proposalId: id,
    status: 'pending',
    inputFingerprint: 'a'.repeat(64),
    createdAt: id,
    updatedAt: id,
    replayed: false,
    proposal: {
      kind: 'global_schedule',
      reason: 'test',
      message: '',
      changes: [],
      actionDateChanges: [],
      conflicts: [],
      toolImpacts: [],
      capacityBorrowing: [],
      unscheduled: [],
      autoApply: false,
    },
  }
}

describe('serialized schedule requests', () => {
  beforeEach(() => useSchedulingStore.getState().reset())
  afterEach(() => vi.restoreAllMocks())

  it('does not send the next mutation before the first finishes', async () => {
    let finish!: (value: ScheduleProposal) => void
    const request = vi
      .spyOn(service, 'recomputeScheduleProposal')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          }),
      )
      .mockResolvedValue(proposal('second'))
    const first = useSchedulingStore.getState().recompute('first')
    const second = useSchedulingStore.getState().recompute('second')
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    finish(proposal('first'))
    await Promise.all([first, second])
    expect(request).toHaveBeenCalledTimes(2)
    expect(useSchedulingStore.getState().proposal?.proposalId).toBe('second')
  })

  it('does not let old session responses replace new session state', async () => {
    let finish!: (value: ScheduleProposal) => void
    vi.spyOn(service, 'recomputeScheduleProposal')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          }),
      )
      .mockResolvedValue(proposal('new-user'))
    const old = useSchedulingStore.getState().recompute()
    await vi.waitFor(() => expect(finish).toBeDefined())
    useSchedulingStore.getState().reset()
    await useSchedulingStore.getState().recompute()
    finish(proposal('old-user'))
    await old
    expect(useSchedulingStore.getState().proposal?.proposalId).toBe('new-user')
  })

  it('shows the existing proposal when a new edit conflicts', async () => {
    vi.spyOn(service, 'recomputeScheduleProposal').mockRejectedValue(
      new service.SchedulingApiError('Resolve the existing edit', 409, proposal('existing')),
    )
    await expect(useSchedulingStore.getState().recompute()).rejects.toThrow(
      'Resolve the existing edit',
    )
    expect(useSchedulingStore.getState()).toMatchObject({
      proposal: { proposalId: 'existing' },
      error: 'Resolve the existing edit',
      isLoading: false,
    })
  })
})
