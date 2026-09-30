import {
  BootstrapResponseSchema,
  LoginResponseSchema,
  RegistrationResponseSchema,
} from '../domain/schemas/auth.schema'
import type { BootstrapResponse } from '../domain/types'

type ApiRuntime = {
  baseUrl: string
  csrfToken: string
  desktopToken: string
}

const runtime: ApiRuntime = {
  baseUrl: (
    import.meta.env.VITE_API_BASE_URL?.trim() ||
    import.meta.env.VITE_FRIDGE_API_BASE_URL?.trim() ||
    import.meta.env.BASE_URL ||
    ''
  ).replace(/\/$/, ''),
  csrfToken: '',
  desktopToken: '',
}

export type ApiSessionFailureReason = 'unauthorized' | 'csrf-invalid'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = 'api_error',
    readonly retryAfterSeconds: number | null = null,
    readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

let unauthorizedHandler: ((reason: ApiSessionFailureReason) => void) | null = null
let sessionEpoch = 0
const activeRequests = new Set<AbortController>()

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function fetchCompatibleSignal(signal: AbortSignal): AbortSignal | undefined {
  try {
    // Some test/embedded runtimes expose fetch and AbortController from
    // different realms. Passing that signal makes fetch fail before the
    // request is sent. The session epoch still rejects stale responses; real
    // browsers and Tauri use the compatible branch and abort the transport.
    new Request('about:blank', { signal })
    return signal
  } catch {
    return undefined
  }
}

export function configureApiRuntime(update: Partial<ApiRuntime>) {
  Object.assign(runtime, update)
  runtime.baseUrl = runtime.baseUrl.replace(/\/$/, '')
}

export function setApiUnauthorizedHandler(
  handler: ((reason: ApiSessionFailureReason) => void) | null,
) {
  unauthorizedHandler = handler
}

export function abortApiRequests(options: { clearCsrf?: boolean } = {}) {
  sessionEpoch += 1
  if (options.clearCsrf) runtime.csrfToken = ''
  for (const controller of activeRequests) controller.abort()
  activeRequests.clear()
}

export function invalidateApiSession() {
  abortApiRequests({ clearCsrf: true })
}

export function clearApiSessionCredentials() {
  runtime.csrfToken = ''
}

export function apiBaseUrl(): string {
  return runtime.baseUrl
}

export function apiUrl(path: string): string {
  return `${runtime.baseUrl}${path}`
}

export const authenticatedFetch: typeof fetch = async (input, init = {}) => {
  const requestEpoch = sessionEpoch
  const controller = new AbortController()
  activeRequests.add(controller)
  const externalSignal = init.signal
  const abortFromExternal = () => controller.abort(externalSignal?.reason)
  if (externalSignal?.aborted) abortFromExternal()
  else externalSignal?.addEventListener('abort', abortFromExternal, { once: true })
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  if (runtime.desktopToken) headers.set('X-Desktop-Token', runtime.desktopToken)
  try {
    const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (clientTimezone) headers.set('X-Client-Timezone', clientTimezone)
  } catch {
    // The backend intentionally falls back to UTC when the runtime cannot resolve an IANA zone.
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && runtime.csrfToken) {
    headers.set('X-CSRF-Token', runtime.csrfToken)
  }
  // Desktop antivirus/startup activity can briefly interrupt loopback requests.
  // Retry only idempotent requests; never repeat an AI or create POST whose first
  // response may have been lost after the server already applied it.
  const retryable = Boolean(runtime.desktopToken) && ['GET', 'HEAD', 'OPTIONS'].includes(method)
  const delays = retryable ? [0, 150, 500] : [0]
  const requestSignal = fetchCompatibleSignal(controller.signal)
  let response: Response | null = null
  try {
    for (const delay of delays) {
      if (delay) await wait(delay)
      if (controller.signal.aborted || requestEpoch !== sessionEpoch) break
      try {
        let rejectForAbort: ((reason?: unknown) => void) | undefined
        const aborted = new Promise<Response>((_resolve, reject) => {
          rejectForAbort = reject
        })
        const abortPendingRequest = () =>
          rejectForAbort?.(
            new DOMException('The previous user session was replaced.', 'AbortError'),
          )
        controller.signal.addEventListener('abort', abortPendingRequest, { once: true })
        try {
          response = await Promise.race([
            globalThis.fetch(input, {
              ...init,
              credentials: 'include',
              headers,
              ...(requestSignal ? { signal: requestSignal } : {}),
            }),
            aborted,
          ])
        } finally {
          controller.signal.removeEventListener('abort', abortPendingRequest)
        }
        break
      } catch {
        if (controller.signal.aborted) break
        // Continue to the next safe loopback retry.
      }
    }
  } finally {
    activeRequests.delete(controller)
    externalSignal?.removeEventListener('abort', abortFromExternal)
  }
  if (controller.signal.aborted || requestEpoch !== sessionEpoch) {
    throw new DOMException('The previous user session was replaced.', 'AbortError')
  }
  if (!response) {
    const target = runtime.baseUrl || 'the current app origin'
    throw new Error(
      `Cannot reach the Calendar API at ${target}. The desktop backend did not respond after ${delays.length} attempt${delays.length === 1 ? '' : 's'}. Restart the app if this persists.`,
    )
  }
  if (response.status === 401) {
    unauthorizedHandler?.('unauthorized')
  } else if (response.status === 403) {
    const payload = (await response
      .clone()
      .json()
      .catch(() => null)) as { error?: { code?: string } } | null
    if (payload?.error?.code === 'csrf_invalid') unauthorizedHandler?.('csrf-invalid')
  }
  return response
}

