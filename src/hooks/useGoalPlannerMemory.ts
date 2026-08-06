import { useEffect, useMemo } from 'react'

import {
  buildToolRoadmap,
  implementationPathFromText,
  implementationPathToText,
} from '../domain/logic/toolRoadmap'
import { useLongTermMemoryStore } from '../store/longTermMemoryStore'

export function useGoalPlannerMemory() {
  const actions = useLongTermMemoryStore((state) => state.actions)
  const createAction = useLongTermMemoryStore((state) => state.createAction)
  const createGoal = useLongTermMemoryStore((state) => state.createGoal)
  const createMilestone = useLongTermMemoryStore((state) => state.createMilestone)
  const createProgress = useLongTermMemoryStore((state) => state.createProgress)
  const createProject = useLongTermMemoryStore((state) => state.createProject)
  const error = useLongTermMemoryStore((state) => state.error)
  const goals = useLongTermMemoryStore((state) => state.goals)
  const isDetailLoading = useLongTermMemoryStore((state) => state.isDetailLoading)
  const isLoading = useLongTermMemoryStore((state) => state.isLoading)
  const loadOverview = useLongTermMemoryStore((state) => state.loadOverview)
  const loadProjectDetails = useLongTermMemoryStore((state) => state.loadProjectDetails)
  const milestones = useLongTermMemoryStore((state) => state.milestones)
  const progress = useLongTermMemoryStore((state) => state.progress)
  const projects = useLongTermMemoryStore((state) => state.projects)
  const selectGoal = useLongTermMemoryStore((state) => state.selectGoal)
  const selectProject = useLongTermMemoryStore((state) => state.selectProject)
  const selectedGoalId = useLongTermMemoryStore((state) => state.selectedGoalId)
  const selectedProjectId = useLongTermMemoryStore((state) => state.selectedProjectId)
  const toolRuns = useLongTermMemoryStore((state) => state.toolRuns)
  const updateActionStatus = useLongTermMemoryStore((state) => state.updateActionStatus)
  const updateGoalStatus = useLongTermMemoryStore((state) => state.updateGoalStatus)
  const updateMilestoneStatus = useLongTermMemoryStore((state) => state.updateMilestoneStatus)
  const updateProject = useLongTermMemoryStore((state) => state.updateProject)
  const updateProjectStatus = useLongTermMemoryStore((state) => state.updateProjectStatus)
  const selectedGoal = goals.find((goal) => goal.goal_id === selectedGoalId) ?? null
  const goalProjects = projects.filter((project) => project.goal_id === selectedGoalId)
  const selectedProject =
    goalProjects.find((project) => project.project_id === selectedProjectId) ?? null
  const selectedRoadmap = useMemo(
    () =>
      selectedProject
        ? buildToolRoadmap(selectedGoal, selectedProject, milestones, actions, progress, toolRuns)
        : null,
    [actions, milestones, progress, selectedGoal, selectedProject, toolRuns],
  )
  const selectedRoadmapPathText = useMemo(
    () => (selectedRoadmap ? implementationPathToText(selectedRoadmap.steps) : ''),
    [selectedRoadmap],
  )

  useEffect(() => {
    loadOverview().catch(() => undefined)
  }, [loadOverview])

  useEffect(() => {
    loadProjectDetails(selectedProjectId).catch(() => undefined)
  }, [loadProjectDetails, selectedProjectId])

  async function saveSelectedImplementationPath(pathText: string) {
    if (!selectedProject) return null

    return updateProject(selectedProject.project_id, {
      metadata: {
        ...selectedProject.metadata,
        implementationPath: implementationPathFromText(pathText),
        roadmapFormatVersion: 1,
      },
    })
  }

  return {
    actions,
    createAction,
    createGoal,
    createMilestone,
    createProgress,
    createProject,
    error,
    goalProjects,
    goals,
    isDetailLoading,
    isLoading,
    milestones,
    progress,
    projects,
    selectGoal,
    selectProject,
    selectedGoal,
    selectedGoalId,
    selectedProject,
    selectedProjectId,
    selectedRoadmap,
    selectedRoadmapPathText,
    saveSelectedImplementationPath,
    toolRuns,
    updateActionStatus,
    updateGoalStatus,
    updateMilestoneStatus,
    updateProject,
    updateProjectStatus,
  }
}
