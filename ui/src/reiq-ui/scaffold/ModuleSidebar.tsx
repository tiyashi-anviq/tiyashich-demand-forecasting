import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import './ModuleSidebar.css'

const SCROLLBAR_FADE_MS = 800

/** The rail's own chrome. A single flat scrolling body: section labels and rows
 *  are SIBLINGS, not nested groups, so one gap owns the whole vertical rhythm
 *  and a section cannot drift half a step out of line with its neighbour.
 *
 *  This component owns every inset inside the rail; the shell column owns none. */
export function ModuleSidebar({ label, children }: { label: string; children: ReactNode }) {
	const [scrolling, setScrolling] = useState(false)
	const timer = useRef<number | undefined>(undefined)

	const onScroll = useCallback(() => {
		setScrolling(true)
		window.clearTimeout(timer.current)
		timer.current = window.setTimeout(() => setScrolling(false), SCROLLBAR_FADE_MS)
	}, [])

	useEffect(() => () => window.clearTimeout(timer.current), [])

	return (
		<nav
			aria-label={label}
			/* Scrollbar auto-hide is driven by a real scroll event, deliberately NOT
			   by :hover - a mouse resting over the rail should not summon a
			   scrollbar. The class swaps the thumb's colour rather than its display,
			   so the track keeps its width and nothing shifts when it appears. */
			className={`module-sidebar thin-scroll${scrolling ? ' module-sidebar-scrolling' : ''}`}
			onScroll={onScroll}
		>
			{children}
		</nav>
	)
}
