import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { ToastNotification } from '../../carbon'
import './ToastProvider.css'

// Carbon's timeout for a toast that dismisses itself.
const AUTO_DISMISS_MS = 5000

/** Carbon's toast: short, time-based news about a process. Success and info fade
 *  on their own; warning and error stay until closed, so a failure is never
 *  missed. A failure inside the current view belongs inline, next to the part
 *  that failed; an error toast is for one with no place on screen. */
export type ToastKind = 'success' | 'info' | 'warning' | 'error'

const STAYS_OPEN: ReadonlySet<ToastKind> = new Set(['warning', 'error'])

export interface ToastAction {
  label: string
  href: string
}

export interface ToastMessage {
  id: number
  kind: ToastKind
  title: string
  subtitle?: string
  action?: ToastAction
}

interface ToastContextValue {
  showToast: (kind: ToastKind, title: string, subtitle?: string, action?: ToastAction) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback(
    (kind: ToastKind, title: string, subtitle?: string, action?: ToastAction) => {
      const id = nextId.current++
      setToasts((current) => [...current, { id, kind, title, subtitle, action }])
      if (!STAYS_OPEN.has(kind)) window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-container" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <ToastNotification
            key={toast.id}
            kind={toast.kind}
            title={toast.title}
            subtitle={toast.subtitle}
            onClose={() => {
              dismiss(toast.id)
              return false
            }}
          >
            {toast.action ? (
              <a className="toast-action" href={toast.action.href}>
                {toast.action.label}
              </a>
            ) : null}
          </ToastNotification>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- context + provider stay co-located
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
