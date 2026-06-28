import { useMemo, useState } from 'react'

import { calculateProjectProgress } from '../domain/logic/progress'
import type { TodoLongProject } from '../domain/types'
import type {
  ActionItemStatus,
  LongTermActionItem,
  LongTermMilestone,
  MilestoneStatus,
} from '../domain/types/longTermMemory'
import { useLongTermMemoryStore } from '../store/longTermMemoryStore'
import { toolMetadata } from './useMemoryBackedAIDemoTool'

const TODO_LONG_PROJECT_SOURCE = 'todo-long-project'

export function useTodoLongProjects() {
  const actions = useLongTermMemoryStore((state) => state.actions)
  const createAction = useLongTermMemoryStore((state) => state.createAction)
  const createGoal = useLongTermMemoryStore((state) => state.createGoal)
  const createMilestone = useLongTermMemoryStore((state) => state.createMilestone)
  const createProject = useLongTermMemoryStore((state) => state.createProject)
  const error = useLongTermMemoryStore((state) => state.error)
  const isDetailLoading = useLongTermMemoryStore((state) => state.isDetailLoading)
  const loadProjectDetails = useLongTermMemoryStore((state) => state.loadProjectDetails)
  const milestones = useLongTermMemoryStore((state) => state.milestones)
  const updateActionStatus = useLongTermMemoryStore((state) => state.updateActionStatus)
  const updateMilestoneStatus = useLongTermMemoryStore((state) => state.updateMilestoneStatus)
  const [activeProjectId, setActiveProjectId] = useState('')
  const progressSummary = useMemo(
    () => calculateProjectProgress(actions, milestones),
    [actions, milestones],
  )

  async function createLink(title: string, description?: string): Promise<TodoLongProject> {
    const metadata = toolMetadata('todo-long-project', TODO_LONG_PROJECT_SOURCE)
    const goal = await createGoal({
      description: description || `Long project linked from todo "${title}".`,
      metadata,
      title,
    })
    const project = await createProject({
      description: description || `Long project linked from todo "${title}".`,
      goal_id: goal.goal_id,
      metadata,
      title,
    })
    const milestone = await createMilestone({
      description: 'Define the first meaningful milestone and expected outcome.',
      metadata,
      project_id: project.project_id,
      status: 'in_progress',
      title: 'Plan milestones',
    })
    await createAction({
      description: 'Break this long project into visible milestones and next actions.',
      metadata,
      milestone_id: milestone.milestone_id,
      project_id: project.project_id,
      status: 'todo',
      title: 'Define first milestone',
    })
    setActiveProjectId(project.project_id)
    await loadProjectDetails(project.project_id)

    return {
      memoryGoalId: goal.goal_id,
      memoryProjectId: project.project_id,
      sourceToolId: TODO_LONG_PROJECT_SOURCE,
    }
  }

  async function load(link: TodoLongProject) {
    setActiveProjectId(link.memoryProjectId)
    await loadProjectDetails(link.memoryProjectId)
  }

  async function setActionStatus(action: LongTermActionItem, status: ActionItemStatus) {
    return updateActionStatus(action.action_id, status)
  }

  async function setMilestoneStatus(milestone: LongTermMilestone, status: MilestoneStatus) {
    return updateMilestoneStatus(milestone.milestone_id, status)
  }

  return {
    actions,
    activeProjectId,
    createLink,
    error,
    isDetailLoading,
    load,
    milestones,
    progressSummary,
    setActionStatus,
    setMilestoneStatus,
  }
}
