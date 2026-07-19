import { useEffect, useState } from 'react'

import type { GoalControlDashboard } from '../domain/types/goalControl'
import { goalControlGateway } from '../store/goalControlStore'

export function useActiveToolSummaries(projectIds: string[]) {
  const key = JSON.stringify(projectIds)
  const [summaries, setSummaries] = useState<Record<string, GoalControlDashboard>>({})
  useEffect(() => {
    let active = true
    const ids = JSON.parse(key) as string[]
    void Promise.all(ids.map(async (projectId) => {
      try { return [projectId, await goalControlGateway.dashboard(projectId)] as const }
      catch { return null }
    })).then((values) => {
      if (active) setSummaries(Object.fromEntries(values.filter((value): value is readonly [string, GoalControlDashboard] => Boolean(value))))
    })
    return () => { active = false }
  }, [key])
  return summaries
}
