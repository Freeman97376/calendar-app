import { useUIStore } from '../store/uiStore'

export function useActiveToolOnboardingPanel() {
  return {
    clear: useUIStore((state) => state.clearActiveToolOnboarding),
    seed: useUIStore((state) => state.pendingActiveToolOnboarding),
    start: useUIStore((state) => state.startActiveToolOnboarding),
  }
}
