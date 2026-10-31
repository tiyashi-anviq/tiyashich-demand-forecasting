import { useContext, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Apps, ArrowLeft } from '@carbon/icons-react'
import { Breadcrumb, BreadcrumbItem } from '../../carbon'
import { hubUrl } from '../../config'
import { useIsMobile } from '../../hooks/useIsMobile'
import { PageBarSlotContext } from '../../scaffold/ModuleShell'
import { sentenceCase } from '../../utils/sentenceCase'
import './ModulePageHeader.css'

export interface Crumb {
	label: string
	href?: string
}

export interface ModulePageHeaderProps {
	/** First breadcrumb segment. Omitted on hub's own pages, the top of the tree.
	 *  With moduleHref undefined it renders as an
	 *  uppercase eyebrow instead of a link - checked via `!== undefined`, not
	 *  truthiness: this standalone app's routes mount at the root, so its own
	 *  module root is legitimately '/', and a page may legitimately pass ''. */
	moduleLabel?: string
	moduleHref?: string
	/** Segments between the module and this page. */
	crumbs?: Crumb[]
	title: string
	/** Overrides the final crumb where it must differ from the title. */
	currentCrumbLabel?: string
	description?: string
	/** false only for a page that fills a fixed, non-scrolling viewport. Otherwise, as on
	 *  carbondesignsystem.com: the header scrolls away, and once its title is gone a compact bar
	 *  (title and actions) pins to the top of the pane. A toolbar pins under that bar. */
	sticky?: boolean
	backHref?: string
	backLabel?: string
	/** Button cluster on the title row. */
	actions?: ReactNode
	/** A full-width row under the title, for page-level filters. */
	toolbar?: ReactNode
}

/** The one page-header shape for every page, so a page's actions sit in one
 *  identical place everywhere instead of each page inventing a placement.
 *  Outside a ModuleShell (no page bar slot) a sticky header pins whole instead. */
