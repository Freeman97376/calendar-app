import type { Update } from '@tauri-apps/plugin-updater'

import type {
  DesktopDistribution,
  DesktopUpdateInfo,
  DesktopUpdateProgress,
  PreUpdateBackup,
} from '../domain/types'
import { apiUrl, authenticatedFetch } from './appApiClient'
import { desktopRuntimeInfo } from './desktopRuntime'

const RELEASE_PAGE_URL = 'https://github.com/Freeman97376/calendar-app/releases/latest'

export type DesktopUpdateCheck = {
  currentVersion: string
  distribution: DesktopDistribution
  update: DesktopUpdateInfo | null
}

export interface DesktopUpdateClient {
  check: () => Promise<DesktopUpdateCheck | null>
  install: (onProgress: (progress: DesktopUpdateProgress) => void) => Promise<PreUpdateBackup>
  openReleasePage: () => Promise<void>
}

let pendingUpdate: Update | null = null

async function errorMessage(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null
  return payload?.error?.message ?? `Update backup failed with status ${response.status}.`
}

async function createPreUpdateBackup(update: Update): Promise<PreUpdateBackup> {
  const response = await authenticatedFetch(apiUrl('/api/data/pre-update-backup'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fromVersion: update.currentVersion,
      toVersion: update.version,
    }),
  })
  if (!response.ok) throw new Error(await errorMessage(response))
  const payload = (await response.json()) as { backup?: PreUpdateBackup }
  if (!payload.backup) throw new Error('The desktop backend did not return update backup metadata.')
  return payload.backup
}

export const desktopUpdateClient: DesktopUpdateClient = {
  async check() {
    const runtime = desktopRuntimeInfo()
    if (!runtime) return null

    const previous = pendingUpdate
    pendingUpdate = null
    if (previous) await previous.close().catch(() => undefined)

    const { check } = await import('@tauri-apps/plugin-updater')
    const update = await check({ allowDowngrades: false, timeout: 30_000 })
    pendingUpdate = update
    return {
      currentVersion: runtime.appVersion,
      distribution: runtime.distribution,
      update: update
        ? {
            currentVersion: update.currentVersion,
            version: update.version,
            date: update.date,
            notes: update.body,
          }
        : null,
    }
  },

  async install(onProgress) {
    const runtime = desktopRuntimeInfo()
    if (!runtime || runtime.distribution !== 'installed') {
      throw new Error('Automatic installation is available only in the installed desktop app.')
    }
    const update = pendingUpdate
    if (!update) throw new Error('No checked update is waiting to be installed.')

    let downloadedBytes = 0
    let totalBytes: number | undefined
    await update.download((event) => {
      if (event.event === 'Started') totalBytes = event.data.contentLength
      if (event.event === 'Progress') downloadedBytes += event.data.chunkLength
      onProgress({ downloadedBytes, totalBytes })
    }, { timeout: 5 * 60_000 })

    const backup = await createPreUpdateBackup(update)
    await update.install()
    const { relaunch } = await import('@tauri-apps/plugin-process')
    await relaunch()
    return backup
  },

  async openReleasePage() {
    const runtime = desktopRuntimeInfo()
    if (!runtime) {
      window.open(RELEASE_PAGE_URL, '_blank', 'noopener,noreferrer')
      return
    }
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('open_release_page')
  },
}
