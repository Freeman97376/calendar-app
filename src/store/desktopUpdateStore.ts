import { create } from 'zustand'

import type {
  DesktopDistribution,
  DesktopUpdateInfo,
  DesktopUpdateStatus,
  PreUpdateBackup,
} from '../domain/types'
import {
  desktopUpdateClient,
  type DesktopUpdateClient,
} from '../services/desktopUpdateService'

type DesktopUpdateStore = {
  autoChecked: boolean
  backup: PreUpdateBackup | null
  check: (automatic?: boolean) => Promise<void>
  currentVersion: string
  dismissError: () => void
  distribution: DesktopDistribution | null
  downloadedBytes: number
  error: string | null
  install: () => Promise<void>
  openReleasePage: () => Promise<void>
  reset: () => void
  status: DesktopUpdateStatus
  totalBytes?: number
  update: DesktopUpdateInfo | null
}

let client: DesktopUpdateClient = desktopUpdateClient

const initialState = {
  autoChecked: false,
  backup: null,
  currentVersion: '',
  distribution: null,
  downloadedBytes: 0,
  error: null,
  status: 'unsupported' as DesktopUpdateStatus,
  totalBytes: undefined as number | undefined,
  update: null,
}

export function configureDesktopUpdateClient(nextClient: DesktopUpdateClient) {
  client = nextClient
}

export const useDesktopUpdateStore = create<DesktopUpdateStore>((set, get) => ({
  ...initialState,
  check: async (automatic = false) => {
    if (automatic && get().autoChecked) return
    if (get().status === 'checking' || get().status === 'downloading' || get().status === 'installing') return
    set({
      autoChecked: get().autoChecked || automatic,
      error: null,
      status: 'checking',
    })
    try {
      const result = await client.check()
      if (!result) {
        set({ ...initialState, autoChecked: get().autoChecked })
        return
      }
      set({
        currentVersion: result.currentVersion,
        distribution: result.distribution,
        status: result.update ? 'available' : 'upToDate',
        update: result.update,
      })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unable to check for updates.',
        status: 'error',
      })
    }
  },
  dismissError: () => set({ error: null, status: 'idle' }),
  install: async () => {
    if (get().distribution === 'portable') {
      await get().openReleasePage()
      return
    }
    set({ backup: null, downloadedBytes: 0, error: null, status: 'downloading', totalBytes: undefined })
    try {
      const backup = await client.install(({ downloadedBytes, totalBytes }) => {
        set({ downloadedBytes, status: 'downloading', totalBytes })
      })
      set({ backup, status: 'installing' })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unable to install the update.',
        status: 'error',
      })
    }
  },
  openReleasePage: () => client.openReleasePage(),
  reset: () => set(initialState),
}))
