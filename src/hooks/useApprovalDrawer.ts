import { useUIStore, type ApprovalDrawerSource } from '../store/uiStore'

export type { ApprovalDrawerSource }

export function useApprovalDrawer() {
  const close = useUIStore((state) => state.closeApprovalDrawer)
  const isOpen = useUIStore((state) => state.approvalDrawerOpen)
  const open = useUIStore((state) => state.openApprovalDrawer)
  const source = useUIStore((state) => state.approvalDrawerSource)

  return { close, isOpen, open, source }
}
