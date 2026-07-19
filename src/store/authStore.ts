import { create } from 'zustand'

import type { AppCapabilities, AppUser, BootstrapResponse } from '../domain/types'
import { fetchBootstrap, loginRequest, logoutRequest } from '../services/appApiClient'

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error'

export type AuthStore = {
  authRequired: boolean
  capabilities: AppCapabilities | null
  error: string | null
  mode: 'server' | 'desktop' | null
  preferences: Record<string, unknown>
  status: AuthStatus
  user: AppUser | null
  bootstrap: () => Promise<BootstrapResponse>
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  sessionExpired: () => void
}

let resetUserSession: ((preferences?: Record<string, unknown>) => void) | null = null

export function configureUserSessionReset(reset: ((preferences?: Record<string, unknown>) => void) | null) {
  resetUserSession = reset
}

export const useAuthStore = create<AuthStore>((set) => ({
  authRequired: false,
  capabilities: null,
  error: null,
  mode: null,
  preferences: {},
  status: 'loading',
  user: null,
  bootstrap: async () => {
    set({ error: null, status: 'loading' })
    try {
      const result = await fetchBootstrap()
      set({
        authRequired: result.authRequired,
        capabilities: result.capabilities,
        error: null,
        mode: result.mode,
        preferences: result.preferences,
        status: result.user || !result.authRequired ? 'authenticated' : 'unauthenticated',
        user: result.user,
      })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to connect to the Calendar API.'
      set({ error: message, status: 'error', user: null })
      throw error
    }
  },
  login: async (username, password) => {
    set({ error: null, status: 'loading' })
    try {
      await loginRequest(username, password)
      const result = await fetchBootstrap()
      resetUserSession?.(result.preferences)
      set({
        capabilities: result.capabilities,
        error: null,
        preferences: result.preferences,
        status: 'authenticated',
        user: result.user,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in.'
      set({ error: message, status: 'unauthenticated', user: null })
      throw error
    }
  },
  logout: async () => {
    try {
      await logoutRequest()
    } finally {
      resetUserSession?.()
      set({ capabilities: null, error: null, preferences: {}, status: 'unauthenticated', user: null })
    }
  },
  sessionExpired: () => {
    resetUserSession?.()
    set({
      capabilities: null,
      error: 'Your session expired. Please sign in again.',
      preferences: {},
      status: 'unauthenticated',
      user: null,
    })
  },
}))
