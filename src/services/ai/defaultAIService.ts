import type { RuntimeConfig } from '../../domain/types'
import type { IAIService } from './IAIService'
import { createAIService } from './aiServiceFactory'

export function createDefaultAIService(config?: RuntimeConfig): IAIService {
  return createAIService(config)
}
