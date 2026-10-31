import { loginUrl } from '../config'

/** Where modules/auth/ui's login sends the user back to. This tab's own current path, not a
 *  fixed one - so signing in and returning lands back on whatever page (a specific plot, a
 *  specific parcel) the user started from. Shared by AppTopBar's manual "sign in" link and
 *  AuthContext's automatic redirect for an anonymous visitor.
 *
 *  A PATH, never window.location.href: every module is served from the same origin under its own
 *  prefix now, so auth-ui rejects anything that is not relative (isAllowedRedirect in
 *  modules/auth/ui/src/auth/api.ts, mirroring app/oauth.py) - an absolute URL would silently
 *  bounce the user to the hub instead of back here. */
export function loginHref(): string {
  const { pathname, search, hash } = window.location
  const redirectTo = `${pathname}${search}${hash}`
  // auth-ui's LoginPage reads `redirect`, not `redirectTo` - see
  // modules/auth/ui/src/auth/pages/LoginPage.tsx.
  return `${loginUrl}?redirect=${encodeURIComponent(redirectTo)}`
}
