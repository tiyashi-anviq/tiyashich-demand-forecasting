import type { ReactNode } from 'react'
import type { CarbonIconType } from '@carbon/icons-react'
import './EmptyState.css'

/** 'brand' for an absence - nothing here yet, no results, pick something.
 *  'danger' for a failure the user did not ask for: a green badge on a crash
 *  screen reads as reassurance, which is the wrong sentence. */
export type EmptyStateTone = 'brand' | 'danger'

/** A flat square badge, not a bare glyph. Exported on its own because a caller
 *  with a plain overlay, rather than a full EmptyState, must still read as the
 *  same pattern - two hand-matched copies would drift. */
export function EmptyStateBadge({
	icon: Icon,
	tone = 'brand',
}: {
	icon: CarbonIconType
	tone?: EmptyStateTone
}) {
	return (
		<span className={`empty-state-badge empty-state-badge-${tone}`} aria-hidden="true">
			<Icon size={24} />
		</span>
	)
}

/** The one "nothing here" shape. Never a bare "No results" string: the message
 *  states the specific cause and the action resolves it.
 *
 *  `inline` is the shorter variant for an absence inside a card. Its title is a
 *  paragraph, not a heading: a card already has its own heading. */
export function EmptyState({
	icon,
	title,
	message,
	tone = 'brand',
	action,
	inline = false,
	children,
}: {
	icon: CarbonIconType
	title: string
	message?: string
	tone?: EmptyStateTone
	action?: ReactNode
	inline?: boolean
	/** Anything that belongs BELOW the action - a collapsed technical detail, a
	 *  support hint. Separate from `action` so it does not join the button row. */
	children?: ReactNode
}) {
	const Title = inline ? 'p' : 'h2'
	return (
		<div className={`empty-state${inline ? ' empty-state-inline' : ''}`}>
			<EmptyStateBadge icon={icon} tone={tone} />
			<Title className="empty-state-title">{title}</Title>
			{message ? <p className="empty-state-message">{message}</p> : null}
			{action ? <div className="empty-state-action">{action}</div> : null}
			{children}
		</div>
	)
}
