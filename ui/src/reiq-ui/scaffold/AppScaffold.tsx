import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { ChatPaneProvider, useChatPane } from './ChatPaneContext'
import { ModuleRailProvider } from './ModuleRailContext'
import { AppTopBar } from './AppTopBar'
import './AppScaffold.css'

/** The frame every REIQ app sits in: the fixed top bar, then the page body under it.
 *  A module page puts a ModuleShell (left bar + content pane) inside; hub does not.
 *
 *  An app passes data, not markup: its name, any extra top-bar buttons, and its chat pane. */
export function AppScaffold({
  label,
  actions,
  chatPane,
  children,
}: {
  /** The app's name, e.g. "Title Search". Labels the top bar for screen readers. */
  label: string
  /** Extra top-bar controls before the theme switch, e.g. a notification bell. */
  actions?: ReactNode
  /** The module's chat pane (`ChatPane` from @reiq/ui/chat/ChatPane). Given, the top bar gets a
   *  chat button, and the pane opens as a column on the right that narrows the page. A prop
   *  rather than built in: the pane needs TanStack Query and Carbon Charts, which not every
   *  app ships. */
  chatPane?: ReactNode
  children: ReactNode
}) {
  return (
    <ModuleRailProvider>
      <ChatPaneProvider>
        <div className="app-shell">
          <AppTopBar label={label} actions={actions} hasChat={chatPane !== undefined} />
          <Body chatPane={chatPane}>{children}</Body>
        </div>
      </ChatPaneProvider>
    </ModuleRailProvider>
  )
}

function Body({ chatPane, children }: { chatPane?: ReactNode; children: ReactNode }) {
  const pane = useChatPane()
  const [width, setWidth] = useState<number | null>(storedWidth)
  const [dragging, setDragging] = useState(false)
  const aside = useRef<HTMLElement>(null)
  if (chatPane === undefined) return <div className="app-shell-body">{children}</div>

  // The limits are the pane's own CSS min-width and max-width (the two size tokens), read off the
  // element, so they are in the same pixels the browser lays it out in.
  const limits = () => {
    const css = aside.current ? getComputedStyle(aside.current) : null
    const min = parseFloat(css?.minWidth ?? '') || 0
    const max = parseFloat(css?.maxWidth ?? '') || Infinity
    return { min, max }
  }
  const resize = (next: number | null) => {
    const { min, max } = limits()
    const value = next === null ? null : Math.round(Math.min(max, Math.max(min, next)))
    setWidth(value)
    try {
      if (value === null) localStorage.removeItem(WIDTH_KEY)
      else localStorage.setItem(WIDTH_KEY, String(value))
    } catch {
      // Private window or blocked storage: the width still applies until the page closes.
    }
  }
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging) resize(window.innerWidth - event.clientX)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const { min, max } = limits()
    const current = width ?? min
    if (event.key === 'ArrowLeft') resize(current + KEY_STEP)
    else if (event.key === 'ArrowRight') resize(current - KEY_STEP)
    else if (event.key === 'Home') resize(null)
    else if (event.key === 'End') resize(max)
    else return
    event.preventDefault()
  }

  const style = width === null ? undefined : ({ '--app-chat-pane-width': `${width}px` } as CSSProperties)
  return (
    <div className={`app-shell-body app-shell-with-chat${dragging ? ' is-resizing' : ''}`}>
      <div className="app-shell-main">{children}</div>
      {pane?.open && (
        <aside ref={aside} className="app-chat-pane" aria-label="Chat about this module's data" style={style}>
          {/* Drag to widen, up to --reiq-size-chat-panel-max; double-click or Home goes back to the
              default. A focusable separator, so the arrow keys do the same as the mouse. */}
          <div
            className="app-chat-pane-resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize the chat"
            aria-valuenow={width ?? undefined}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => setDragging(false)}
            onPointerCancel={() => setDragging(false)}
            onDoubleClick={() => resize(null)}
            onKeyDown={onKeyDown}
          />
          {chatPane}
        </aside>
      )}
    </div>
  )
}

/* The pane's width: from --reiq-size-chat-panel (the default) to --reiq-size-chat-panel-max.
   Remembered per viewer in this browser, a convenience only. */
const WIDTH_KEY = 'reiq_chat_pane_width'
const KEY_STEP = 32

function storedWidth(): number | null {
  try {
    const value = Number(localStorage.getItem(WIDTH_KEY))
    return value > 0 ? value : null
  } catch {
    return null
  }
}