async function errorMessage(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string }
  } | null
  return payload?.error?.message ?? `API request failed with status ${response.status}`
}

export async function apiErrorFromResponse(response: Response): Promise<ApiError> {
  const message = await errorMessage(response.clone())
  const payload = (await response.json().catch(() => null)) as {
    error?: {
      code?: string
      fieldErrors?: Record<string, string[]>
      retryAfterSeconds?: number
    }
  } | null
  const header = response.headers.get('Retry-After')
  let retryAfterSeconds = payload?.error?.retryAfterSeconds ?? null
  if (retryAfterSeconds === null && header) {
    const numeric = Number(header)
    if (Number.isFinite(numeric)) {
      retryAfterSeconds = Math.max(0, Math.ceil(numeric))
    } else {
      const retryAt = Date.parse(header)
      if (Number.isFinite(retryAt)) {
        retryAfterSeconds = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000))
      }
    }
  }
  return new ApiError(
    message,
    response.status,
    payload?.error?.code,
    retryAfterSeconds,
    payload?.error?.fieldErrors,
  )
}

export async function fetchBootstrap(): Promise<BootstrapResponse> {
  const response = await authenticatedFetch(apiUrl('/api/bootstrap'))
  if (!response.ok) throw await apiErrorFromResponse(response)
  const parsed = BootstrapResponseSchema.parse(await response.json())
  configureApiRuntime({ csrfToken: parsed.csrfToken })
  return parsed
}

export async function loginRequest(username: string, password: string) {
  const response = await authenticatedFetch(apiUrl('/api/auth/login'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password, username }),
  })
  if (!response.ok) throw await apiErrorFromResponse(response)
  const parsed = LoginResponseSchema.parse(await response.json())
  configureApiRuntime({ csrfToken: parsed.csrfToken })
  return parsed
}

export async function registerRequest(username: string, password: string, inviteCode: string) {
  const response = await authenticatedFetch(apiUrl('/api/auth/register'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password, inviteCode }),
  })
  if (!response.ok) throw await apiErrorFromResponse(response)
  return RegistrationResponseSchema.parse(await response.json())
}

export async function logoutRequest(): Promise<void> {
  const response = await authenticatedFetch(apiUrl('/api/auth/logout'), { method: 'POST' })
  if (!response.ok) throw await apiErrorFromResponse(response)
  configureApiRuntime({ csrfToken: '' })
}

export async function savePreferences(preferences: Record<string, unknown>): Promise<void> {
  const response = await authenticatedFetch(apiUrl('/api/me/preferences'), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(preferences),
  })
  if (!response.ok) throw await apiErrorFromResponse(response)
}
