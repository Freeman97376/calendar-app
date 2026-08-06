import { describe, expect, it } from 'vitest'

import { calculateProjectProgress } from '../../../src/domain/logic/progress'
import type {
  LongTermActionItem,
  LongTermMilestone,
} from '../../../src/domain/types/longTermMemory'

function action(status: LongTermActionItem['status']): LongTermActionItem {
  return {
    action_id: `action-${status}`,
    created_at: '2026-06-18T00:00:00.000Z',
    description: '',
    due_date: null,
    metadata: {},
    milestone_id: null,
    project_id: 'project-1',
    status,
    title: status,
    updated_at: '2026-06-18T00:00:00.000Z',
  }
}

function milestone(status: LongTermMilestone['status']): LongTermMilestone {
  return {
    created_at: '2026-06-18T00:00:00.000Z',
    description: '',
    due_date: null,
    metadata: {},
    milestone_id: `milestone-${status}`,
    project_id: 'project-1',
    status,
    title: status,
    updated_at: '2026-06-18T00:00:00.000Z',
  }
}

describe('calculateProjectProgress', () => {
  it('uses actions before milestones and excludes skipped from the denominator', () => {
    expect(
      calculateProjectProgress(
        [action('done'), action('blocked'), action('skipped')],
        [milestone('done'), milestone('done')],
      ),
    ).toEqual({
      completed: 1,
      percent: 50,
      source: 'actions',
      total: 2,
    })
  })

  it('falls back to milestone progress when there are no actions', () => {
    expect(calculateProjectProgress([], [milestone('done'), milestone('in_progress')])).toEqual({
      completed: 1,
      percent: 50,
      source: 'milestones',
      total: 2,
    })
  })
})
