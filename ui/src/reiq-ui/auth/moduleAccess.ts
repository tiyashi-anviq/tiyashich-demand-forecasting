/** The one place a "this module is closed to your account" answer lands.
 *
 *  Caddy gates /demand-forecasting/api/* with forward_auth against the auth service's
 *  GET /me?module=demand-forecasting, which answers 403 plus its own sentence when the session
 *  is valid but the role does not cover this module (auth_service.require_module_access).
 *  That is not a failure of the call that happened to hit it - every other call would fail
 *  the same way - so it is recorded here once, from the HTTP layer, and AuthProvider swaps
 *  the app for the access-denied view. A route or a query added later inherits that with no
 *  code of its own.
 *
 *  A module-scope store rather than context: the reporter is core/api/httpClientFactory.ts,
 *  which is plain TypeScript and has no React tree to write into.
 */

/** The first 403's message, or null while nothing has been denied. FIRST, not last: once the
 *  view is up every in-flight query is still racing to report the same thing, and the message
 *  must not flicker between them. */
let denial: string | null = null
const listeners = new Set<() => void>()

/** Used when a 403 carried no readable body at all - a gateway error page, an empty response.
 *  The service's own sentence names the module and what to do about it, so it is always
 *  preferred; this is only here so the view never renders an empty paragraph. */
const FALLBACK_MESSAGE =
  'Your account does not have access to this module. Ask an administrator if you think this is wrong.'

export function reportAccessDenied(message?: string): void {
  if (denial) return
  denial = message?.trim() || FALLBACK_MESSAGE
  listeners.forEach((listener) => listener())
}

/** getSnapshot for useSyncExternalStore - a stable reference, so React is not re-rendered
 *  forever by a new object each read. */
export function accessDeniedMessage(): string | null {
  return denial
}

export function subscribeAccessDenied(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
