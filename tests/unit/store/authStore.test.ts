import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  authenticatedFetch,
  configureApiRuntime,
  setApiUnauthorizedHandler,
} from '../../../src/services/appApiClient'
import {
  configureUserSessionRefresh,
  configureUserSessionReset,
  useAuthStore,
} from '../../../src/store/authStore'

const capabilities = {
  backendConfigEditable: false,
  dataPortability: true,
  registration: false as const,
  serverManagedAI: true,
}

function loginResponse(username = 'alice') {
  return new Response(
    JSON.stringify({
      csrfToken: 'login-csrf',
      expiresAt: '2026-07-20T00:00:00Z',
      success: true,
      user: { id: username, role: 'user', username },
    }),
    { headers: { 'content-type': 'application/json' }, status: 200 },
  )
}

function bootstrapResponse(username = 'alice') {
  return new Response(
    JSON.stringify({
      authRequired: true,
      capabilities,
      csrfToken: 'bootstrap-csrf',
      mode: 'server',
      preferences: { language: 'en' },
      success: true,
      user: { id: username, role: 'user', username },
    }),
    { headers: { 'content-type': 'application/json' }, status: 200 },
  )
}

afterEach(() => {
  configureApiRuntime({ baseUrl: 'http://calendar.test', csrfToken: '', desktopToken: '' })
  configureUserSessionReset(null)
  configureUserSessionRefresh(null)
  setApiUnauthorizedHandler(null)
  vi.unstubAllGlobals()
})

describe('auth session lifecycle', () => {
  it('keeps the bootstrap CSRF token after initializing a newly signed-in account', async () => {
    const clearAccount = vi.fn()
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(loginResponse())
      .mockResolvedValueOnce(bootstrapResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetcher)
    configureApiRuntime({ baseUrl: 'http://calendar.test' })
    configureUserSessionReset(clearAccount)
    useAuthStore.setState({
      authRequired: true,
      error: null,
      isSubmitting: false,
      retryAfterSeconds: null,
      status: 'unauthenticated',
      user: null,
    })

    await useAuthStore.getState().login('alice', 'secret')
    await authenticatedFetch('http://calendar.test/api/calendar/todos', {
      body: '{}',
      method: 'POST',
    })

    const headers = new Headers(fetcher.mock.calls[2][1]?.headers)
    expect(headers.get('X-CSRF-Token')).toBe('bootstrap-csrf')
    expect(clearAccount).toHaveBeenCalledOnce()
  })

  it('preserves account data and refreshes reads when the same account reauthenticates', async () => {
    const clearAccount = vi.fn()
    const refreshAccount = vi.fn(async () => undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(loginResponse()).mockResolvedValueOnce(bootstrapResponse()),
    )
    configureApiRuntime({ baseUrl: 'http://calendar.test' })
    configureUserSessionReset(clearAccount)
    configureUserSessionRefresh(refreshAccount)
    useAuthStore.setState({
      authRequired: true,
      error: 'expired',
      isSubmitting: false,
      retryAfterSeconds: null,
      status: 'reauth-required',
      user: { id: 'alice', role: 'user', username: 'alice' },
    })

    await useAuthStore.getState().login('alice', 'secret')

    expect(useAuthStore.getState().status).toBe('authenticated')
    expect(clearAccount).not.toHaveBeenCalled()
    expect(refreshAccount).toHaveBeenCalledOnce()
  })

  it('aborts transport but preserves mounted account data when a session expires', () => {
    const clearAccount = vi.fn()
    configureUserSessionReset(clearAccount)
    useAuthStore.setState({
      authRequired: true,
      error: null,
      isSubmitting: false,
      retryAfterSeconds: null,
      status: 'authenticated',
      user: { id: 'alice', role: 'user', username: 'alice' },
    })

    useAuthStore.getState().sessionExpired('csrf-invalid')

    expect(useAuthStore.getState()).toMatchObject({
      status: 'reauth-required',
      user: { id: 'alice', username: 'alice' },
    })
    expect(clearAccount).not.toHaveBeenCalled()
  })

  it('requires confirmation and clears account stores before switching users', async () => {
    const clearAccount = vi.fn()
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(loginResponse('bob'))
        .mockResolvedValueOnce(bootstrapResponse('bob')),
    )
    configureApiRuntime({ baseUrl: 'http://calendar.test' })
    configureUserSessionReset(clearAccount)
    useAuthStore.setState({
      authRequired: true,
      error: null,
      isSubmitting: false,
      retryAfterSeconds: null,
      status: 'reauth-required',
      user: { id: 'alice', role: 'user', username: 'alice' },
    })

    await useAuthStore.getState().login('bob', 'secret')

    expect(confirm).toHaveBeenCalledOnce()
    expect(clearAccount).toHaveBeenCalledWith({ language: 'en' })
    expect(useAuthStore.getState().user?.username).toBe('bob')
  })

  it('does not pretend logout succeeded when the server logout fails', async () => {
    const clearAccount = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: { code: 'temporary_failure', message: 'offline' } }),
            {
              headers: { 'content-type': 'application/json' },
              status: 503,
            },
          ),
      ),
    )
    configureApiRuntime({ baseUrl: 'http://calendar.test', csrfToken: 'csrf' })
    configureUserSessionReset(clearAccount)
    useAuthStore.setState({
      authRequired: true,
      error: null,
      isSubmitting: false,
      retryAfterSeconds: null,
      status: 'authenticated',
      user: { id: 'alice', role: 'user', username: 'alice' },
    })

    await expect(useAuthStore.getState().logout()).rejects.toThrow('offline')

    expect(clearAccount).not.toHaveBeenCalled()
    expect(useAuthStore.getState()).toMatchObject({
      status: 'authenticated',
      user: { id: 'alice', username: 'alice' },
    })
  })
})
