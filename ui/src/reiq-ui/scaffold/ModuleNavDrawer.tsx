import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { Close } from '@carbon/icons-react'
import './ModuleNavDrawer.css'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface ModuleNavDrawerProps {
  open: boolean
  onClose: () => void
  ariaLabel: string
  children: ReactNode
  /** 'left' (default) for primary navigation - the rail. 'right' for a
   *  supplementary panel (e.g. product-mix's own filter rail), matching
   *  SettingsDrawer's convention. */
  anchor?: 'left' | 'right'
  /** false when `children` already renders its own close affordance (e.g.
   *  ProductMixFilterRail's own header) - avoids a second, redundant close
   *  button stacked on top of it. */
  showClose?: boolean
  /** A `--reiq-*` size token (e.g. `var(--reiq-size-filter-rail)`) for a
   *  panel that isn't the rail's own width - the panel's desktop width is
   *  the only correct default otherwise, since it holds the same content. */
  width?: string
}

/** The mobile overlay for a module's own in-page rail (ModuleShell's
 *  `sidebar`, product-mix's own nav column, or its independent filter rail).
 *
 *  Shares SettingsDrawer's accessibility internals (focus containment,
 *  Escape in the capture phase, focus restore) rather than being a second,
 *  independently-written implementation of the same contract - but is a
 *  separate component because it has no title/subtitle/footer of its own:
 *  the wrapped content supplies its own heading (and, for a panel that
 *  already has one, its own close button via `showClose={false}`). */
export function ModuleNavDrawer({
  open,
  onClose,
  ariaLabel,
  children,
  anchor = 'left',
  showClose = true,
  width,
}: ModuleNavDrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const restoreFocusTo = useRef<HTMLElement | null>(null)

  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return

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
  }, [open])

  if (!open) return null

  return (
    <>
      <div className="module-nav-drawer-backdrop" role="presentation" onClick={onClose} />
      <div
        ref={panelRef}
        className="module-nav-drawer-panel"
        data-anchor={anchor}
        style={width ? ({ '--module-nav-drawer-width': width } as CSSProperties) : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
      >
        {showClose ? (
          <div className="module-nav-drawer-header">
            <button
              type="button"
              className="module-nav-drawer-close"
              aria-label={`Close ${ariaLabel}`}
              onClick={onClose}
            >
              <Close size={20} />
            </button>
          </div>
        ) : null}
        <div className="module-nav-drawer-body">{children}</div>
      </div>
    </>
  )
}
