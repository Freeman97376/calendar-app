import { create } from 'zustand'

import { RuntimeConfigSchema } from '../domain/schemas/config.schema'
import type { BackendConfigStatus, BackendConfigUpdate, RuntimeConfig } from '../domain/types'
import { apiBaseUrl, authenticatedFetch, savePreferences } from '../services/appApiClient'
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
// Both server and desktop builds route model requests through the Calendar API.
// Starting in proxy mode also prevents a stale browser config from briefly
// sending chat requests directly to DeepSeek before bootstrap completes.
let serverManagedAI = true
let persistPreferences = false
let authoritativePreferences = false
// Configuration is served by the Calendar backend, whose address is injected at
// runtime by the Tauri sidecar. It must not follow the separately editable
// fridge URL or a packaged app will send /api/config to its own HTML origin.
let backendConfigApi: BackendConfigApiService = new BackendConfigApiService(apiBaseUrl)

function applyDocumentLanguage(config: RuntimeConfig) {
  if (typeof document === 'undefined') return

  document.documentElement.lang = config.language === 'zh' ? 'zh-CN' : 'en'
}

function applyRuntimeConfig(config: RuntimeConfig) {
  applyDocumentLanguage(config)
  const aiConfig = serverManagedAI
    ? {
        ...config,
        aiApiBaseUrl: `${apiBaseUrl()}/api/ai`,
        aiApiKey: 'server-managed',
        aiProvider: 'api' as const,
      }
    : config
  configureAIService(createAIService(aiConfig, { fetcher: authenticatedFetch }), {
    model: modelForProvider(aiConfig.aiProvider, aiConfig),
    provider: aiConfig.aiProvider,
  })
  configureFridgeService(
    authoritativePreferences
      ? createDefaultFridgeService({ ...config, fridgeApiBaseUrl: apiBaseUrl() })
      : createDefaultFridgeService(config),
  )
}

export function configureRuntimeEnvironment(options: {
  authoritativePreferences?: boolean
  persistPreferences?: boolean
  serverManagedAI?: boolean
}) {
  authoritativePreferences = options.authoritativePreferences ?? authoritativePreferences
  persistPreferences = options.persistPreferences ?? persistPreferences
  serverManagedAI = options.serverManagedAI ?? serverManagedAI
  applyRuntimeConfig(currentConfig)
}

export function initializeRuntimeConfig(preferences: Partial<RuntimeConfig> = {}) {
  const base = authoritativePreferences
    ? runtimeConfigService.getDefaults()
    : runtimeConfigService.getConfig()
  const config = RuntimeConfigSchema.parse({ ...base, ...preferences })
  currentConfig = config
  useConfigStore.setState({ config, error: null })
  applyRuntimeConfig(config)
  return config
}

export function setPreAuthLanguage(language: RuntimeConfig['language']) {
  const config = runtimeConfigService.saveConfig({ ...currentConfig, language })
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
  backendConfigApi = backendService ?? new BackendConfigApiService(apiBaseUrl)
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
    const saved = persistPreferences
      ? RuntimeConfigSchema.parse(config)
      : runtimeConfigService.saveConfig(config)
    currentConfig = saved
    set({ config: saved, error: null })
    applyRuntimeConfig(saved)
    if (persistPreferences) {
      void savePreferences(saved).catch((error) => {
        const message = error instanceof Error ? error.message : 'Unable to save preferences'
        useConfigStore.setState({ error: message })
      })
    }
    return saved
  },
}))

applyRuntimeConfig(initialConfig)
