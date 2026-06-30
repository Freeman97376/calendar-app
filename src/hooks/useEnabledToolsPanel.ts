import { useUIStore } from '../store/uiStore'

export function useEnabledToolsPanel() {
  const activeProjectId = useUIStore((state) => state.activeEnabledToolProjectId)
  const close = useUIStore((state) => state.closeEnabledToolsPanel)
  const isOpen = useUIStore((state) => state.activeWorkspacePanel === 'enabled-tools')
  const open = useUIStore((state) => state.openEnabledToolsPanel)
  const setActiveProjectId = useUIStore((state) => state.setActiveEnabledToolProjectId)
  const toggle = useUIStore((state) => state.toggleEnabledToolsPanel)

  return { activeProjectId, close, isOpen, open, setActiveProjectId, toggle }
}
