import { useState } from 'react'

import type { CalendarBackup } from '../domain/types/dataPortability'
import type { ImportConflictChoice } from '../domain/types/dataPortability'
import { refreshAuthenticatedAccountData, useAuthStore } from '../store/authStore'
import { initializeRuntimeConfig } from '../store/configStore'
import { useDataPortabilityStore } from '../store/dataPortabilityStore'

function downloadBackup(backup: CalendarBackup, prefix = 'calendar-backup') {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${prefix}-${backup.exportedAt.slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function useDataPortability() {
  const createDesktopSafetyBackup = useDataPortabilityStore(
    (state) => state.createDesktopSafetyBackup,
  )
  const parseBackup = useDataPortabilityStore((state) => state.parseBackup)
  const storeError = useDataPortabilityStore((state) => state.error)
  const isBusy = useDataPortabilityStore((state) => state.isBusy)
  const preview = useDataPortabilityStore((state) => state.preview)
  const report = useDataPortabilityStore((state) => state.report)
  const status = useDataPortabilityStore((state) => state.status)
  const exportFromStore = useDataPortabilityStore((state) => state.exportBackup)
  const exportLegacyFromStore = useDataPortabilityStore((state) => state.exportLegacy)
  const previewFromStore = useDataPortabilityStore((state) => state.previewBackup)
  const importToStore = useDataPortabilityStore((state) => state.importBackup)
  const appMode = useAuthStore((state) => state.mode)
  const [pendingBackup, setPendingBackup] = useState<CalendarBackup | null>(null)
  const [pendingMode, setPendingMode] = useState<'merge' | 'replace' | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [safetyBackup, setSafetyBackup] = useState<string | null>(null)

  async function exportBackup() {
    const backup = await exportFromStore()
    downloadBackup(backup)
  }

  async function previewBackup(file: File, mode: 'merge' | 'replace') {
    setLocalError(null)
    setSafetyBackup(null)
    try {
      const backup = parseBackup(JSON.parse(await file.text()))
      const result = await previewFromStore(backup, mode)
      setPendingBackup(backup)
      setPendingMode(mode)
      return result
    } catch (error) {
      setPendingBackup(null)
      setPendingMode(null)
      setLocalError(error instanceof Error ? error.message : 'Unable to read the selected backup.')
      throw error
    }
  }

  async function executeImport(
    choices: Record<string, ImportConflictChoice>,
    confirmReplace: () => boolean,
  ) {
    if (!pendingBackup || !pendingMode || !preview)
      throw new Error('Preview the backup before importing it.')
    setLocalError(null)
    try {
      if (pendingMode === 'replace') {
        if (appMode === 'desktop') {
          const snapshot = await createDesktopSafetyBackup()
          setSafetyBackup(`${snapshot.fileName} (${snapshot.checksum.slice(0, 12)}...)`)
        } else {
          const current = await exportFromStore()
          downloadBackup(current, 'calendar-before-restore')
          setSafetyBackup(current.checksum)
        }
        if (!confirmReplace()) return null
      }
      const result = await importToStore(pendingBackup, pendingMode, preview, choices)
      const bootstrap = await refreshAuthenticatedAccountData()
      initializeRuntimeConfig(bootstrap.preferences)
      setPendingBackup(null)
      setPendingMode(null)
      return result
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Unable to import backup.')
      throw error
    }
  }

  async function exportLegacy() {
    const backup = await exportLegacyFromStore()
    downloadBackup(backup, 'calendar-legacy-browser')
  }

  return {
    error: localError ?? storeError,
    executeImport,
    exportBackup,
    exportLegacy,
    isBusy,
    pendingMode,
    preview,
    previewBackup,
    report,
    safetyBackup,
    status,
  }
}
