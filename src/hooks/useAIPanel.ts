import { useUIStore } from '../store/uiStore'

export function useAIPanel() {
  const isOpen = useUIStore((state) => state.activeWorkspacePanel === 'ai')
  const toggle = useUIStore((state) => state.toggleAIPanel)

  return { isOpen, toggle }
}