export function ModulePageHeader({
	moduleLabel,
	moduleHref,
	crumbs = [],
	title,
	currentCrumbLabel,
	description,
	sticky = true,
	backHref,
	backLabel,
	actions,
	toolbar,
}: ModulePageHeaderProps) {
	const currentLabel = currentCrumbLabel ?? title
	const isMobile = useIsMobile()

	// The heading is cut to one line, and whether it is actually cut depends on the
	// window, not on the name's length - so it is measured rather than guessed, and
	// re-measured as the window changes.
	const titleRef = useRef<HTMLHeadingElement>(null)
	const [titleCut, setTitleCut] = useState(false)
	useEffect(() => {
		const el = titleRef.current
		if (!el) return
		let live = true
		const measure = () => {
			if (live) setTitleCut(el.scrollWidth > el.clientWidth + 1)
		}
		measure()
		const observer = new ResizeObserver(measure)
		observer.observe(el)
		// The heading's BOX does not change when the webfont swaps in, so the observer
		// never fires for it - but the text it has to hold does, by enough to decide a
		// borderline title.
		void document.fonts?.ready.then(measure)
		return () => {
			live = false
			observer.disconnect()
		}
	}, [title])

	// The compact bar shows once the title has scrolled under it. Observed rather than tied to
	// a scroll offset: the header's height above the title varies by page. But only on a page
	// long enough to scroll the whole header card away: on a short one the bar would sit on the
	// card's still-visible lower half, a white strip under a white bar.
	const slot = useContext(PageBarSlotContext)
	const compact = sticky && slot !== null && !isMobile
	const barRef = useRef<HTMLDivElement>(null)
	const headerRef = useRef<HTMLElement>(null)
	const pinToolbar = compact && Boolean(toolbar)
	const [stuck, setStuck] = useState(false)
	useEffect(() => {
		const el = titleRef.current
		const bar = barRef.current
		if (!compact || !el || !bar) return
		const pane = slot.parentElement
		const header = headerRef.current
		const clearsHeader = () => {
			if (!pane || !header || pinToolbar) return true
			const headerBottom = header.getBoundingClientRect().bottom - pane.getBoundingClientRect().top + pane.scrollTop
			return pane.scrollHeight - pane.clientHeight >= headerBottom - bar.offsetHeight
		}
		const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting && clearsHeader()), {
			root: pane,
			rootMargin: `-${bar.offsetHeight}px 0px 0px 0px`,
		})
		observer.observe(el)
		return () => {
			observer.disconnect()
			setStuck(false)
		}
	}, [compact, slot, pinToolbar])

	// A toolbar stays in reach: the header pins at minus the toolbar's own offset, so only the
	// toolbar shows, right under the compact bar. Measured, as the rows above it vary by page.
	const toolbarRef = useRef<HTMLDivElement>(null)
	const [toolbarOffset, setToolbarOffset] = useState(0)
	useEffect(() => {
		const header = headerRef.current
		const row = toolbarRef.current
		if (!pinToolbar || !header || !row) return
		const measure = () => setToolbarOffset(row.offsetTop)
		measure()
		const observer = new ResizeObserver(measure)
		observer.observe(header)
		return () => observer.disconnect()
	}, [pinToolbar])

	const stickyClass = !sticky
		? ''
		: !compact
			? ' module-page-header-sticky'
			: pinToolbar
				? ' module-page-header-hero module-page-header-sticky module-page-header-pin-toolbar'
				: ' module-page-header-hero'
	const toolbarStyle = pinToolbar
		? ({ '--module-page-header-toolbar-offset': `${toolbarOffset}px` } as CSSProperties)
		: undefined

	return (
		<header ref={headerRef} className={`module-page-header${stickyClass}`} style={toolbarStyle}>
			{compact
				? createPortal(
						// inert while hidden: no tab stops on a bar nobody can see.
						<div
							ref={barRef}
							className={`module-page-bar${stuck ? ' module-page-bar-stuck' : ''}`}
							inert={!stuck}
						>
							<p className="module-page-bar-title">{title}</p>
							{actions ? <div className="module-page-header-actions">{actions}</div> : null}
						</div>,
						slot,
					)
				: null}
			{backHref || moduleLabel ? (
				<div className="module-page-header-crumb-row">
					{backHref ? (
						<Link className="module-page-header-back" to={backHref}>
							<ArrowLeft size={16} />
							<span>{backLabel ?? 'Back'}</span>
						</Link>
					) : null}

					{moduleHref !== undefined ? (
						// size="sm" on mobile only (Carbon's own prop) - the same full chain as desktop,
						// just smaller, not a different shape.
						<Breadcrumb
							noTrailingSlash
							size={isMobile || compact ? 'sm' : 'md'}
							className="module-page-header-breadcrumb"
						>
							{/* sm beside the tall header too: the crumb is a way out, not a heading.
							    A genuine cross-app exit rather than a route inside this app, so it is a
							    plain <a>. Icon only, everywhere: the module name right after it says
							    where you are; the label reaches assistive tech through aria-label and
							    sighted users through the native tooltip. */}
							<BreadcrumbItem>
								<a
									className="module-page-header-hub-crumb"
									href={hubUrl}
									aria-label="All modules"
									title="All modules"
								>
									<Apps size={16} />
								</a>
							</BreadcrumbItem>
							<BreadcrumbItem>
								{/* moduleHref || '/': react-router's Link treats to="" as
							    relative-to-current rather than "go home". */}
								<Link to={moduleHref || '/'}>{moduleLabel && sentenceCase(moduleLabel)}</Link>
							</BreadcrumbItem>
							{crumbs.map((crumb) =>
								crumb.href ? (
									<BreadcrumbItem key={crumb.label}>
										<Link to={crumb.href}>{crumb.label}</Link>
									</BreadcrumbItem>
								) : (
									<BreadcrumbItem key={crumb.label}>{crumb.label}</BreadcrumbItem>
								),
							)}
							<BreadcrumbItem isCurrentPage>{currentLabel}</BreadcrumbItem>
						</Breadcrumb>
					) : moduleLabel ? (
						<p className="module-page-header-eyebrow">{moduleLabel}</p>
					) : null}
				</div>
			) : null}

			<div className="app-title-row">
				{/* A cut heading is otherwise only readable in the browser tab. A native
				    `title` rather than a Carbon Tooltip: a heading is not focusable, and
				    making it focusable purely to carry a tooltip would add a tab stop
				    that leads nowhere. */}
				<h1 ref={titleRef} className="module-page-title" title={titleCut ? title : undefined}>
					{title}
				</h1>
				{actions ? <div className="module-page-header-actions">{actions}</div> : null}
			</div>

			{description ? <p className="module-page-subtitle">{description}</p> : null}
			{toolbar ? (
				<div ref={toolbarRef} className="module-page-header-toolbar">
					{toolbar}
				</div>
			) : null}
		</header>
	)
}
