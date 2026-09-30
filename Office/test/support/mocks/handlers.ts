import { HttpResponse, http } from 'msw'

import { useEventStore } from '../../../../src/store/eventStore'
import { useTodoStore } from '../../../../src/store/todoStore'

const aiMessages = new Map<string, Record<string, unknown>>()
const aiBatches = new Map<string, Record<string, unknown>>()
let persistBatchTodos:
  | ((upserts: Array<Record<string, unknown>>, deletedIds: string[]) => void)
  | null = null
export function configureMockBatchTodoPersistence(persist: typeof persistBatchTodos) {
  persistBatchTodos = persist
}
export function resetAIReviewMocks() {
  persistBatchTodos = null
  aiMessages.clear()
  aiBatches.clear()
}
const newAIReview = () => ({
  version: 1,
  dismissed: false,
  operations: { apply: { status: 'pending' }, copy_to_todos: { status: 'pending' } },
})

export const handlers = [
  http.get('*/api/scheduling/proposals/current', () =>
    HttpResponse.json({ success: true, proposal: null }),
  ),
  http.post('*/api/scheduling/proposals/recompute', () =>
    HttpResponse.json({ success: true, proposal: null }),
  ),
  http.post('*/api/check-ins/ensure', () => HttpResponse.json({ success: true, checkIns: [] })),
  http.get('*/api/check-ins/pending', () => HttpResponse.json({ success: true, checkIns: [] })),
  http.get('*/api/me/ai-usage', () =>
    HttpResponse.json({
      success: true,
      usage: {
        selected_mode: 'balanced',
        effective_mode: 'balanced',
        administrator_maximum_mode: 'balanced',
        server_default_mode: 'balanced',
        routine_input_tokens: 0,
        routine_output_tokens: 0,
        planning_input_tokens: 0,
        planning_output_tokens: 0,
        total_tokens: 0,
        request_count: 0,
        soft_limit: 1_500_000,
        hard_limit: 2_000_000,
        percent_used: 0,
        degraded: false,
        warning: false,
        month: '2026-07',
        reset_at: '2026-08-01T00:00:00Z',
      },
    }),
  ),
  http.get('*/api/memory/projects/:projectId/dashboard', () =>
    HttpResponse.json(
      {
        success: false,
        error: { message: 'Goal control dashboard is not configured for this mock.' },
      },
      { status: 404 },
    ),
  ),
  http.post('*/api/memory/projects/:projectId/plan-versions', () =>
    HttpResponse.json({
      success: true,
      version: { version_id: 'mock-version', version_number: 1 },
    }),
  ),
  http.get('*/api/goal-conversations', () => HttpResponse.json({ success: true, threads: [] })),
  http.get('*/api/ai/conversations', () => HttpResponse.json({ success: true, threads: [] })),
  http.post('*/api/ai/conversations', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({
      success: true,
      thread: {
        created_at: '2026-08-29T00:00:00Z',
        kind: 'assistant_chat',
        metadata: body.metadata ?? {},
        rolling_summary: '',
        status: 'active',
        thread_id: body.thread_id ?? 'mock-ai-thread',
        title: body.title ?? 'AI conversation',
        updated_at: '2026-08-29T00:00:00Z',
      },
    })
  }),
  http.post('*/api/ai/conversations/:threadId/messages', async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>
    const structured = (body.structured ?? {}) as Record<string, unknown>
    const message = {
      ...body,
      structured: {
        ...structured,
        ...(structured.actionPlan ? { actionPlanReview: newAIReview() } : {}),
      },
      created_at: '2026-08-29T00:00:00Z',
      message_id: body.message_id ?? `mock-ai-message-${String(body.role)}`,
      thread_id: params.threadId,
      updated_at: '2026-08-29T00:00:00Z',
    }
    const key = `${params.threadId}/${message.message_id}`
    if (!aiMessages.has(key)) aiMessages.set(key, message)
    return HttpResponse.json({ success: true, message: aiMessages.get(key) })
  }),
  http.post(
    '*/api/ai/conversations/:threadId/messages/:messageId/action-plan/dismiss',
    ({ params }) => {
      const message = aiMessages.get(`${params.threadId}/${params.messageId}`)
      if (!message) return HttpResponse.json({ error: { message: 'Not found' } }, { status: 404 })
      const structured = message.structured as Record<string, unknown>
      structured.actionPlanReview = { ...(structured.actionPlanReview as object), dismissed: true }
      return HttpResponse.json({ success: true, message })
    },
  ),
  http.patch('*/api/ai/conversations/:threadId', async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({
      success: true,
      thread: {
        created_at: '2026-08-29T00:00:00Z',
        kind: 'assistant_chat',
        metadata: {},
        rolling_summary: '',
        status: body.status ?? 'active',
        thread_id: params.threadId,
        title: body.title ?? 'AI conversation',
        updated_at: '2026-08-29T00:00:00Z',
      },
    })
  }),
  http.post('*/api/goal-conversations', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({
      success: true,
      thread: {
        created_at: '2026-08-19T00:00:00Z',
        kind: 'goal_draft',
        metadata: body.metadata ?? {},
        rolling_summary: '',
        status: 'draft',
        template_id: body.template_id ?? null,
        thread_id: 'mock-review-thread',
        title: body.title ?? 'Review draft',
        updated_at: '2026-08-19T00:00:00Z',
      },
    })
  }),
  http.post('*/api/goal-conversations/:threadId/messages', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({
      success: true,
      message: {
        ...body,
        created_at: '2026-08-19T00:00:00Z',
        message_id: 'mock-review-message',
        thread_id: 'mock-review-thread',
        updated_at: '2026-08-19T00:00:00Z',
      },
    })
  }),
  http.post('*/api/active-tool-journeys/:journeyId/events', async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({
      success: true,
      event: {
        created_at: '2026-08-19T00:00:00Z',
        event_id: 'mock-funnel-event',
        journey_id: params.journeyId,
        ...body,
        updated_at: '2026-08-19T00:00:00Z',
      },
    })
  }),
  http.get('*/api/config', () =>
    HttpResponse.json({
      success: true,
      deepseek: {
        configured: false,
        base_url: 'https://api.deepseek.com',
        model: 'deepseek-chat',
      },
      fridge: {
        data_dir: 'backend/data',
      },
    }),
  ),
  http.patch('*/api/config', async ({ request }) => {
    const body = (await request.json()) as {
      deepseek_base_url?: string
      deepseek_model?: string
      fridge_data_dir?: string
    }

    return HttpResponse.json({
      success: true,
      deepseek: {
        configured: true,
        base_url: body.deepseek_base_url ?? 'https://api.deepseek.com',
        model: body.deepseek_model ?? 'deepseek-chat',
      },
      fridge: {
        data_dir: body.fridge_data_dir ?? 'backend/data',
      },
    })
  }),
  http.post('*/api/calendar/action-batches', async ({ request }) => {
    const body = (await request.json()) as {
      actions: Array<Record<string, unknown>>
      idempotencyKey: string
      aiPlanRef?: { threadId: string; messageId: string }
      aiPlanOperation?: 'apply' | 'copy_to_todos'
    }
    const reference = body.aiPlanRef
    const savedMessage = reference
      ? aiMessages.get(`${reference.threadId}/${reference.messageId}`)
      : undefined
    const structured = savedMessage?.structured as Record<string, unknown> | undefined
    const review = structured?.actionPlanReview as ReturnType<typeof newAIReview> | undefined
    const batchKey = reference
      ? `${reference.threadId}/${reference.messageId}/${body.aiPlanOperation}`
      : body.idempotencyKey
    const existing = aiBatches.get(batchKey)
    if (existing) return HttpResponse.json({ ...existing, aiPlanReview: review, replayed: true })
    const eventsUpserted: Array<Record<string, unknown>> = []
    const todosUpserted: Array<Record<string, unknown>> = []
    const deletedEventIds: string[] = []
    const deletedTodoIds: string[] = []
    const results: Array<Record<string, unknown>> = []
    const timestamp = '2026-08-29T00:00:00.000Z'

    body.actions.forEach((action, index) => {
      const type = String(action.type)
      const clientActionId = String(action.clientActionId)
      if (type === 'create_event') {
        const event = action.event as Record<string, unknown>
        const created = {
          allDay: false,
          createdAt: timestamp,
          eventTypeId: 'general',
          id: `mock-event-${index + 1}`,
          syncStatus: 'pending',
          ...event,
          updatedAt: timestamp,
        }
        eventsUpserted.push(created)
        results.push({
          clientActionId,
          entityId: created.id,
          entityType: 'event',
          status: 'applied',
        })
      } else if (type === 'update_event') {
        const eventId = String(action.eventId)
        const existing = useEventStore.getState().events.find((event) => event.id === eventId)
        if (existing)
          eventsUpserted.push({ ...existing, ...(action.changes as object), updatedAt: timestamp })
        results.push({ clientActionId, entityId: eventId, entityType: 'event', status: 'applied' })
      } else if (type === 'delete_event') {
        const eventId = String(action.eventId)
        deletedEventIds.push(eventId)
        results.push({ clientActionId, entityId: eventId, entityType: 'event', status: 'applied' })
      } else if (type === 'create_todo') {
        const todo = action.todo as Record<string, unknown>
        const created = {
          createdAt: timestamp,
          energyNeeded: 'medium',
          etaMinutes: 30,
          eventTypeId: 'general',
          id: `mock-todo-${index + 1}`,
          priority: 'medium',
          status: 'todo',
          ...todo,
          updatedAt: timestamp,
        }
        todosUpserted.push(created)
        results.push({
          clientActionId,
          entityId: created.id,
          entityType: 'todo',
          status: 'applied',
        })
      } else if (type === 'update_todo') {
        const todoId = String(action.todoId)
        const existing = useTodoStore.getState().todos.find((todo) => todo.id === todoId)
        if (existing)
          todosUpserted.push({ ...existing, ...(action.changes as object), updatedAt: timestamp })
        results.push({ clientActionId, entityId: todoId, entityType: 'todo', status: 'applied' })
      } else if (type === 'delete_todo') {
        const todoId = String(action.todoId)
        deletedTodoIds.push(todoId)
        results.push({ clientActionId, entityId: todoId, entityType: 'todo', status: 'applied' })
      } else if (type === 'schedule_todo') {
        const todoId = String(action.todoId)
        const event = action.event as Record<string, unknown>
        const eventId = `mock-event-${index + 1}`
        eventsUpserted.push({
          allDay: false,
          createdAt: timestamp,
          eventTypeId: 'general',
          id: eventId,
          linkedTodoId: todoId,
          syncStatus: 'pending',
          ...event,
          updatedAt: timestamp,
        })
        const existing = useTodoStore.getState().todos.find((todo) => todo.id === todoId)
        if (existing)
          todosUpserted.push({ ...existing, linkedEventId: eventId, updatedAt: timestamp })
        results.push({ clientActionId, entityId: eventId, entityType: 'event', status: 'applied' })
      }
    })

    if (review && body.aiPlanOperation)
      review.operations[body.aiPlanOperation] = { status: 'applied' }
    const result = {
      aiPlanReview: review,
      batchId: `batch-${body.idempotencyKey}`,
      deletedEventIds,
      deletedTodoIds,
      eventsUpserted,
      replayed: false,
      results,
      status: 'committed',
      success: true,
      todosUpserted,
    }
    persistBatchTodos?.(todosUpserted, deletedTodoIds)
    aiBatches.set(batchKey, result)
    return HttpResponse.json(result)
  }),
]
