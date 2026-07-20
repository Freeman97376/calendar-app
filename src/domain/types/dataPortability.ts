export type CalendarBackup = {
  checksum: string
  entities: Record<string, unknown>
  exportedAt: string
  formatVersion: number
}

export type ImportConflictChoice = 'local' | 'backup'

export type ImportEntityCounts = {
  conflicts: number
  new: number
  unchanged: number
  updated: number
}

export type ImportConflict = {
  backupUpdatedAt: string | null
  entity: string
  id: string
  key: string
  label: string
  localUpdatedAt: string | null
}

export type ImportPreview = {
  backupChecksum: string
  canImport: boolean
  conflicts: ImportConflict[]
  counts: Record<string, ImportEntityCounts>
  currentChecksum: string
  formatVersion: number
  ignoredItems: Array<{ entity: string; id: string; reason: string }>
  relationshipErrors: string[]
}

export type ImportReport = {
  counts: Record<string, number>
  ignoredPreferenceKeys: string[]
  mode: 'merge' | 'replace'
  preview?: {
    backupChecksum: string
    counts: Record<string, ImportEntityCounts>
    currentChecksum: string
  }
  replayed: boolean
  skipped: boolean
}
