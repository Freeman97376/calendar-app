import { create } from 'zustand'

import type { BackendConfigStatus, BackendConfigUpdate, RuntimeConfig } from '../domain/types'
import { createAIService, modelForProvider } from '../services/ai/aiServiceFactory'
import {
  BackendConfigApiService,
  RuntimeConfigService,
} from '../services/config/runtimeConfigService'
import { createDefaultFridgeService } from '../services/fridge/defaultFridgeService'
import { configureAIService } from './aiStore'
import { configureFridgeService } from './fridgeStore'

export type ConfigStore = {
  backendStatus: BackendConfigStatus | null
  config: RuntimeConfig
  error: string | null
  isLoadingBackend: boolean
  loadBackendStatus: () => Promise<BackendConfigStatus>
  reset: () => void
  saveBackendConfig: (update: BackendConfigUpdate) => Promise<BackendConfigStatus>
  saveRuntimeConfig: (config: RuntimeConfig) => RuntimeConfig
}

let runtimeConfigService = new RuntimeConfigService()
const initialConfig = runtimeConfigService.getConfig()
let currentConfig = initialConfig
let backendConfigApi: BackendConfigApiService = new BackendConfigApiService(
  (): string => currentConfig.fridgeApiBaseUrl,
)

function applyDocumentLanguage(config: RuntimeConfig) {
  if (typeof document === 'undefined') return

  document.documentElement.lang = config.language === 'zh' ? 'zh-CN' : 'en'
}

function applyRuntimeConfig(config: RuntimeConfig) {
  applyDocumentLanguage(config)
  configureAIService(createAIService(config), {
    model: modelForProvider(config.aiProvider, config),
    provider: config.aiProvider,
  })
  configureFridgeService(createDefaultFridgeService(config))
}

export function initializeRuntimeConfig() {
  const config = runtimeConfigService.getConfig()
  currentConfig = config
  useConfigStore.setState({ config, error: null })
  applyRuntimeConfig(config)
  return config
}

export function configureConfigServices(
  runtimeService: RuntimeConfigService,
  backendService?: BackendConfigApiService,
) {
  runtimeConfigService = runtimeService
  backendConfigApi =
    backendService ?? new BackendConfigApiService((): string => currentConfig.fridgeApiBaseUrl)
}

export const useConfigStore = create<ConfigStore>((set) => ({
  backendStatus: null,
  config: initialConfig,
  error: null,
  isLoadingBackend: false,
  loadBackendStatus: async () => {
    set({ error: null, isLoadingBackend: true })
    try {
      const backendStatus = await backendConfigApi.getStatus()
      set({ backendStatus, isLoadingBackend: false })
      return backendStatus
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load backend config'
      set({ error: message, isLoadingBackend: false })
      throw error
    }
  },
  reset: () => {
    const config = runtimeConfigService.getConfig()
    currentConfig = config
    set({
      backendStatus: null,
      config,
      error: null,
      isLoadingBackend: false,
    })
    applyRuntimeConfig(config)
  },
  saveBackendConfig: async (update) => {
    set({ error: null, isLoadingBackend: true })
    try {
      const backendStatus = await backendConfigApi.updateConfig(update)
      set({ backendStatus, isLoadingBackend: false })
      return backendStatus
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save backend config'
      set({ error: message, isLoadingBackend: false })
      throw error
    }
  },
  saveRuntimeConfig: (config) => {
    const saved = runtimeConfigService.saveConfig(config)
    currentConfig = saved
    set({ config: saved, error: null })
    applyRuntimeConfig(saved)
    return saved
  },
}))

applyRuntimeConfig(initialConfig)
