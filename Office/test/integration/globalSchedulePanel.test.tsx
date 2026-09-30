import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import GlobalSchedulePanel from '../../../src/components/tools/GlobalSchedulePanel'
import type { ScheduleProposal } from '../../../src/domain/types'
import { useEventStore } from '../../../src/store/eventStore'
import { server } from '../support/mocks/server'

function pendingProposal(): ScheduleProposal {
  return {
    proposalId: 'proposal-review-1',
    status: 'pending',
    inputFingerprint: 'a'.repeat(64),
    proposal: {
      kind: 'global_schedule',
      reason: 'manual',
      message: '安排核心行动并避开固定会议。',
      changes: [
        {
          operation: 'create',
          eventId: 'scheduled-event-1',
          projectId: 'project-1',
          actionId: 'action-1',
          event: {
            title: '实现核心逻辑',
            startAt: '2026-09-01T16:00:00Z',
            endAt: '2026-09-01T17:00:00Z',
          },
        },
      ],
      actionDateChanges: [],
      conflicts: [],
      toolImpacts: [
        {
          projectId: 'project-1',
          projectTitle: '接口重构',
          scheduledMinutes: 60,
          unscheduledCount: 0,
        },
      ],
      capacityBorrowing: [],
      unscheduled: [],
      timezone: 'UTC',
      autoApply: false,
    },
    createdAt: '2026-08-30T00:00:00Z',
    updatedAt: '2026-08-30T00:00:00Z',
    replayed: false,
  }
}

describe('Global Schedule Panel', () => {
  beforeEach(() => {
    useEventStore.getState().reset()
  })

  it.each([
    { button: '确认并写入日历', decision: 'accept', status: 'accepted' },
    { button: '拒绝提案', decision: 'reject', status: 'rejected' },
  ] as const)(
    'loads a pending proposal and submits $decision with its fingerprint',
    async (row) => {
      const pending = pendingProposal()
      let resolvedPath = ''
      let resolvedBody: Record<string, unknown> | null = null
      server.use(
        http.get('*/api/scheduling/proposals/current', () =>
          HttpResponse.json({ success: true, proposal: pending }),
        ),
        http.post('*/api/scheduling/proposals/:proposalId/resolve', async ({ params, request }) => {
          resolvedPath = String(params.proposalId)
          resolvedBody = (await request.json()) as Record<string, unknown>
          return HttpResponse.json({
            success: true,
            proposal: {
              ...pending,
              status: row.status,
              resolvedAt: '2026-08-30T00:01:00Z',
              updatedAt: '2026-08-30T00:01:00Z',
            },
          })
        }),
      )
      const user = userEvent.setup()
      render(<GlobalSchedulePanel />)

      expect(await screen.findByText('安排核心行动并避开固定会议。')).toBeInTheDocument()
      expect(screen.getByText('接口重构：60 分钟，0 个未排程行动')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: row.button }))

      await waitFor(() => expect(resolvedBody).not.toBeNull())
      expect(resolvedPath).toBe(pending.proposalId)
      expect(resolvedBody).toEqual({
        decision: row.decision,
        inputFingerprint: pending.inputFingerprint,
      })
    },
  )

  it('keeps the latest proposal and calendar unchanged when acceptance fails', async () => {
    const pending = pendingProposal()
    server.use(
      http.get('*/api/scheduling/proposals/current', () =>
        HttpResponse.json({ success: true, proposal: pending }),
      ),
      http.post('*/api/scheduling/proposals/:proposalId/resolve', () =>
        HttpResponse.json(
          {
            error: {
              code: 'schedule_proposal_stale',
              message: '排程已过期，请审核最新提案。',
              details: { latestProposal: pending },
            },
          },
          { status: 409 },
        ),
      ),
    )
    const user = userEvent.setup()
    render(<GlobalSchedulePanel />)

    await user.click(await screen.findByRole('button', { name: '确认并写入日历' }))

    expect(await screen.findByText('排程已过期，请审核最新提案。')).toBeInTheDocument()
    expect(screen.getByText('安排核心行动并避开固定会议。')).toBeInTheDocument()
    expect(useEventStore.getState().events).toEqual([])
  })
})
