import { buildStartupDiagnostic, useAuthStore } from '../store/authStore'

export function useAuth() {
  return {
    authRequired: useAuthStore((state) => state.authRequired),
    bootstrap: useAuthStore((state) => state.bootstrap),
    capabilities: useAuthStore((state) => state.capabilities),
    isSubmitting: useAuthStore((state) => state.isSubmitting),
    error: useAuthStore((state) => state.error),
    login: useAuthStore((state) => state.login),
    logout: useAuthStore((state) => state.logout),
    mode: useAuthStore((state) => state.mode),
    retryAfterSeconds: useAuthStore((state) => state.retryAfterSeconds),
    preferences: useAuthStore((state) => state.preferences),
    startupDiagnostic: buildStartupDiagnostic,
    status: useAuthStore((state) => state.status),
    user: useAuthStore((state) => state.user),
  }
}
