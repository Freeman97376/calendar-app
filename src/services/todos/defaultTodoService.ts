import type { ITodoService } from './ITodoService'
import { LocalTodoService } from './localTodoService'

export function createDefaultTodoService(): ITodoService {
  return new LocalTodoService()
}
