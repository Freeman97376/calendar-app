import { useCallback, useEffect, useState } from 'react'

import type { QuestionBatchItem } from '../domain/types/goalControl'
import { goalControlGateway } from '../store/goalControlStore'
import { useUIStore } from '../store/uiStore'

export type PendingCheckIn = { check_in_id: string; project_id: string; project_title?: string; includes_review?: boolean; questions: QuestionBatchItem[] }

export function useCheckInInbox() {
  const [items, setItems] = useState<PendingCheckIn[]>([])
  const [error, setError] = useState('')
  const openEnabledTools = useUIStore((state) => state.openEnabledToolsPanel)
  const load = useCallback(async () => {
    try { await goalControlGateway.ensureCheckIns(); const pending = await goalControlGateway.pendingCheckIns() as PendingCheckIn[]; setItems(pending); await goalControlGateway.notifyPendingGoalCheckIns(pending) }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : String(loadError)) }
  }, [])
  useEffect(() => { void load() }, [load])
  async function answer(checkInId: string, answers: Record<string, unknown>) { await goalControlGateway.answerCheckIn(checkInId, answers); await load() }
  return { answer, error, items, openEnabledTools }
}
