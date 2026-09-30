import { useEffect, useMemo, useState } from 'react'

import { SchedulingPreferencesSchema } from '../domain/schemas/scheduling.schema'
import type { SchedulingWindow } from '../domain/types'
import { useConfigStore } from '../store/configStore'
import { useSchedulingStore } from '../store/schedulingStore'

export function useSchedulingSettings() {
  const scheduling = useConfigStore((state) => state.config.scheduling)
  const saveSchedulingPreferences = useConfigStore((state) => state.saveSchedulingPreferences)
  const recompute = useSchedulingStore((state) => state.recompute)
  const [windows, setWindows] = useState<SchedulingWindow[]>(scheduling.workWindows)
  const [minBlockMinutes, setMinBlockMinutes] = useState(scheduling.minBlockMinutes)
  const [maxBlockMinutes, setMaxBlockMinutes] = useState(scheduling.maxBlockMinutes)
  const [status, setStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setWindows(scheduling.workWindows)
    setMinBlockMinutes(scheduling.minBlockMinutes)
    setMaxBlockMinutes(scheduling.maxBlockMinutes)
  }, [scheduling])

  const validation = useMemo(
    () =>
      SchedulingPreferencesSchema.safeParse({
        setupCompleted: true,
        workWindows: windows,
        minBlockMinutes,
        maxBlockMinutes,
      }),
    [maxBlockMinutes, minBlockMinutes, windows],
  )
  const validationMessage = validation.success
    ? null
    : (validation.error.issues[0]?.message ?? '请检查工作时段。')

  function addWindow(day: SchedulingWindow['day']) {
    setWindows((current) => [...current, { day, start: '09:00', end: '12:00' }])
  }

  function updateWindow(index: number, key: 'start' | 'end', value: string) {
    setWindows((current) =>
      current.map((window, position) =>
        position === index ? { ...window, [key]: value } : window,
      ),
    )
  }

  function removeWindow(index: number) {
    setWindows((current) => current.filter((_item, position) => position !== index))
  }

  async function save() {
    if (!validation.success) {
      setStatus(validationMessage)
      return
    }
    setSaving(true)
    setStatus(null)
    try {
      await saveSchedulingPreferences(validation.data)
      await recompute('work_windows_changed')
      setStatus('工作时段已保存，并已生成最新排程提案。')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '无法保存工作时段。')
    } finally {
      setSaving(false)
    }
  }

  return {
    addWindow,
    canSave: validation.success,
    maxBlockMinutes,
    minBlockMinutes,
    removeWindow,
    save,
    saving,
    setMaxBlockMinutes,
    setMinBlockMinutes,
    status,
    updateWindow,
    validationMessage,
    windows,
  }
}
