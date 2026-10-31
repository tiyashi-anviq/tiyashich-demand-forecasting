import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  readStoredPreference,
  resolveTheme,
  storePreference,
  systemPrefersDark,
  ThemeContext,
  type ThemePreference,
} from './useTheme'

/** Owns the one theme mechanism: the `theme` attribute on <html>. Writing that
 *  attribute is what flips brand-kit's --reiq-* dark block and Carbon's own
 *  --cds-* tokens together -- there is no second flag, class or media query.
 *  The user picks light, dark or system; the theme is derived from that pick
 *  and, for system, from the OS setting. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference)
  const [systemDark, setSystemDark] = useState(systemPrefersDark)
  const theme = resolveTheme(preference, systemDark)

  useEffect(() => {
    document.documentElement.setAttribute('theme', theme)
  }, [theme])

  const setPreference = useCallback((value: ThemePreference) => {
    storePreference(value)
    setPreferenceState(value)
  }, [])

  // The OS setting, live. Only changes the screen while the pick is 'system'.
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const query = matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  // Cross-tab / cross-module sync. The theme cookie is shared by every module
  // (see THEME_COOKIE_NAME's own doc comment) and IS visible cross-port, but
  // there is no cookie equivalent of the `storage` event - nothing tells this
  // tab a cookie changed while it sat in the background. The poll is what makes
  // "pick a theme in module A" reach an already-open module B live; focus and
  // visibilitychange on top of it make an active switch back feel instant.
  useEffect(() => {
    function resync() {
      const stored = readStoredPreference()
      if (stored !== preference) setPreferenceState(stored)
    }
    window.addEventListener('focus', resync)
    document.addEventListener('visibilitychange', resync)
    const interval = window.setInterval(resync, 1000)
    return () => {
      window.removeEventListener('focus', resync)
      document.removeEventListener('visibilitychange', resync)
      window.clearInterval(interval)
    }
  }, [preference])

  const value = useMemo(() => ({ theme, preference, setPreference }), [theme, preference, setPreference])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
