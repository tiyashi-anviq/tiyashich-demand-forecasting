import { useEffect, useRef, type ReactNode } from 'react'
import { Close } from '@carbon/icons-react'
import './SettingsDrawer.css'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface SettingsDrawerProps {
  open: boolean
  title: string
  /** Optional, as in the Svelte source. The compare copy had made it required;
   *  nothing needed it to be. */
  subtitle?: string
  onClose: () => void
  children: ReactNode
  /** A pinned bar below the scrolling body - actions that must stay in view
   *  while the controls scroll (e.g. name + Save). Omitted, the panel is just
   *  header + body, exactly as before. */
  footer?: ReactNode
}

/** A right-anchored slide-over: land-feasibility (Simulation, Compare) and the
 *  manufacturing forecast's scenario drawer.
 *
 *  ONE copy. The Svelte source already had exactly one of these - both pages
 *  imported the same SimulationSettingsDrawer.svelte - and the two React copies
 *  had already drifted apart on shape and on behaviour. This is that one
 *  component, ported from the Svelte original, so the merge resolves every
 *  divergence toward the source rather than toward either copy:
 *
 *   - FOCUS CONTAINMENT stays. Tab wraps at both ends so it cannot walk out of
 *     the dialog into the page behind the scrim, and Escape is handled in the
 *     CAPTURE phase with stopPropagation so an outer listener does not also act
 *     on the same key. The compare copy had neither, and focused the panel
 *     itself rather than its first focusable child.
 *   - The close control is the hand-rolled 2.5rem button the source styles, not
 *     Carbon's ghost IconButton the compare copy substituted - the header's
 *     geometry is built around it.
 *
 *  Hand-rolled rather than Carbon's Modal: this is a full-height side panel with
 *  its own single scroll container, and Carbon has no side variant. Everything a
 *  dialog owes is still here - role, label, Escape, backdrop dismiss, focus
 *  containment and focus restore (CONVENTIONS section 7). */
export function SettingsDrawer({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
}: SettingsDrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const restoreFocusTo = useRef<HTMLElement | null>(null)

  // Escape needs the LATEST onClose, but the effect below must not re-run when
  // its identity changes - so it reads the callback through a ref instead of
  // depending on it.
  //
  // This is not a micro-optimisation, it was a real bug. Every call site passes
  // an inline arrow (`onClose={() => setDrawerOpen(false)}`), which is a new
  // function on every render, so with onClose in the dependency array the effect
  // below re-ran on EVERY RENDER OF THE HOST PAGE - including the one caused by
  // typing a digit into a field inside the drawer. Its cleanup restored focus to
  // whatever had it when the effect last ran, and its body then focused the
  // panel's FIRST focusable child, so a weight or radius input lost focus after
  // each keystroke and had to be clicked again to type the next digit. Six pages
  // mount this drawer; all six had it.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return

    // Whatever opened the drawer gets focus back when it closes - otherwise
    // focus lands on <body> and keyboard users restart from the top of the page.
    restoreFocusTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const panel = panelRef.current
      if (!panel) return
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.offsetParent !== null,
      )
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      // Wrap at both ends so Tab can never walk out of the dialog into the page
      // behind the scrim.
      if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      restoreFocusTo.current?.focus()
    }
    // `open` ONLY. Adding onClose back re-introduces the focus-stealing bug
    // described above; it is read through onCloseRef precisely so it does not
    // belong here.
  }, [open])

  if (!open) return null

  return (
    <>
      {/* Presentational: the real dismiss affordance a keyboard user needs is
          Escape and the labelled close button, both of which exist. */}
      <div className="settings-drawer-backdrop" role="presentation" onClick={onClose} />

      <div
        ref={panelRef}
        className="settings-drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="settings-drawer-header">
          <div className="settings-drawer-header-text">
            <h2 className="settings-drawer-title">{title}</h2>
            {subtitle ? <p className="settings-drawer-subtitle">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className="settings-drawer-close"
            aria-label={`Close ${title}`}
            onClick={onClose}
          >
            <Close size={20} />
          </button>
        </div>

        {/* The ONE scroll container inside the panel. The weights accordion
            deliberately has none of its own - three nested scrollbars for one
            interaction is what this replaced. */}
        <div className="settings-drawer-body thin-scroll thin-scroll-strong">{children}</div>

        {/* A pinned action bar, outside the scroll region, so Save stays reachable
            while the controls scroll. */}
        {footer ? <div className="settings-drawer-footer">{footer}</div> : null}
      </div>
    </>
  )
}
