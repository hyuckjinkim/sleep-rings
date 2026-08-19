import { useEffect } from 'react'
import type { RefObject } from 'react'

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Makes an element with role="dialog" behave like one.
 *
 * `role="dialog"` alone is a label, not behaviour: without this the popover opened but focus stayed
 * on the orb behind it, Tab walked into the background UI, and Escape never fired because no focused
 * node was inside the dialog. Keyboard users could place sounds but could not reach volume, lock,
 * orbit speed or delete at all (.omc/qa4/ux.md HIGH-1/HIGH-2).
 *
 * Moves focus in on open, cycles Tab inside, and restores focus to the opener on close.
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, onClose: () => void): void {
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const opener = document.activeElement as HTMLElement | null

    root.querySelector<HTMLElement>(FOCUSABLE)?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !root) return
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      // Wrap instead of letting Tab escape into the UI behind the dialog.
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault()
        lastItem.focus()
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault()
        firstItem.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      opener?.focus?.()
    }
  }, [ref, onClose])
}
