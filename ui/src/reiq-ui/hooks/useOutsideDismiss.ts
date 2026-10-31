import { useEffect, type RefObject } from 'react'

/** The one dismissal idiom for every hand-built popover: close on a click
 *  outside the root element, and close on Escape.
 *
 *  Listeners are registered only while open and removed on close, so a closed
 *  popover costs nothing. */
export function useOutsideDismiss(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof Node && ref.current && !ref.current.contains(target)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('click', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('click', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [ref, open, onClose])
}
