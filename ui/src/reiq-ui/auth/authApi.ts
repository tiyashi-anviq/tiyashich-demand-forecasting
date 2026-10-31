import axios from 'axios'
import { authApiUrl } from '../config'
import type { AuthUser } from './types'

/** GET /me on the shared auth service (modules/auth/api/app/routers/auth.py)
 *  - called with no `module` query param, it answers `null` for "nobody's
 *  signed in" and a user object otherwise, exactly like every other
 *  standalone module's AuthContext reads it. Degrades to `null` on any
 *  failure (auth-api down, a 5xx from it): a broken session check
 *  must never block this app's own content, it only means the top bar shows
 *  "not signed in". */
export async function fetchSession(): Promise<AuthUser | null> {
  try {
    const response = await axios.get<AuthUser | null>(`${authApiUrl}/me`, {
      withCredentials: true,
    })
    return response.data ?? null
  } catch {
    return null
  }
}

/** POST /logout on the shared auth service - clears the session cookie, and on a Cognito
 *  deployment answers with `logoutUrl`, Cognito's own /logout, which ends the Cognito session too
 *  and then returns the browser to /auth/login. Resolves to where the browser goes next: that URL,
 *  or the caller's own login page when there is none.
 *
 *  Best-effort: a network failure resolves to the fallback rather than throwing, so it never traps
 *  the user in a "can't sign out" state. */
export async function signOut(fallback: string): Promise<string> {
  try {
    const response = await axios.post<{ ok: boolean; logoutUrl?: string }>(
      `${authApiUrl}/logout`,
      null,
      { withCredentials: true },
    )
    return response.data.logoutUrl || fallback
  } catch {
    return fallback
  }
}
