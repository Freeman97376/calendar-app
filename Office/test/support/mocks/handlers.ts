import { HttpResponse, http } from 'msw'

export const handlers = [
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
]
