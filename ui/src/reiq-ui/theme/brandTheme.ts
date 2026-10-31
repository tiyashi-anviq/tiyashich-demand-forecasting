import { useTheme, type AppTheme } from './useTheme'

/** brand-kit's `themed(path, theme)` takes 'light' | 'dark'; this app's theme
 *  state is Carbon's own 'g10' | 'g100'. One mapping, in one place, so a second
 *  copy cannot drift and start reading light tokens in dark mode.
 *
 *  Only for values CSS cannot reach - Leaflet options, Carbon Charts config,
 *  canvas. In a stylesheet always use var(--reiq-*) instead, which follows the
 *  theme attribute on its own. */
export type BrandTheme = 'light' | 'dark'

export function toBrandTheme(theme: AppTheme): BrandTheme {
  return theme === 'g100' ? 'dark' : 'light'
}

/** The live brand-kit theme name. Re-renders on toggle, which is what keeps a
 *  JS-read token following the theme instead of freezing at whichever one was
 *  active when the component first mounted. */
export function useBrandTheme(): BrandTheme {
  const { theme } = useTheme()
  return toBrandTheme(theme)
}
