import {
  useUIStore,
  type ApprovalDrawerContext,
  type ApprovalDrawerOpenInput,
  type ApprovalDrawerSource,
} from '../store/uiStore'

export type { ApprovalDrawerContext, ApprovalDrawerOpenInput, ApprovalDrawerSource }

export function useApprovalDrawer() {
  const close = useUIStore((state) => state.closeApprovalDrawer)
  const context = useUIStore((state) => state.approvalDrawerContext)
  const isOpen = useUIStore((state) => state.approvalDrawerOpen)
  const open = useUIStore((state) => state.openApprovalDrawer)
  const source = useUIStore((state) => state.approvalDrawerSource)

  return { close, context, isOpen, open, source }
}
