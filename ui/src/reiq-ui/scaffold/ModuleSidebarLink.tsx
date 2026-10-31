import { NavLink } from 'react-router-dom'
import type { CarbonIconType } from '@carbon/icons-react'
import { useRailCollapsed } from './ModuleRailContext'

/** A plain anchor, deliberately NOT Carbon's SideNavLink: styling that back down
 *  to this shape takes about ten overrides of its height, padding, margin, radius
 *  and ::before accent. A plain row was always the target shape. */
export function ModuleSidebarLink({
	href,
	label,
	icon: Icon,
	collapsed: collapsedProp,
	end = false,
}: {
	href: string
	label: string
	icon: CarbonIconType
	/** Defaults to the shell's own state. */
	collapsed?: boolean
	end?: boolean
}) {
	const shellCollapsed = useRailCollapsed()
	const collapsed = collapsedProp ?? shellCollapsed
	return (
		<NavLink
			to={href}
			end={end}
			className={({ isActive }) =>
				`module-sidebar-link${isActive ? ' module-sidebar-link-active' : ''}${
					collapsed ? ' module-sidebar-link-collapsed' : ''
				}`
			}
			/* Kept when collapsed, since the label is the only thing identifying the
			   row once it is icon-only. */
			title={collapsed ? label : undefined}
		>
			<Icon size={16} />
			{collapsed ? null : <span className="module-sidebar-link-label">{label}</span>}
		</NavLink>
	)
}
