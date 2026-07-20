import { useCallback, useEffect, useState } from 'react'

import type { QuestionBatchItem } from '../domain/types/goalControl'
import { goalControlGateway } from '../store/goalControlStore'
import { useUIStore } from '../store/uiStore'

export type PendingCheckIn = {
  check_in_id: string
  project_id: string
  project_title?: string
  includes_review?: boolean
  questions: QuestionBatchItem[]
}

export function useCheckInInbox() {
  const [items, setItems] = useState<PendingCheckIn[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const openEnabledTools = useUIStore((state) => state.openEnabledToolsPanel)
  const load = useCallback(async () => {
    try {
      await goalControlGateway.ensureCheckIns()
      const pending = (await goalControlGateway.pendingCheckIns()) as PendingCheckIn[]
      setItems(pending)
      await goalControlGateway.notifyPendingGoalCheckIns(pending)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    const refresh = () => {
      void load()
    }
    window.addEventListener('calendar:session-restored', refresh)
    return () => window.removeEventListener('calendar:session-restored', refresh)
  }, [load])
  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try {
      await action()
      await load()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError))
    } finally {
      setBusy(false)
    }
  }
  async function answer(checkInId: string, answers: Record<string, unknown>) {
    await run(() => goalControlGateway.answerCheckIn(checkInId, answers))
  }
  async function skip(checkInId: string) {
    await run(() => goalControlGateway.skipCheckIn(checkInId))
  }
  return { answer, busy, error, items, openEnabledTools, skip }
}
