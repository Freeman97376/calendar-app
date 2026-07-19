import type {
  ActionItemStatus,
  ImplementationPathStep,
  LongTermProgressLog,
  LongTermToolRun,
  MilestoneStatus,
} from './longTermMemory'

export type ToolRoadmapSource = 'metadata' | 'milestones' | 'actions' | 'summary'

export type ToolRoadmapProgressSummary = {
  completed: number
  percent: number
  source: 'actions' | 'milestones' | 'empty'
  total: number
}

export type ToolRoadmapStep = ImplementationPathStep & {
  actionCount: number
  completedActionCount: number
  dueDate: string | null
  status: ActionItemStatus | MilestoneStatus | 'not_started'
}

export type ToolRoadmapViewModel = {
  goalSummary: string
  goalTitle: string
  pathSource: ToolRoadmapSource
  progressSummary: ToolRoadmapProgressSummary
  projectSummary: string
  projectTitle: string
  recentProgress: LongTermProgressLog[]
  recentToolRuns: LongTermToolRun[]
  steps: ToolRoadmapStep[]
}
