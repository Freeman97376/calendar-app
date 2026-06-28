import { useUIStore } from '../store/uiStore'

export function useAIPanel() {
  const isOpen = useUIStore((state) => state.aiPanelOpen)
  const toggle = useUIStore((state) => state.toggleAIPanel)

  return { isOpen, toggle }
}
