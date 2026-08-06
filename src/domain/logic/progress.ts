import type { LongTermActionItem, LongTermMilestone } from '../types/longTermMemory'

export type ProgressSummary = {
  completed: number
  percent: number
  source: 'actions' | 'milestones' | 'empty'
  total: number
}

function progressFromStatuses(statuses: string[]): Omit<ProgressSummary, 'source'> {
  const counted = statuses.filter((status) => status !== 'skipped')
  const completed = counted.filter((status) => status === 'done').length
  const total = counted.length

  return {
    completed,
    percent: total ? Math.round((completed / total) * 100) : 0,
    total,
  }
}

export function calculateProjectProgress(
  actions: LongTermActionItem[],
  milestones: LongTermMilestone[],
): ProgressSummary {
  if (actions.length) {
    return {
      ...progressFromStatuses(actions.map((action) => action.status)),
      source: 'actions',
    }
  }

  if (milestones.length) {
    return {
      ...progressFromStatuses(milestones.map((milestone) => milestone.status)),
      source: 'milestones',
    }
  }

  return {
    completed: 0,
    percent: 0,
    source: 'empty',
    total: 0,
  }
}
