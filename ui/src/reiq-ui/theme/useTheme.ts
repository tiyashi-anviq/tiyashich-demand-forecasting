import { createContext, useContext } from 'react'

/** The two themes this app ships. These are Carbon's own theme names, which is
 *  what lets ONE attribute drive both layers: brand-kit keys its dark values on
 *  :root[theme='g100'], and design/theme/carbon-theme-tokens.scss re-emits
 *  Carbon's g100 tokens on the same selector. */
export type AppTheme = 'g10' | 'g100'

/** What the user picked in the top bar. 'system' follows the OS light/dark
 *  setting live; it is also the default until the user picks. Stored in the
 *  same cookie as the theme names, so index.html's pre-paint guard (which
 *  only knows g10/g100) treats 'system' like "nothing stored": follow the OS. */
export type ThemePreference = AppTheme | 'system'

/** Shared with every other standalone module's copy of this file - one theme
 *  preference across the whole app, not five independent ones.
 *
 *  A COOKIE, not localStorage: localStorage is scoped by the full origin,
 *  INCLUDING PORT, so it cannot cross land-feasibility's :3002 to hub's
 *  :3000 in local dev - each port is a fully separate store. A cookie with no
 *  explicit Domain is host-only, and a cookie's host match ignores port
 *  entirely, so the same 'reiq_theme' cookie set by any module on
 *  http://localhost:<any port> is already readable by every other one - no
 *  wildcard domain, no server round trip, dev and the single-origin Caddy
 *  production deployment alike. */
export const THEME_COOKIE_NAME = 'reiq_theme'

const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export interface ThemeContextValue {
  /** The theme on screen now. */
  theme: AppTheme
  /** The user's choice: a fixed theme, or follow the OS. */
  preference: ThemePreference
  /** Persists, and reaches every open module (see THEME_COOKIE_NAME). */
  setPreference: (value: ThemePreference) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>')
  return value
}

/** No escaping/regex needed: this app only ever writes THEME_COOKIE_NAME
 *  itself as one of possibly several `; `-separated pairs, and a cookie name
 *  is never a substring of another cookie's name here. */
function readCookie(name: string): string | null {
  for (const pair of document.cookie.split('; ')) {
    const separator = pair.indexOf('=')
    if (separator === -1) continue
    if (pair.slice(0, separator) !== name) continue
    return decodeURIComponent(pair.slice(separator + 1))
  }
  return null
}

/** No cookie, or one this code does not know, reads as 'system'. */
export function readStoredPreference(): ThemePreference {
  try {
    const v = readCookie(THEME_COOKIE_NAME)
    return v === 'g10' || v === 'g100' ? v : 'system'
  } catch {
    // Blocked or unavailable site data (private browsing, a locked-down
    // profile) must not crash the app -- fall through to the OS preference.
    return 'system'
  }
}

export function storePreference(value: ThemePreference): void {
  try {
    // path=/ so every route in the module reads it back, not just whichever
    // one happened to write it. No Domain attribute - see THEME_COOKIE_NAME's
    // own comment for why that is the point, not an oversight. No Secure
    // attribute so this still round-trips over the plain-http local dev
    // servers; the value is a UI preference, not something worth gating
    // behind https for.
    document.cookie = `${THEME_COOKIE_NAME}=${encodeURIComponent(value)}; path=/; max-age=${THEME_COOKIE_MAX_AGE_SECONDS}; samesite=lax`
  } catch {
    // As above: the user can still toggle for this tab even if it can't persist.
  }
}

export function systemPrefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): AppTheme {
  if (preference !== 'system') return preference
  return systemDark ? 'g100' : 'g10'
}
