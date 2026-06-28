import { useEffect } from 'react'

import { useConfigStore } from '../store/configStore'

export function useSettings() {
  const backendStatus = useConfigStore((state) => state.backendStatus)
  const config = useConfigStore((state) => state.config)
  const error = useConfigStore((state) => state.error)
  const isLoadingBackend = useConfigStore((state) => state.isLoadingBackend)
  const loadBackendStatus = useConfigStore((state) => state.loadBackendStatus)
  const saveBackendConfig = useConfigStore((state) => state.saveBackendConfig)
  const saveRuntimeConfig = useConfigStore((state) => state.saveRuntimeConfig)

  useEffect(() => {
    loadBackendStatus().catch(() => undefined)
  }, [loadBackendStatus])

  return {
    backendStatus,
    config,
    error,
    isLoadingBackend,
    loadBackendStatus,
    saveBackendConfig,
    saveRuntimeConfig,
  }
}
