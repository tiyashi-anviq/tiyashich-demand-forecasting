import { useTheme } from '../../theme/useTheme'
import logoDark from './anviq-logo.svg'
import logoLight from './anviq-logo-white.svg'
import './BrandMark.css'

/** AnvIQ's own wordmark. The brand handed over two fixed SVGs in public/brand -- a dark-green
 *  mark for light backgrounds and a white one for dark -- rather than a single-color asset a CSS
 *  filter could recolor, so this swaps `src` on the theme attribute instead of trying to derive
 *  one file from the other. Reads `useTheme()` directly rather than a CSS attribute selector:
 *  every other theme-aware decision in a component body already goes through this hook, and an
 *  `<img>` has no `content` value CSS could swap anyway. */
export function BrandMark({ className }: { className?: string }) {
  const { theme } = useTheme()
  const src = theme === 'g100' ? logoLight : logoDark
  return <img src={src} alt="AnvIQ" className={`brand-mark${className ? ` ${className}` : ''}`} />
}
