import { useAuthStore } from '../store/authStore'

export function useAuth() {
  return {
    authRequired: useAuthStore((state) => state.authRequired),
    bootstrap: useAuthStore((state) => state.bootstrap),
    capabilities: useAuthStore((state) => state.capabilities),
    error: useAuthStore((state) => state.error),
    login: useAuthStore((state) => state.login),
    logout: useAuthStore((state) => state.logout),
    mode: useAuthStore((state) => state.mode),
    preferences: useAuthStore((state) => state.preferences),
    status: useAuthStore((state) => state.status),
    user: useAuthStore((state) => state.user),
  }
}
