import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  authenticatedFetch,
  configureApiRuntime,
  invalidateApiSession,
  setApiUnauthorizedHandler,
} from '../../../../src/services/appApiClient'
import { LongTermMemoryClient } from '../../../../src/services/longTermMemoryClient'

afterEach(() => {
  configureApiRuntime({ baseUrl: 'http://127.0.0.1:8787', csrfToken: '', desktopToken: '' })
  setApiUnauthorizedHandler(null)
  vi.unstubAllGlobals()
})

describe('authenticatedFetch', () => {
  it('always includes credentials and attaches desktop and CSRF tokens to writes', async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }),
    )
    vi.stubGlobal('fetch', fetcher)
    configureApiRuntime({ csrfToken: 'csrf-value', desktopToken: 'launch-value' })

    await authenticatedFetch('/api/me/preferences', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })

    const [, init] = fetcher.mock.calls[0]
    const headers = new Headers(init?.headers)
    expect(init?.credentials).toBe('include')
    expect(headers.get('X-CSRF-Token')).toBe('csrf-value')
    expect(headers.get('X-Desktop-Token')).toBe('launch-value')
  })

  it('notifies the auth boundary on a 401 response', async () => {
    const onUnauthorized = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 401 })),
    )
    setApiUnauthorizedHandler(onUnauthorized)

    await authenticatedFetch('/api/calendar/events')

    expect(onUnauthorized).toHaveBeenCalledWith('unauthorized')
  })
  it('requires reauthentication for csrf_invalid but not an ordinary permission 403', async () => {
    const onUnauthorized = vi.fn()
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 'csrf_invalid' } }), {
          headers: { 'content-type': 'application/json' },
          status: 403,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 'permission_denied' } }), {
          headers: { 'content-type': 'application/json' },
          status: 403,
        }),
      )
    vi.stubGlobal('fetch', fetcher)
    setApiUnauthorizedHandler(onUnauthorized)

    await authenticatedFetch('/api/calendar/events', { method: 'POST' })
    await authenticatedFetch('/api/admin/users')

    expect(onUnauthorized).toHaveBeenCalledTimes(1)
    expect(onUnauthorized).toHaveBeenCalledWith('csrf-invalid')
  })

  it('replaces browser Failed to fetch errors with an actionable Calendar API message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    configureApiRuntime({ baseUrl: 'http://127.0.0.1:8787' })

    await expect(authenticatedFetch('/api/ai/chat/completions')).rejects.toThrow(
      'Cannot reach the Calendar API at http://127.0.0.1:8787',
    )
  })

  it('does not replay a desktop write after a transient loopback failure', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetcher)
    configureApiRuntime({ baseUrl: 'http://127.0.0.1:56227', desktopToken: 'launch-value' })

    await expect(
      authenticatedFetch('http://127.0.0.1:56227/api/config', { method: 'PATCH', body: '{}' }),
    ).rejects.toThrow('did not respond after 1 attempt')
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('aborts an unfinished request when the account session is replaced', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              'abort',
              () => reject(new DOMException('aborted', 'AbortError')),
              { once: true },
            )
          }),
      ),
    )

    const pending = authenticatedFetch('/api/memory/projects')
    invalidateApiSession()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('LongTermMemoryClient', () => {
  it('creates a goal-project pair with one request to the atomic endpoint', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({
        goal: { goal_id: 'goal-1', title: 'Goal' },
        project: { goal_id: 'goal-1', project_id: 'project-1', title: 'Project' },
        success: true,
      }),
    )
    const client = new LongTermMemoryClient({ baseUrl: 'https://calendar.test', fetcher })

    const result = await client.createGoalProject({
      goal: { title: 'Goal' },
      project: { title: 'Project' },
    })

    expect(fetcher).toHaveBeenCalledOnce()
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe('https://calendar.test/api/memory/goal-projects')
    expect(init).toMatchObject({ method: 'POST' })
    expect(JSON.parse(String(init?.body))).toEqual({
      goal: { title: 'Goal' },
      project: { title: 'Project' },
    })
    expect(result.project.goal_id).toBe(result.goal.goal_id)
  })
})
