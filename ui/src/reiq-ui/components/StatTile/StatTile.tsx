import type { ReactNode } from 'react'
import type { CarbonIconType } from '@carbon/icons-react'
import { Tile } from '../../carbon'
// The kpi-* classes. Imported here so the tile is styled in any app that uses it.
import '../../styles/surfaces.css'
import { IconBadge } from '../IconBadge/IconBadge'
import type { TokenColorPair } from '../../brand/tokenColors'

/** The KPI / stat tile. The value is a ReactNode so a tile can carry a Tag where
 *  the number would be, without a second near-duplicate component. */
export function StatTile({
	icon,
	colors,
	label,
	value,
	sublabel,
}: {
	icon?: CarbonIconType
	colors?: TokenColorPair
	/** Usually a string; a node where the label carries its own help (an info toggletip). */
	label: ReactNode
	value: ReactNode
	sublabel?: ReactNode
}) {
	return (
		<Tile className="kpi-tile">
			{icon ? <IconBadge icon={icon} className="kpi-icon" colors={colors} /> : null}
			<span className="kpi-label">{label}</span>
			<span className="kpi-value">{value}</span>
			{sublabel ? <span className="kpi-sub">{sublabel}</span> : null}
		</Tile>
	)
}
