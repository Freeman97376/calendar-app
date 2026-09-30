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
  vi.unstubAllEnvs()
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

describe('deployment base paths', () => {
  async function clientFor(base: string, override = '', legacyOverride = '') {
    vi.stubEnv('BASE_URL', base)
    vi.stubEnv('VITE_API_BASE_URL', override)
    vi.stubEnv('VITE_FRIDGE_API_BASE_URL', legacyOverride)
    vi.resetModules()
    return import('../../../../src/services/appApiClient')
  }

  it('keeps root builds on the same-origin API', async () => {
    const client = await clientFor('/')
    expect(client.apiUrl('/api/bootstrap')).toBe('/api/bootstrap')
  })

  it('routes every API family through the deployment path when override fields are blank', async () => {
    const client = await clientFor('/calendar/', '  ', '')
    for (const endpoint of [
      '/api/bootstrap',
      '/api/auth/register',
      '/api/auth/login',
      '/api/calendar/events',
      '/api/memory/goals',
      '/api/fridge/items',
      '/api/ai/chat/completions',
      '/api/data/export',
    ]) {
      expect(client.apiUrl(endpoint)).toBe(`/calendar${endpoint}`)
    }
  })

  it('sends registration to the subpath with same-origin credentials', async () => {
    const client = await clientFor('/calendar/')
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { success: true, user: { id: 'synthetic-id', username: 'test-user', role: 'user' } },
          { status: 201 },
        ),
      )
    vi.stubGlobal('fetch', fetcher)
    await client.registerRequest('test-user', 'synthetic-password', 'synthetic-invite')
    expect(fetcher.mock.calls[0][0]).toBe('/calendar/api/auth/register')
    expect(fetcher.mock.calls[0][1].credentials).toBe('include')
  })

  it('keeps explicit API and legacy overrides available', async () => {
    const explicit = await clientFor(
      '/calendar/',
      'https://api.example.test/app/',
      'https://legacy.example.test/',
    )
    expect(explicit.apiUrl('/api/bootstrap')).toBe('https://api.example.test/app/api/bootstrap')
    const legacy = await clientFor('/calendar/', '', 'https://legacy.example.test/')
    expect(legacy.apiUrl('/api/bootstrap')).toBe('https://legacy.example.test/api/bootstrap')
  })

  it('lets the desktop runtime replace the web deployment path', async () => {
    const client = await clientFor('/calendar/')
    client.configureApiRuntime({
      baseUrl: 'http://127.0.0.1:45678/',
      desktopToken: 'synthetic-launch',
    })
    expect(client.apiUrl('/api/bootstrap')).toBe('http://127.0.0.1:45678/api/bootstrap')
  })
})
