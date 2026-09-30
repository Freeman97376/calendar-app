import { useEffect, useMemo, useState } from 'react'

import { activeToolsFromProjects } from '../domain/logic/enabledTools'
import { useAIStore } from '../store/aiStore'
import { useConfigStore } from '../store/configStore'
import { useLongTermMemoryStore } from '../store/longTermMemoryStore'

export function useAIAssistantToolContext() {
  const aiRuntime = useConfigStore((state) => state.aiRuntime)
  const goals = useLongTermMemoryStore((state) => state.goals)
  const projects = useLongTermMemoryStore((state) => state.projects)
  const loadOverview = useLongTermMemoryStore((state) => state.loadOverview)
  const selectedProjectId = useAIStore((state) => state.selectedEnabledToolProjectId)
  const selectProject = useAIStore((state) => state.setSelectedEnabledToolProjectId)
  const [overviewLoaded, setOverviewLoaded] = useState(false)
  const activeTools = useMemo(() => activeToolsFromProjects(projects, goals), [goals, projects])

  useEffect(() => {
    let active = true
    void loadOverview()
      .then(() => {
        if (active) setOverviewLoaded(true)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [loadOverview])

  useEffect(() => {
    if (
      overviewLoaded &&
      selectedProjectId &&
      !activeTools.some((tool) => tool.projectId === selectedProjectId)
    ) {
      selectProject(null)
    }
  }, [activeTools, overviewLoaded, selectProject, selectedProjectId])

  return {
    activeTools,
    aiRuntime,
    selectProject,
    selectedProjectId,
  }
}
