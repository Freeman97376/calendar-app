import { configureApiRuntime } from './appApiClient'

import type { DesktopDistribution } from '../domain/types'

export type DesktopRuntime = {
  appVersion: string
  baseUrl: string
  distribution: DesktopDistribution
  launchToken: string
  warning: string | null
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))
let configuredRuntime: DesktopRuntime | null = null

export function desktopRuntimeInfo(): DesktopRuntime | null {
  return configuredRuntime
}

export async function configureDesktopRuntime(): Promise<string | null> {
  if (!window.__TAURI_INTERNALS__) return null
  const { invoke } = await import('@tauri-apps/api/core')
  const runtime = await invoke<DesktopRuntime>('desktop_runtime')
  configuredRuntime = runtime
  configureApiRuntime({ baseUrl: runtime.baseUrl, desktopToken: runtime.launchToken })

  let lastError: unknown = null
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${runtime.baseUrl}/api/health`, {
        headers: { 'X-Desktop-Token': runtime.launchToken },
      })
      if (response.ok) return runtime.warning
    } catch (error) {
      lastError = error
    }
    await wait(100)
  }
  throw new Error(
    lastError instanceof Error
      ? `Desktop backend did not start: ${lastError.message}`
      : 'Desktop backend did not start within 8 seconds.',
  )
}
