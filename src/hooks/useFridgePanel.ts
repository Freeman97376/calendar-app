import { useUIStore } from '../store/uiStore'

export function useFridgePanel() {
  const isOpen = useUIStore((state) => state.fridgePanelOpen)
  const toggle = useUIStore((state) => state.toggleFridgePanel)

  return { isOpen, toggle }
}

