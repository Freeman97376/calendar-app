import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PreUpdateBackup } from '../../../src/domain/types'
import {
  desktopUpdateClient,
  type DesktopUpdateClient,
} from '../../../src/services/desktopUpdateService'
import {
  configureDesktopUpdateClient,
  useDesktopUpdateStore,
} from '../../../src/store/desktopUpdateStore'

const availableUpdate = {
  currentVersion: '0.2.0',
  version: '0.2.1',
  date: '2026-07-16T12:00:00Z',
  notes: 'Local-first updater test.',
}

const backup: PreUpdateBackup = {
  checksum: 'abc123',
  createdAt: '2026-07-16T12:00:00Z',
  fileName: 'pre-update-0.2.0-to-0.2.1.sqlite3',
  fromVersion: '0.2.0',
  sizeBytes: 1024,
  toVersion: '0.2.1',
}

function fakeClient(overrides: Partial<DesktopUpdateClient> = {}): DesktopUpdateClient {
  return {
    check: vi.fn(async () => null),
    install: vi.fn(async () => backup),
    openReleasePage: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('desktop update store', () => {
  beforeEach(() => {
    useDesktopUpdateStore.getState().reset()
  })

  afterEach(() => {
    configureDesktopUpdateClient(desktopUpdateClient)
  })

  it('reports an available installed update and records download progress', async () => {
    const install = vi.fn(async (onProgress: Parameters<DesktopUpdateClient['install']>[0]) => {
      onProgress({ downloadedBytes: 50, totalBytes: 100 })
      return backup
    })
    configureDesktopUpdateClient(
      fakeClient({
        check: vi.fn(async () => ({
          currentVersion: '0.2.0',
          distribution: 'installed' as const,
          update: availableUpdate,
        })),
        install,
      }),
    )

    await useDesktopUpdateStore.getState().check()
    expect(useDesktopUpdateStore.getState()).toMatchObject({
      currentVersion: '0.2.0',
      distribution: 'installed',
      status: 'available',
      update: availableUpdate,
    })

    await useDesktopUpdateStore.getState().install()
    expect(install).toHaveBeenCalledOnce()
    expect(useDesktopUpdateStore.getState()).toMatchObject({
      backup,
      downloadedBytes: 50,
      status: 'installing',
      totalBytes: 100,
    })
  })

  it('opens the release page instead of installing in a portable build', async () => {
    const install = vi.fn(async () => backup)
    const openReleasePage = vi.fn(async () => undefined)
    configureDesktopUpdateClient(
      fakeClient({
        check: vi.fn(async () => ({
          currentVersion: '0.2.0',
          distribution: 'portable' as const,
          update: availableUpdate,
        })),
        install,
        openReleasePage,
      }),
    )

    await useDesktopUpdateStore.getState().check()
    await useDesktopUpdateStore.getState().install()

    expect(openReleasePage).toHaveBeenCalledOnce()
    expect(install).not.toHaveBeenCalled()
  })

  it('auto-checks only once and leaves browser builds unsupported', async () => {
    const check = vi.fn(async () => null)
    configureDesktopUpdateClient(fakeClient({ check }))

    await useDesktopUpdateStore.getState().check(true)
    await useDesktopUpdateStore.getState().check(true)

    expect(check).toHaveBeenCalledOnce()
    expect(useDesktopUpdateStore.getState()).toMatchObject({
      autoChecked: true,
      status: 'unsupported',
    })
  })
})
