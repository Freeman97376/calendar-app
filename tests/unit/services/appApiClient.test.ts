import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  authenticatedFetch,
  configureApiRuntime,
  invalidateApiSession,
  setApiUnauthorizedHandler,
} from '../../../src/services/appApiClient'

afterEach(() => {
  configureApiRuntime({ baseUrl: 'http://127.0.0.1:8787', csrfToken: '', desktopToken: '' })
  setApiUnauthorizedHandler(null)
  vi.unstubAllGlobals()
})

describe('authenticatedFetch', () => {
  it('always includes credentials and attaches desktop and CSRF tokens to writes', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(null, { status: 204 }))
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
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })))
    setApiUnauthorizedHandler(onUnauthorized)

    await authenticatedFetch('/api/calendar/events')

    expect(onUnauthorized).toHaveBeenCalledOnce()
  })

  it('replaces browser Failed to fetch errors with an actionable Calendar API message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))
    configureApiRuntime({ baseUrl: 'http://127.0.0.1:8787' })

    await expect(authenticatedFetch('/api/ai/chat/completions')).rejects.toThrow(
      'Cannot reach the Calendar API at http://127.0.0.1:8787',
    )
  })

  it('retries an idempotent desktop write after a transient loopback failure', async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetcher)
    configureApiRuntime({ baseUrl: 'http://127.0.0.1:56227', desktopToken: 'launch-value' })

    const response = await authenticatedFetch('http://127.0.0.1:56227/api/config', {
      method: 'PATCH',
      body: '{}',
    })

    expect(response.status).toBe(204)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('aborts an unfinished request when the account session is replaced', async () => {
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('aborted', 'AbortError')),
          { once: true },
        )
      })))

    const pending = authenticatedFetch('/api/memory/projects')
    invalidateApiSession()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
