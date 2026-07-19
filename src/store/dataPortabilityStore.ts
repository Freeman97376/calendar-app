import { create } from 'zustand'

import {
  exportCalendarBackup,
  importCalendarBackup,
} from '../services/dataPortabilityClient'
import type { CalendarBackup } from '../domain/types/dataPortability'
import { exportLegacyBrowserData } from '../services/legacyBrowserExport'

type DataPortabilityStore = {
  error: string | null
  isBusy: boolean
  status: string | null
  exportBackup: () => Promise<CalendarBackup>
  exportLegacy: () => Promise<CalendarBackup>
  importBackup: (backup: CalendarBackup, mode: 'merge' | 'replace') => Promise<Record<string, unknown>>
  reset: () => void
}

export const useDataPortabilityStore = create<DataPortabilityStore>((set) => ({
  error: null,
  isBusy: false,
  status: null,
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
      const message = error instanceof Error ? error.message : 'Unable to export legacy browser data.'
      set({ error: message, isBusy: false })
      throw error
    }
  },
  importBackup: async (backup, mode) => {
    set({ error: null, isBusy: true })
    try {
      const report = await importCalendarBackup(backup, mode)
      set({ isBusy: false, status: `Import complete / 导入完成: ${JSON.stringify(report)}` })
      return report
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to import backup.'
      set({ error: message, isBusy: false })
      throw error
    }
  },
  reset: () => set({ error: null, isBusy: false, status: null }),
}))
