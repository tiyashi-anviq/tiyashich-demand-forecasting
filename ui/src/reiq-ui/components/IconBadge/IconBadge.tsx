import type { CarbonIconType } from '@carbon/icons-react'
import { cssColors, type TokenColorPair } from '../../brand/tokenColors'

/** The one "icon with real visual weight" vocabulary: a flat square tinted swatch.
 *
 *  `colors` is a token PAIR resolved to var(--reiq-*), so the badge follows a live
 *  theme toggle. It takes the icon as a PROP: resolving an icon through a lookup and
 *  assigning it to a capitalised local inside a rendering component makes React treat
 *  it as a new component type on every render. */
export function IconBadge({
	icon: Icon,
	className,
	colors,
	size = 16,
}: {
	icon: CarbonIconType
	className: string
	colors?: TokenColorPair
	size?: number
}) {
	const resolved = colors ? cssColors(colors) : undefined
	return (
		<span
			className={className}
			aria-hidden="true"
			style={resolved ? { background: resolved.bg, color: resolved.color } : undefined}
		>
			<Icon size={size} />
		</span>
	)
}
