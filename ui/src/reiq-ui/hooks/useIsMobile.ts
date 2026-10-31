import { useSyncExternalStore } from 'react'
import { layout } from '../brand/tokens'

const query = `(max-width: ${layout.breakpoint.md})`

function subscribe(callback: () => void) {
  const mql = window.matchMedia(query)
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

function getSnapshot() {
  return window.matchMedia(query).matches
}

/** Reactive, unlike ModuleRailContext's one-time `startsCollapsed()` read: a
 *  button's icon/text state or the rail's inline-vs-drawer rendering should
 *  follow an actual resize/rotation, unlike the rail's *collapsed* state,
 *  which deliberately does not snap shut on someone who opened it and then
 *  resized the window. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
