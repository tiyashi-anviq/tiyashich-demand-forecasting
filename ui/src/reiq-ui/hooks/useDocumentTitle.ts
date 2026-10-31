import { useEffect } from 'react'

/** Sets the tab title for a route: "<page> | <suffix>", or just the suffix when the
 *  page IS the module's home and passes the module's own name. Pages pass their own
 *  name only - the suffix is added here, once, so it can never appear twice. The
 *  browser tab and the history entry are the only labels a user has when several
 *  modules are open.
 *
 *  `suffix` is the app's name (each app keeps it in its config/env.ts). */
export function useDocumentTitle(title: string | null, suffix: string): void {
  useEffect(() => {
    if (!title) return
    const previous = document.title
    document.title = title === suffix ? title : `${title} | ${suffix}`
    return () => {
      document.title = previous
    }
  }, [title, suffix])
}
