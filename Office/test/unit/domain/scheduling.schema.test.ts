import { describe, expect, it } from 'vitest'

import {
  ScheduleProposalSchema,
  SchedulingPreferencesSchema,
} from '../../../../src/domain/schemas/scheduling.schema'

describe('global scheduling schemas', () => {
  it('accepts multiple work windows and deterministic block bounds', () => {
    const value = SchedulingPreferencesSchema.parse({
      setupCompleted: true,
      workWindows: [
        { day: 'mon', start: '09:00', end: '12:00' },
        { day: 'mon', start: '14:00', end: '18:00' },
      ],
      minBlockMinutes: 30,
      maxBlockMinutes: 120,
    })
    expect(value.workWindows).toHaveLength(2)
  })

  it('rejects reversed work windows', () => {
    expect(
      SchedulingPreferencesSchema.safeParse({
        setupCompleted: true,
        workWindows: [{ day: 'tue', start: '12:00', end: '09:00' }],
      }).success,
    ).toBe(false)
  })

  it('parses a pending proposal with action provenance and no auto apply', () => {
    const proposal = ScheduleProposalSchema.parse({
      proposalId: 'schedule-1',
      status: 'pending',
      inputFingerprint: 'a'.repeat(64),
      proposal: {
        kind: 'global_schedule',
        reason: 'test',
        message: '待确认',
        changes: [
          {
            operation: 'create',
            eventId: 'event-1',
            projectId: 'project-1',
            actionId: 'action-1',
            event: { title: 'Action' },
          },
        ],
        autoApply: false,
      },
      createdAt: '2026-08-29T00:00:00Z',
      updatedAt: '2026-08-29T00:00:00Z',
    })
    expect(proposal.proposal.changes[0]).toMatchObject({
      projectId: 'project-1',
      actionId: 'action-1',
    })
  })
})
