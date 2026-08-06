export type DesktopDistribution = 'installed' | 'portable'

export type DesktopUpdateStatus =
  | 'unsupported'
  | 'idle'
  | 'checking'
  | 'upToDate'
  | 'available'
  | 'downloading'
  | 'installing'
  | 'error'

export type DesktopUpdateInfo = {
  currentVersion: string
  version: string
  date?: string
  notes?: string
}

export type DesktopUpdateProgress = {
  downloadedBytes: number
  totalBytes?: number
}

export type PreUpdateBackup = {
  checksum: string
  createdAt: string
  fileName: string
  fromVersion: string
  sizeBytes: number
  toVersion: string
}
