import { useEffect, useRef, type ReactNode } from 'react'

import Button from './Button'

type ModalProps = {
  isOpen: boolean
  title: string
  children: ReactNode
  onClose: () => void
}

export default function Modal({ isOpen, title, children, onClose }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (isOpen) return

    function rememberFocus(event: FocusEvent) {
      if (!(event.target instanceof HTMLElement)) return

      const eventDialog = event.target.closest('[role=dialog]')
      if (eventDialog) {
        if (
          event.relatedTarget instanceof HTMLElement &&
          !eventDialog.contains(event.relatedTarget)
        ) {
          previouslyFocusedRef.current = event.relatedTarget
        }
        return
      }

      previouslyFocusedRef.current = event.target
    }

    document.addEventListener('focusin', rememberFocus)
    return () => document.removeEventListener('focusin', rememberFocus)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const previouslyFocused = previouslyFocusedRef.current
    const dialog = dialogRef.current
    const focusableSelector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]',
    ].join(',')

    if (
      dialog &&
      !(document.activeElement instanceof HTMLElement && dialog.contains(document.activeElement))
    ) {
      const initialFocus = dialog.querySelector<HTMLElement>(focusableSelector)
      if (initialFocus) initialFocus.focus()
      else dialog.focus()
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab' || !dialog) return

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => element.tabIndex >= 0,
      )
      if (!focusable.length) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      aria-label={title}
      ref={dialogRef}
      tabIndex={-1}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6"
      role="dialog"
    >
      <div className="flex max-h-[calc(100vh-3rem)] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          <Button aria-label="Close modal" onClick={onClose} variant="ghost">
            Close
          </Button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
