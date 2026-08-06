import type { IEventTypeService } from './IEventTypeService'
import { LocalEventTypeService } from './localEventTypeService'

export function createDefaultEventTypeService(): IEventTypeService {
  return new LocalEventTypeService()
}
