import { create } from 'zustand'

import { RuntimeConfigSchema } from '../domain/schemas/config.schema'
import type {
  AIRuntime,
  BackendConfigStatus,
  BackendConfigUpdate,
  RuntimeConfig,
  SchedulingPreferences,
} from '../domain/types'
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
  aiRuntime: AIRuntime
  backendStatus: BackendConfigStatus | null
  config: RuntimeConfig
  error: string | null
  isLoadingBackend: boolean
  loadBackendStatus: () => Promise<BackendConfigStatus>
  reset: () => void
  saveBackendConfig: (update: BackendConfigUpdate) => Promise<BackendConfigStatus>
  saveRuntimeConfig: (config: RuntimeConfig) => RuntimeConfig
  saveSchedulingPreferences: (scheduling: SchedulingPreferences) => Promise<RuntimeConfig>
}

let runtimeConfigService = new RuntimeConfigService()
const initialConfig = runtimeConfigService.getConfig()
let currentConfig = initialConfig
const defaultAIRuntime: AIRuntime = {
  editable: false,
  keyConfigured: false,
  mode: 'backend-managed',
  planningModel: 'deepseek-reasoner',
  provider: 'deepseek-compatible',
  routineModel: 'deepseek-chat',
  ruleBasedFallback: false,
}
let currentAIRuntime = defaultAIRuntime
let backendConfigEpoch = 0
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
  const aiConfig = {
    ...config,
    aiApiBaseUrl: `${apiBaseUrl()}/api/ai`,
    aiApiKey: 'server-managed',
    aiApiModel: currentAIRuntime.routineModel,
    aiProvider: 'api' as const,
  }
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
  aiRuntime?: AIRuntime
  authoritativePreferences?: boolean
  persistPreferences?: boolean
  serverManagedAI?: boolean
}) {
  backendConfigEpoch += 1
  authoritativePreferences = options.authoritativePreferences ?? authoritativePreferences
  persistPreferences = options.persistPreferences ?? persistPreferences
  currentAIRuntime = options.aiRuntime ?? currentAIRuntime
  useConfigStore.setState({ aiRuntime: currentAIRuntime })
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
  aiRuntime: defaultAIRuntime,
  backendStatus: null,
  config: initialConfig,
  error: null,
  isLoadingBackend: false,
  loadBackendStatus: async () => {
    const epoch = ++backendConfigEpoch
    set({ error: null, isLoadingBackend: true })
    try {
      const backendStatus = await backendConfigApi.getStatus()
      if (epoch !== backendConfigEpoch) return backendStatus
      currentAIRuntime = {
        ...currentAIRuntime,
        keyConfigured: backendStatus.deepseek.configured,
        routineModel: backendStatus.deepseek.model,
      }
      set({ aiRuntime: currentAIRuntime, backendStatus, isLoadingBackend: false })
      applyRuntimeConfig(currentConfig)
      return backendStatus
    } catch (error) {
      if (epoch !== backendConfigEpoch) throw error
      const message = error instanceof Error ? error.message : 'Unable to load backend config'
      set({ error: message, isLoadingBackend: false })
      throw error
    }
  },
  reset: () => {
    backendConfigEpoch += 1
    const config = runtimeConfigService.getConfig()
    currentConfig = config
    set({
      aiRuntime: currentAIRuntime,
      backendStatus: null,
      config,
      error: null,
      isLoadingBackend: false,
    })
    applyRuntimeConfig(config)
  },
  saveBackendConfig: async (update) => {
    const epoch = ++backendConfigEpoch
    set({ error: null, isLoadingBackend: true })
    try {
      const backendStatus = await backendConfigApi.updateConfig(update)
      if (epoch !== backendConfigEpoch) return backendStatus
      currentAIRuntime = {
        ...currentAIRuntime,
        keyConfigured: backendStatus.deepseek.configured,
        routineModel: backendStatus.deepseek.model,
      }
      set({ aiRuntime: currentAIRuntime, backendStatus, isLoadingBackend: false })
      applyRuntimeConfig(currentConfig)
      return backendStatus
    } catch (error) {
      if (epoch !== backendConfigEpoch) throw error
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
  saveSchedulingPreferences: async (scheduling) => {
    const saved = RuntimeConfigSchema.parse({ ...currentConfig, scheduling })
    await savePreferences({ scheduling: saved.scheduling })
    currentConfig = saved
    set({ config: saved, error: null })
    applyRuntimeConfig(saved)
    return saved
  },
}))

applyRuntimeConfig(initialConfig)
