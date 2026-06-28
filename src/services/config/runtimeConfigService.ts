import {
  BackendConfigStatusSchema,
  BackendConfigUpdateSchema,
  RuntimeConfigSchema,
} from '../../domain/schemas/config.schema'
import type {
  AIProvider,
  BackendConfigStatus,
  BackendConfigUpdate,
  RuntimeConfig,
} from '../../domain/types'

const CONFIG_KEY = 'calendar_runtime_config'
const AI_PROVIDER_VALUES = new Set<AIProvider>(['api', 'local'])
const DEFAULT_AI_API_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_AI_API_MODEL = 'deepseek-chat'
const AI_API_PROFILE_VALUES = new Set<RuntimeConfig['aiApiProfile']>(['deepseek', 'custom'])

type RuntimeConfigInput = Omit<Partial<RuntimeConfig>, 'aiProvider'> & {
  aiProvider?: unknown
  deepseekApiKey?: string
  deepseekModel?: string
}

function envAiProvider(): AIProvider {
  const provider = import.meta.env.VITE_AI_PROVIDER
  if (provider === 'anthropic' || provider === 'deepseek' || provider === 'ollama') return 'api'
  return AI_PROVIDER_VALUES.has(provider as AIProvider) ? (provider as AIProvider) : 'api'
}

function aiApiProfileFor(baseUrl: string, model: string): RuntimeConfig['aiApiProfile'] {
  return baseUrl === DEFAULT_AI_API_BASE_URL && model === DEFAULT_AI_API_MODEL ? 'deepseek' : 'custom'
}

function normalizeRuntimeConfigInput(input: RuntimeConfigInput): RuntimeConfigInput {
  const aiProvider =
    input.aiProvider === 'anthropic' || input.aiProvider === 'deepseek' || input.aiProvider === 'ollama'
      ? 'api'
      : input.aiProvider
  const aiApiModel = input.aiApiModel ?? input.deepseekModel ?? DEFAULT_AI_API_MODEL
  const aiApiBaseUrl = input.aiApiBaseUrl ?? DEFAULT_AI_API_BASE_URL
  const aiApiProfile = input.aiApiProfile ?? aiApiProfileFor(aiApiBaseUrl, aiApiModel)

  return {
    ...input,
    aiProvider,
    aiApiBaseUrl,
    aiApiKey: input.aiApiKey ?? input.deepseekApiKey ?? '',
    aiApiModel,
    aiApiProfile,
  }
}

function envDefaults(): RuntimeConfig {
  const aiApiBaseUrl = import.meta.env.VITE_AI_API_BASE_URL ?? DEFAULT_AI_API_BASE_URL
  const aiApiModel =
    import.meta.env.VITE_AI_API_MODEL ?? import.meta.env.VITE_DEEPSEEK_MODEL ?? DEFAULT_AI_API_MODEL
  const aiApiProfile = AI_API_PROFILE_VALUES.has(import.meta.env.VITE_AI_API_PROFILE)
    ? (import.meta.env.VITE_AI_API_PROFILE as RuntimeConfig['aiApiProfile'])
    : aiApiProfileFor(aiApiBaseUrl, aiApiModel)

  return RuntimeConfigSchema.parse({
    aiProvider: envAiProvider(),
    aiApiProfile,
    aiApiKey: import.meta.env.VITE_AI_API_KEY ?? import.meta.env.VITE_DEEPSEEK_API_KEY ?? '',
    aiApiBaseUrl,
    aiApiModel,
    anthropicApiKey: '',
    anthropicModel: 'claude-sonnet-4-6',
    defaultEventColor: import.meta.env.VITE_DEFAULT_EVENT_COLOR ?? '#047857',
    defaultEventEndTime: import.meta.env.VITE_DEFAULT_EVENT_END_TIME ?? '10:00',
    defaultEventStartTime: import.meta.env.VITE_DEFAULT_EVENT_START_TIME ?? '09:00',
    defaultEventTypeId: import.meta.env.VITE_DEFAULT_EVENT_TYPE_ID ?? 'general',
    defaultTodoEventTypeId: import.meta.env.VITE_DEFAULT_TODO_EVENT_TYPE_ID ?? 'general',
    defaultTodoPriority: import.meta.env.VITE_DEFAULT_TODO_PRIORITY ?? 'medium',
    firebaseApiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
    firebaseAppId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
    firebaseAuthDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
    firebaseMessagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
    firebaseProjectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
    firebaseStorageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
    fridgeApiBaseUrl: import.meta.env.VITE_FRIDGE_API_BASE_URL ?? 'http://127.0.0.1:8787',
    timezoneOverride: import.meta.env.VITE_TIMEZONE_OVERRIDE ?? '',
    deepseekApiKey: import.meta.env.VITE_DEEPSEEK_API_KEY ?? '',
    deepseekModel: import.meta.env.VITE_DEEPSEEK_MODEL ?? 'deepseek-chat',
    ollamaBaseUrl: 'http://localhost:11434',
    ollamaEnabled: false,
    ollamaModel: 'llama3.1',
  })
}

export class RuntimeConfigService {
  constructor(
    private readonly storage: Storage = localStorage,
    private readonly key = CONFIG_KEY,
  ) {}

  getConfig(): RuntimeConfig {
    const defaults = envDefaults()
    const raw = this.storage.getItem(this.key)

    if (!raw) return defaults

    try {
      return RuntimeConfigSchema.parse({
        ...defaults,
        ...normalizeRuntimeConfigInput(JSON.parse(raw) as RuntimeConfigInput),
      })
    } catch {
      return defaults
    }
  }

  saveConfig(config: RuntimeConfig): RuntimeConfig {
    const parsed = RuntimeConfigSchema.parse(normalizeRuntimeConfigInput(config))
    this.storage.setItem(this.key, JSON.stringify(parsed))
    return parsed
  }
}

export class BackendConfigApiService {
  constructor(
    private readonly getBaseUrl: () => string,
    private readonly fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init),
  ) {}

  async getStatus(): Promise<BackendConfigStatus> {
    const response = await this.fetcher(`${this.baseUrl()}/api/config`)
    return BackendConfigStatusSchema.parse(await parseJsonResponse(response))
  }

  async updateConfig(update: BackendConfigUpdate): Promise<BackendConfigStatus> {
    const response = await this.fetcher(`${this.baseUrl()}/api/config`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(BackendConfigUpdateSchema.parse(update)),
    })
    return BackendConfigStatusSchema.parse(await parseJsonResponse(response))
  }

  private baseUrl(): string {
    return this.getBaseUrl().replace(/\/$/, '')
  }
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const payload = (await response.json()) as unknown

  if (!response.ok) {
    const message =
      typeof payload === 'object' &&
      payload !== null &&
      'error' in payload &&
      typeof payload.error === 'object' &&
      payload.error !== null &&
      'message' in payload.error
        ? String(payload.error.message)
        : `Config API request failed with status ${response.status}`
    throw new Error(message)
  }

  return payload
}
