import type { RuntimeConfig } from '../../domain/types'
import type { IFridgeService } from './IFridgeService'
import { FridgeApiService } from './fridgeApiService'

export function createDefaultFridgeService(config?: RuntimeConfig): IFridgeService {
  return new FridgeApiService({ baseUrl: config?.fridgeApiBaseUrl })
}
