import { useEffect } from 'react'

import type { GoalControlDashboard } from '../domain/types/goalControl'
import { goalControlGateway } from '../store/goalControlStore'

export function useActiveToolWorkspaceTracking(dashboard: GoalControlDashboard) {
  const projectId = dashboard.project.project_id

  useEffect(() => {
    const metadata =
      dashboard.project.metadata &&
      typeof dashboard.project.metadata === 'object' &&
      !Array.isArray(dashboard.project.metadata)
        ? (dashboard.project.metadata as Record<string, unknown>)
        : {}
    const journeyId = String(metadata.activationJourneyId ?? '')
    const templateId = String(metadata.templateId ?? metadata.parentTemplateId ?? '')
    const source = String(metadata.activationSource ?? '')
    const thread = dashboard.threads.find((item) => item.project_id === projectId)
    if (
      journeyId &&
      templateId &&
      thread &&
      (source === 'ai-assistant' || source === 'template-library')
    ) {
      void goalControlGateway
        .recordFunnelEvent({
          eventName: 'active_tool_workspace_opened',
          journeyId,
          projectId,
          source,
          templateId,
          threadId: thread.thread_id,
        })
        .catch(() => undefined)
    }
  }, [dashboard.project, dashboard.threads, projectId])
}
