import { useUIStore } from '../store/uiStore'

export function useTodoPanel() {
  const isOpen = useUIStore((state) => state.todoPanelOpen)
  const close = useUIStore((state) => state.closeTodoPanel)
  const toggle = useUIStore((state) => state.toggleTodoPanel)

  return { close, isOpen, toggle }
}
