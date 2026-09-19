import { useEffect, useRef, type ReactNode } from 'react'

interface DrawerProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

/**
 * A generic, accessible right-side drawer — the WHY drawer's shell. Follows the WAI-ARIA dialog
 * pattern: focus moves into the drawer on open, Tab/Shift+Tab is trapped within it, Escape closes
 * it, and focus is restored to whatever triggered it on close. Content-agnostic on purpose — every
 * WHY-drawer content type (headline metric, risk-register row, criticality item) renders through
 * this same shell.
 */
function Drawer({ isOpen, onClose, title, children }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isOpen) return
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null

    const panel = panelRef.current
    const firstFocusable = panel?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)[0]
    ;(firstFocusable ?? panel)?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const focusables = panel?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (!focusables || focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocusedRef.current?.focus()
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="why-drawer-title"
        tabIndex={-1}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-sm overflow-y-auto border-l border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-xl"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="why-drawer-title" className="text-sm font-semibold text-[var(--text-primary)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </>
  )
}

export default Drawer
