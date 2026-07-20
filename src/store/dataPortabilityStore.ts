import { create } from 'zustand'

import {
  createDesktopRestoreSnapshot,
  exportCalendarBackup,
  importCalendarBackup,
  parseCalendarBackup,
  previewCalendarBackup,
} from '../services/dataPortabilityClient'
import type {
  CalendarBackup,
  ImportConflictChoice,
  ImportPreview,
  ImportReport,
} from '../domain/types/dataPortability'
import { exportLegacyBrowserData } from '../services/legacyBrowserExport'
import { desktopRuntimeInfo } from '../services/desktopRuntime'

type DataPortabilityStore = {
  error: string | null
  isBusy: boolean
  preview: ImportPreview | null
  report: ImportReport | null
  status: string | null
  createDesktopSafetyBackup: () => Promise<{ checksum: string; fileName: string }>
  parseBackup: (input: unknown) => CalendarBackup
  exportBackup: () => Promise<CalendarBackup>
  exportLegacy: () => Promise<CalendarBackup>
  previewBackup: (backup: CalendarBackup, mode: 'merge' | 'replace') => Promise<ImportPreview>
  importBackup: (
    backup: CalendarBackup,
    mode: 'merge' | 'replace',
    preview: ImportPreview,
    choices: Record<string, ImportConflictChoice>,
  ) => Promise<ImportReport>
  reset: () => void
}

export const useDataPortabilityStore = create<DataPortabilityStore>((set) => ({
  error: null,
  isBusy: false,
  preview: null,
  report: null,
  status: null,
  createDesktopSafetyBackup: async () => {
    const runtime = desktopRuntimeInfo()
    if (!runtime) throw new Error('Desktop runtime details are unavailable.')
    return createDesktopRestoreSnapshot(runtime.appVersion)
  },
  parseBackup: parseCalendarBackup,
  exportBackup: async () => {
    set({ error: null, isBusy: true })
    try {
      const backup = await exportCalendarBackup()
      set({ isBusy: false, status: 'Backup exported. / 备份已导出。' })
      return backup
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to export backup.'
      set({ error: message, isBusy: false })
      throw error
    }
  },
  exportLegacy: async () => {
    set({ error: null, isBusy: true })
    try {
      const backup = await exportLegacyBrowserData()
      set({ isBusy: false, status: 'Legacy browser data exported. / 旧浏览器数据已导出。' })
      return backup
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to export legacy browser data.'
      set({ error: message, isBusy: false })
      throw error
    }
  },
  previewBackup: async (backup, mode) => {
    set({ error: null, isBusy: true, preview: null, report: null, status: null })
    try {
      const preview = await previewCalendarBackup(backup, mode)
      set({ isBusy: false, preview, status: 'Backup preview is ready.' })
      return preview
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to preview backup.'
      set({ error: message, isBusy: false })
      throw error
    }
  },
  importBackup: async (backup, mode, preview, choices) => {
    set({ error: null, isBusy: true, report: null })
    try {
      const report = await importCalendarBackup(backup, mode, preview, choices)
      set({ isBusy: false, preview: null, report, status: 'Import complete.' })
      return report
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to import backup.'
      set({ error: message, isBusy: false, status: null })
      throw error
    }
  },
  reset: () => set({ error: null, isBusy: false, preview: null, report: null, status: null }),
}))
