import { create } from 'zustand'

import type { AppCapabilities, AppUser, BootstrapResponse } from '../domain/types'
import {
  ApiError,
  apiBaseUrl,
  abortApiRequests,
  clearApiSessionCredentials,
  fetchBootstrap,
  loginRequest,
  logoutRequest,
} from '../services/appApiClient'

type AuthStatus =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'reauth-required'
  | 'startup-error'

export type AuthStore = {
  authRequired: boolean
  capabilities: AppCapabilities | null
  error: string | null
  isSubmitting: boolean
  mode: 'server' | 'desktop' | null
  preferences: Record<string, unknown>
  retryAfterSeconds: number | null
  status: AuthStatus
  user: AppUser | null
  bootstrap: () => Promise<BootstrapResponse>
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  sessionExpired: (reason?: 'unauthorized' | 'csrf-invalid') => void
}

let clearAccountData: ((preferences?: Record<string, unknown>) => void) | null = null
let refreshAccountData: (() => Promise<void>) | null = null
export function buildStartupDiagnostic(): string {
  const state = useAuthStore.getState()
  return JSON.stringify(
    {
      apiBaseUrl: apiBaseUrl() || 'same-origin',
      error: state.error,
      mode: state.mode,
      occurredAt: new Date().toISOString(),
      userAgent: typeof navigator === 'undefined' ? 'unavailable' : navigator.userAgent,
    },
    null,
    2,
  )
}

export function configureUserSessionReset(
  clear: ((preferences?: Record<string, unknown>) => void) | null,
) {
  clearAccountData = clear
}

export function configureUserSessionRefresh(refresh: (() => Promise<void>) | null) {
  refreshAccountData = refresh
}

export async function refreshAuthenticatedAccountData(): Promise<BootstrapResponse> {
  const result = await fetchBootstrap()
  useAuthStore.setState({
    authRequired: result.authRequired,
    capabilities: result.capabilities,
    error: null,
    mode: result.mode,
    preferences: result.preferences,
    status: 'authenticated',
    user: result.user,
  })
  if (refreshAccountData) await refreshAccountData()
  return result
}

function secureLoginMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429 || error.code === 'auth_locked') {
      return 'Sign-in is temporarily unavailable. Wait for the countdown or contact your administrator.'
    }
    if (error.status === 401) return 'The username or password is incorrect.'
  }
  return 'Unable to sign in right now. Check the connection and try again.'
}

function isSameAccount(user: AppUser | null, username: string): boolean {
  return Boolean(
    user && user.username.trim().toLocaleLowerCase() === username.trim().toLocaleLowerCase(),
  )
}
export const useAuthStore = create<AuthStore>((set, get) => ({
  authRequired: false,
  capabilities: null,
  error: null,
  isSubmitting: false,
  mode: null,
  preferences: {},
  retryAfterSeconds: null,
  status: 'loading',
  user: null,
  bootstrap: async () => {
    set({ error: null, isSubmitting: false, retryAfterSeconds: null, status: 'loading' })
    try {
      const result = await fetchBootstrap()
      set({
        authRequired: result.authRequired,
        capabilities: result.capabilities,
        error: null,
        isSubmitting: false,
        mode: result.mode,
        preferences: result.preferences,
        retryAfterSeconds: null,
        status: result.user || !result.authRequired ? 'authenticated' : 'unauthenticated',
        user: result.user,
      })
      return result
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        set({
          authRequired: true,
          error: null,
          isSubmitting: false,
          retryAfterSeconds: error.retryAfterSeconds,
          status: 'unauthenticated',
          user: null,
        })
      } else {
        const message =
          error instanceof Error ? error.message : 'Unable to connect to the Calendar API.'
        set({ error: message, isSubmitting: false, status: 'startup-error', user: null })
      }
      throw error
    }
  },
  login: async (username, password) => {
    const previous = get()
    const recovering = previous.status === 'reauth-required' && previous.user !== null
    if (recovering && !isSameAccount(previous.user, username)) {
      const confirmed =
        typeof globalThis.confirm !== 'function' ||
        globalThis.confirm(
          'Signing in as a different account clears the current account data and all unsaved drafts. Continue?',
        )
      if (!confirmed) return
    }

    set({
      error: null,
      isSubmitting: true,
      retryAfterSeconds: null,
      ...(recovering ? {} : { status: 'loading' as const }),
    })
    try {
      await loginRequest(username, password)
      const result = await fetchBootstrap()
      if (!result.user) throw new Error('The authenticated bootstrap did not include a user.')
      const resumedSameAccount = recovering && previous.user?.id === result.user.id
      if (!resumedSameAccount) clearAccountData?.(result.preferences)
      set({
        authRequired: result.authRequired,
        capabilities: result.capabilities,
        error: null,
        isSubmitting: false,
        mode: result.mode,
        preferences: result.preferences,
        retryAfterSeconds: null,
        status: 'authenticated',
        user: result.user,
      })
      if (resumedSameAccount && refreshAccountData) {
        try {
          await refreshAccountData()
        } catch {
          set({
            error:
              'Signed in, but some server data could not be refreshed. Retry the affected view.',
          })
        }
      }
    } catch (error) {
      clearApiSessionCredentials()
      set({
        error: secureLoginMessage(error),
        isSubmitting: false,
        retryAfterSeconds: error instanceof ApiError ? error.retryAfterSeconds : null,
        status: recovering ? 'reauth-required' : 'unauthenticated',
        user: recovering ? previous.user : null,
      })
      throw error
    }
  },
  logout: async () => {
    set({ error: null, isSubmitting: true })
    try {
      await logoutRequest()
      abortApiRequests({ clearCsrf: true })
      clearAccountData?.()
      set({
        capabilities: null,
        error: null,
        isSubmitting: false,
        preferences: {},
        retryAfterSeconds: null,
        status: 'unauthenticated',
        user: null,
      })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        abortApiRequests({ clearCsrf: true })
        clearAccountData?.()
        set({
          capabilities: null,
          error: null,
          isSubmitting: false,
          preferences: {},
          retryAfterSeconds: null,
          status: 'unauthenticated',
          user: null,
        })
        return
      }
      set({
        error:
          'Sign out failed. The server session may still be active; check the connection and retry.',
        isSubmitting: false,
        status: get().status === 'reauth-required' ? 'reauth-required' : 'authenticated',
      })
      throw error
    }
  },
  sessionExpired: (reason = 'unauthorized') => {
    const current = get()
    abortApiRequests({ clearCsrf: true })
    if (!current.authRequired) {
      set({
        error: 'The local backend authorization was lost. Restart the backend and retry.',
        isSubmitting: false,
        status: 'startup-error',
      })
      return
    }
    if (current.user) {
      set({
        error:
          reason === 'csrf-invalid'
            ? 'Your security token expired. Sign in again; unsaved work is still here.'
            : 'Your session expired. Sign in again; unsaved work is still here.',
        isSubmitting: false,
        retryAfterSeconds: null,
        status: 'reauth-required',
      })
      return
    }
    set({
      error: null,
      isSubmitting: false,
      retryAfterSeconds: null,
      status: 'unauthenticated',
      user: null,
    })
  },
}))
