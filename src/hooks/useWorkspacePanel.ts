import { useUIStore, type WorkspacePanelId } from '../store/uiStore'

export type { WorkspacePanelId }

export function useWorkspacePanel() {
  const activePanel = useUIStore((state) => state.activeWorkspacePanel)
  const canGoBack = useUIStore(
    (state) => state.workspacePanelHistory.length > 0 || state.activeWorkspacePanel !== 'home',
  )
  const close = useUIStore((state) => state.closeWorkspacePanel)
  const focusPanel = useUIStore((state) => state.focusWorkspacePanel)
  const goBack = useUIStore((state) => state.goBackWorkspacePanel)
  const mainMode = useUIStore((state) => state.workspaceMainMode)
  const openPanel = useUIStore((state) => state.openWorkspacePanel)
  const showCalendar = useUIStore((state) => state.showWorkspaceCalendar)

  return {
    activePanel,
    canGoBack,
    close,
    focusPanel,
    goBack,
    mainMode,
    openPanel,
    showCalendar,
  }
}
