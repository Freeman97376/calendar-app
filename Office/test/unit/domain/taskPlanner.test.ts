import { describe, expect, it } from 'vitest'

import { planTodoSchedule } from '../../../../src/domain/logic/taskPlanner'
import type { Event, Todo } from '../../../../src/domain/types'

function todo(overrides: Partial<Todo>): Todo {
  return {
    id: 'todo-1',
    title: 'Task',
    status: 'todo',
    eventTypeId: 'general',
    etaMinutes: 30,
    energyNeeded: 'medium',
    priority: 'medium',
    createdAt: '2026-06-10T10:00:00.000Z',
    updatedAt: '2026-06-10T10:00:00.000Z',
    ...overrides,
  }
}

function localDateTime(value: string): string {
  return new Date(value).toISOString()
}

const existingEvent: Event = {
  id: 'event-1',
  title: 'Standup',
  startAt: localDateTime('2026-06-10T09:30:00'),
  endAt: localDateTime('2026-06-10T10:00:00'),
  allDay: false,
  eventTypeId: 'general',
  syncStatus: 'pending',
  createdAt: '2026-06-10T09:00:00.000Z',
  updatedAt: '2026-06-10T09:00:00.000Z',
}

describe('planTodoSchedule', () => {
  it('sorts by priority, due date, and energy while avoiding conflicts', () => {
    const plan = planTodoSchedule(
      [
        todo({ id: 'low', title: 'Low priority', priority: 'low', dueDate: '2026-06-10' }),
        todo({
          id: 'high-later',
          title: 'High later',
          priority: 'high',
          dueDate: '2026-06-12',
          energyNeeded: 'low',
        }),
        todo({
          id: 'high-sooner',
          title: 'High sooner',
          priority: 'high',
          dueDate: '2026-06-11',
          energyNeeded: 'high',
        }),
      ],
      [existingEvent],
      {
        dayEndTime: '10:30',
        dayStartTime: '09:00',
        rangeEnd: localDateTime('2026-06-10T10:30:00'),
        rangeStart: localDateTime('2026-06-10T09:00:00'),
      },
    )

    expect(plan.actions.map((action) => action.todoId)).toEqual(['high-sooner', 'high-later'])
    expect(plan.actions[0]).toMatchObject({
      startAt: localDateTime('2026-06-10T09:00:00'),
      endAt: localDateTime('2026-06-10T09:30:00'),
    })
    expect(plan.actions[1]).toMatchObject({
      startAt: localDateTime('2026-06-10T10:00:00'),
      endAt: localDateTime('2026-06-10T10:30:00'),
    })
    expect(plan.warnings).toHaveLength(1)
    expect(plan.warnings[0]).toContain('Low priority')
  })
})
