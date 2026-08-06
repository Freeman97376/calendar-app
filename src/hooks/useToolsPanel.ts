import { useUIStore } from '../store/uiStore'

export function useToolsPanel() {
  const activeToolId = useUIStore((state) => state.activeToolId)
  const close = useUIStore((state) => state.closeToolsPanel)
  const isOpen = useUIStore((state) => state.activeWorkspacePanel === 'tools')
  const open = useUIStore((state) => state.openToolsPanel)
  const setActiveToolId = useUIStore((state) => state.setActiveToolId)
  const toggle = useUIStore((state) => state.toggleToolsPanel)

  return { activeToolId, close, isOpen, open, setActiveToolId, toggle }
}
