import { describe, expect, it } from 'vitest'

import { TodoSchema } from '../../../src/domain/schemas/todo.schema'

const baseTodo = {
  id: 'todo-1',
  title: 'Draft launch plan',
  createdAt: '2026-06-10T10:00:00.000Z',
  updatedAt: '2026-06-10T10:00:00.000Z',
}

describe('TodoSchema', () => {
  it('applies planning metadata defaults for old todo records', () => {
    expect(TodoSchema.parse(baseTodo)).toMatchObject({
      energyNeeded: 'medium',
      etaMinutes: 30,
      priority: 'medium',
      status: 'todo',
    })
  })

  it('validates eta bounds and energy enum values', () => {
    expect(TodoSchema.parse({ ...baseTodo, etaMinutes: '45', energyNeeded: 'high' })).toMatchObject({
      energyNeeded: 'high',
      etaMinutes: 45,
    })
    expect(() => TodoSchema.parse({ ...baseTodo, etaMinutes: 4 })).toThrow()
    expect(() => TodoSchema.parse({ ...baseTodo, etaMinutes: 481 })).toThrow()
    expect(() => TodoSchema.parse({ ...baseTodo, energyNeeded: 'extreme' })).toThrow()
  })
})
