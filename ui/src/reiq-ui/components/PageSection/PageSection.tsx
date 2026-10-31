import { useId, type ReactNode } from 'react'
import './PageSection.css'

/** A titled region of a page: a real <section> labelled by its own heading, so the
 *  page has a navigable outline rather than a run of styled divs. */
export function PageSection({
	title,
	note,
	aside,
	children,
}: {
	title: string
	note?: ReactNode
	/** Controls that belong to this section, right-aligned on the heading row. */
	aside?: ReactNode
	children: ReactNode
}) {
	const headingId = useId()

	return (
		<section className="page-section" aria-labelledby={headingId}>
			<div className="page-section-head">
				<h2 className="page-section-title" id={headingId}>
					{title}
				</h2>
				{aside ? <div className="page-section-aside">{aside}</div> : null}
			</div>
			{note ? <p className="page-section-note">{note}</p> : null}
			{children}
		</section>
	)
}
