/** How this module hands a brand-kit colour to a consumer.
 *
 *  Every palette in this module (grade bands, category badges, field-kind
 *  badges) stores brand-kit token PATHS, never colour values, and resolves them
 *  through exactly one of the two functions below. Which one is mechanical, not
 *  a judgement call (the brand-kit rules section 2A rule 2):
 *
 *   - a stylesheet, a `style` attribute, anything CSS can reach -> cssColors(),
 *     which yields `var(--reiq-*)` and follows the theme attribute by itself;
 *   - a Leaflet marker option, a Carbon Charts config object, a canvas or SVG
 *     attribute set from JS -> themedColors(pair, useBrandTheme()).
 *
 *  Reading a token through themed() into a `style` attribute "for convenience"
 *  is the regression this split exists to prevent: it freezes at whichever theme
 *  was live when the component mounted.
 */

import { themed } from './tokens'
import type { BrandTheme } from '../theme/brandTheme'

/** A background tint plus the saturated foreground that belongs on it. Always a
 *  matched pair from ONE hue family - never a -fg from one family on a -bg from
 *  another, and never a -bg beside a *-strong semantic token (that combination
 *  has shipped below AA contrast before). */
export interface TokenColorPair {
  colorToken: string
  bgToken: string
}

export interface ResolvedColorPair {
  color: string
  bg: string
}

/** `color.status.orange-fg` -> `var(--reiq-status-orange-fg)`. Mechanical, so a
 *  token path and its custom property cannot drift apart. */
export function cssVarFor(tokenPath: string): string {
  return `var(--reiq-${tokenPath.replace(/^color\./, '').replace(/\./g, '-')})`
}

export function cssColors(pair: TokenColorPair): ResolvedColorPair {
  return { color: cssVarFor(pair.colorToken), bg: cssVarFor(pair.bgToken) }
}

export function themedColors(pair: TokenColorPair, theme: BrandTheme): ResolvedColorPair {
  return { color: themed(pair.colorToken, theme), bg: themed(pair.bgToken, theme) }
}
