import type { CalendarBackup } from '../domain/types/dataPortability'
import { useDataPortabilityStore } from '../store/dataPortabilityStore'

export function useDataPortability() {
  const error = useDataPortabilityStore((state) => state.error)
  const isBusy = useDataPortabilityStore((state) => state.isBusy)
  const status = useDataPortabilityStore((state) => state.status)
  const exportFromStore = useDataPortabilityStore((state) => state.exportBackup)
  const exportLegacyFromStore = useDataPortabilityStore((state) => state.exportLegacy)
  const importToStore = useDataPortabilityStore((state) => state.importBackup)

  async function exportBackup() {
    const backup = await exportFromStore()
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `calendar-backup-${backup.exportedAt.slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function importBackup(file: File, mode: 'merge' | 'replace') {
    const backup = JSON.parse(await file.text()) as CalendarBackup
    return importToStore(backup, mode)
  }

  async function exportLegacy() {
    const backup = await exportLegacyFromStore()
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `calendar-legacy-browser-${backup.exportedAt.slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return { error, exportBackup, exportLegacy, importBackup, isBusy, status }
}
