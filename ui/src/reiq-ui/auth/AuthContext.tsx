import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { authEnabled } from '../config'
import { useAccessDenied } from './accessDenied'
import { fetchSession } from './authApi'
import { loginHref } from './loginHref'
import type { AuthUser } from './types'

/** `'disabled'` is distinct from `'loading'`/`'anonymous'`: it means the
 *  VITE_AUTH_ENABLED toggle is off, so no /me call was ever made, and
 *  it's what tells the top bar to render nothing rather than a permanent
 *  "not signed in" notice. `'anonymous'` is transient here - see the redirect
 *  effect below, it never reaches a render. */
export type AuthStatus = 'disabled' | 'loading' | 'authenticated' | 'anonymous' | 'error'

interface AuthContextValue {
  user: AuthUser | null
  status: AuthStatus
  /** The API's own sentence once any call has come back 403, null until then. Separate from
   *  `status`, not another member of it: a denied user IS authenticated - the session is valid,
   *  it just does not cover this module - and folding the two would lose the distinction the
   *  whole 401/403 split exists to keep. Never cleared: a role is not going to change inside one
   *  page load, and re-running the call that was refused only earns a second refusal. */
  accessDenied: string | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Enforces sign-in, mirroring every other standalone module's AuthContext shape - this app has
 *  no login/logout of its own. A visitor with no valid session (GET /me came back null) is
 *  bounced straight to auth-ui's login, `redirect` pointing back at this exact URL, before
 *  anything here renders. `status` answers "am I signed in" purely from what GET /me reports; it
 *  never inspects a token, because there is none this app can read.
 *
 *  It also owns the OTHER half of that answer: `accessDenied`, set when any API call comes back
 *  403 (signed in, but this role does not cover this module). The two sit together because they
 *  are one question with two failure modes, and because only one of them may end in a redirect -
 *  see AccessDeniedPage for why sending a denied user to the login form is a loop.
 *
 *  On by default: one origin means the session cookie is simply attached to /auth/api/me, with
 *  no cross-site cookie work to wait on. VITE_AUTH_ENABLED=false turns it off for local work
 *  without auth-api; while off, this never calls /me and never redirects. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>(authEnabled ? 'loading' : 'disabled')

  useEffect(() => {
    if (!authEnabled) return
    let cancelled = false
    void fetchSession().then((result) => {
      if (cancelled) return
      setUser(result)
      setStatus(result ? 'authenticated' : 'anonymous')
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (status === 'anonymous') {
      window.location.assign(loginHref())
    }
  }, [status])

  // "Who is this, and what does that let them open" is one question, so its second half is
  // served beside the first. The app's API client reports a 403 (reportAccessDenied).
  const accessDenied = useAccessDenied()
  const value = useMemo(() => ({ user, status, accessDenied }), [user, status, accessDenied])

  // Nothing at all until the session answers: drawing the page first showed a signed-out
  // visitor a flash of it (hub's tiles) before the redirect to login. 'anonymous' is the moment
  // between the answer and that redirect, so it stays blank too.
  const settled = status !== 'loading' && status !== 'anonymous'
  return <AuthContext.Provider value={value}>{settled ? children : null}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- context + provider + hook stay co-located
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
