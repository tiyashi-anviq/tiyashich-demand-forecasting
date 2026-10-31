import { useEffect, useRef, useSyncExternalStore } from 'react'
import { layout } from '../brand/tokens'
import { useModuleRailState } from './ModuleRailContext'

/** Under --reiq-breakpoint-max (a laptop) the page cannot fit the left bar, itself and a right
 *  pane. While `open` there, the left bar is folded to icons; when it closes or the window grows
 *  past it, the bar unfolds again, but only if this folded it. Live, not only at the click: a
 *  window narrowed with the pane already open folds too. Used by the module chat pane and by a
 *  Talk to Data story's chat. */
const NARROW = `(max-width: ${parseFloat(layout.breakpoint.max) - 0.02}px)`

function subscribeNarrow(onChange: () => void): () => void {
  const query = window.matchMedia(NARROW)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function isNarrow(): boolean {
  return window.matchMedia(NARROW).matches
}

export function useFoldRailWhile(open: boolean): void {
  const narrow = useSyncExternalStore(subscribeNarrow, isNarrow, () => false)
  const rail = useModuleRailState()
  const folded = useRef(false)

  // The rail's state lives in the module's layout, not here, so this keeps it in step: an effect
  // is the one way to act on another component's state when ours or the window changes.
  useEffect(() => {
    if (!rail) return
    if (open && narrow) {
      if (!rail.collapsed && !folded.current) {
        folded.current = true
        rail.toggle()
      }
    } else if (folded.current) {
      folded.current = false
      if (rail.collapsed) rail.toggle()
    }
  }, [open, narrow, rail])
}
