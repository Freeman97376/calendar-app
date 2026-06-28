import type { AIProvider, RuntimeConfig } from '../../domain/types'
import type { IAIService } from './IAIService'
import { ApiAIService, DEFAULT_AI_API_MODEL } from './apiAIService'
import { FallbackAIService } from './fallbackAIService'

export type AIServiceFactoryOptions = {
  fetcher?: typeof fetch
  localService?: IAIService
}

export function modelForProvider(provider: AIProvider, config?: Partial<RuntimeConfig>): string {
  if (provider === 'local') return 'local'
  return config?.aiApiModel || config?.deepseekModel || DEFAULT_AI_API_MODEL
}

export function createAIService(
  config: Partial<RuntimeConfig> = {},
  options: AIServiceFactoryOptions = {},
): IAIService {
  const provider = config.aiProvider ?? 'api'
  const api = new ApiAIService({
    apiKey: config.aiApiKey ?? config.deepseekApiKey,
    baseUrl: config.aiApiBaseUrl,
    fetcher: options.fetcher,
    model: config.aiApiModel ?? config.deepseekModel,
  })

  return new FallbackAIService({
    api,
    defaultProvider: provider,
    local: options.localService,
  })
}
