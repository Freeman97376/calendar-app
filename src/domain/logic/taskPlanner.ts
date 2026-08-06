import type { Event, Todo } from '../types'

export type TaskScheduleAction = {
  type: 'schedule_todo'
  todoId: string
  startAt: string
  endAt: string
  reason: string
}

export type TaskSchedulePlan = {
  summary: string
  actions: TaskScheduleAction[]
  warnings: string[]
}

export type TaskPlannerOptions = {
  rangeStart: string
  rangeEnd: string
  dayStartTime?: string
  dayEndTime?: string
}

type BusyBlock = {
  startAt: string
  endAt: string
}

const priorityRank: Record<Todo['priority'], number> = {
  high: 3,
  medium: 2,
  low: 1,
}

const energyRank: Record<Todo['energyNeeded'], number> = {
  high: 3,
  medium: 2,
  low: 1,
}

function toLocalISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

function dateAtTime(isoDate: string, time: string): Date {
  return new Date(`${isoDate}T${time}:00`)
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000)
}

function overlaps(left: BusyBlock, right: BusyBlock): boolean {
  return (
    new Date(left.startAt) < new Date(right.endAt) && new Date(right.startAt) < new Date(left.endAt)
  )
}

function sortedCandidateTodos(todos: Todo[]): Todo[] {
  return todos
    .filter((todo) => todo.status !== 'done' && !todo.linkedEventId)
    .sort((left, right) => {
      const priorityDelta = priorityRank[right.priority] - priorityRank[left.priority]
      if (priorityDelta) return priorityDelta

      const leftDue = left.dueDate
        ? new Date(`${left.dueDate}T00:00:00`).getTime()
        : Number.POSITIVE_INFINITY
      const rightDue = right.dueDate
        ? new Date(`${right.dueDate}T00:00:00`).getTime()
        : Number.POSITIVE_INFINITY
      if (leftDue !== rightDue) return leftDue - rightDue

      const energyDelta = energyRank[right.energyNeeded] - energyRank[left.energyNeeded]
      if (energyDelta) return energyDelta

      return left.createdAt.localeCompare(right.createdAt)
    })
}

function busyBlocksFor(events: Event[], scheduled: BusyBlock[]): BusyBlock[] {
  return [...events, ...scheduled]
    .map((item) => ({ startAt: item.startAt, endAt: item.endAt }))
    .sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime())
}

function findSlot(
  todo: Todo,
  busyBlocks: BusyBlock[],
  options: Required<TaskPlannerOptions>,
): BusyBlock | null {
  const rangeStart = new Date(options.rangeStart)
  const rangeEnd = new Date(options.rangeEnd)
  const cursor = new Date(rangeStart)
  cursor.setHours(0, 0, 0, 0)

  while (cursor <= rangeEnd) {
    const isoDate = toLocalISODate(cursor)
    let candidateStart = new Date(
      Math.max(dateAtTime(isoDate, options.dayStartTime).getTime(), rangeStart.getTime()),
    )
    const dayEnd = new Date(
      Math.min(dateAtTime(isoDate, options.dayEndTime).getTime(), rangeEnd.getTime()),
    )
    const dayBusy = busyBlocks.filter((block) =>
      overlaps(block, {
        startAt: dateAtTime(isoDate, options.dayStartTime).toISOString(),
        endAt: dateAtTime(isoDate, options.dayEndTime).toISOString(),
      }),
    )

    for (const block of dayBusy) {
      const candidateEnd = addMinutes(candidateStart, todo.etaMinutes)
      if (candidateEnd <= new Date(block.startAt)) {
        return { startAt: candidateStart.toISOString(), endAt: candidateEnd.toISOString() }
      }

      if (new Date(block.endAt) > candidateStart) {
        candidateStart = new Date(block.endAt)
      }
    }

    const finalEnd = addMinutes(candidateStart, todo.etaMinutes)
    if (finalEnd <= dayEnd) {
      return { startAt: candidateStart.toISOString(), endAt: finalEnd.toISOString() }
    }

    cursor.setDate(cursor.getDate() + 1)
  }

  return null
}

export function planTodoSchedule(
  todos: Todo[],
  events: Event[],
  options: TaskPlannerOptions,
): TaskSchedulePlan {
  const normalizedOptions: Required<TaskPlannerOptions> = {
    dayEndTime: options.dayEndTime ?? '17:00',
    dayStartTime: options.dayStartTime ?? '09:00',
    rangeEnd: options.rangeEnd,
    rangeStart: options.rangeStart,
  }
  const scheduledBlocks: BusyBlock[] = []
  const actions: TaskScheduleAction[] = []
  const warnings: string[] = []

  for (const todo of sortedCandidateTodos(todos)) {
    const slot = findSlot(todo, busyBlocksFor(events, scheduledBlocks), normalizedOptions)

    if (!slot) {
      warnings.push(`No available slot for "${todo.title}" within the selected range.`)
      continue
    }

    scheduledBlocks.push(slot)
    actions.push({
      type: 'schedule_todo',
      todoId: todo.id,
      startAt: slot.startAt,
      endAt: slot.endAt,
      reason: `${todo.priority} priority, ${todo.energyNeeded} energy, ${todo.etaMinutes} minute ETA.`,
    })
  }

  return {
    summary: actions.length
      ? `Prepared ${actions.length} task schedule action${actions.length === 1 ? '' : 's'}.`
      : 'No task schedule actions were prepared.',
    actions,
    warnings,
  }
}
