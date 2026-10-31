import { createContext, useContext, type ReactNode } from 'react'
import { ActionableNotification, InlineNotification } from '../../carbon'
import { AppError } from '../../errors/AppError'
import './ApiErrorNotification.css'

/** One failure in words a person can act on: `title` is the headline, `hint` says
 *  what to do next. */
export interface ErrorCopy {
  title: string
  hint: string
}

/** An app's error vocabulary. `api` maps the API body's optional `code` to its
 *  copy; `network` and `timeout` cover a request that never got an answer. */
export interface ApiErrorCopy {
  api: Record<string, ErrorCopy>
  network: ErrorCopy
  timeout: ErrorCopy
}

/** What an app without its own vocabulary says. Each app names its own service in
 *  `network` through ApiErrorCopyProvider. */
const DEFAULT_COPY: ApiErrorCopy = {
  api: {},
  network: {
    title: 'Could not reach the service',
    hint: 'Check your connection, then try again in a moment.',
  },
  timeout: {
    title: 'The request took too long',
    hint: 'Try again in a moment.',
  },
}

const ApiErrorCopyContext = createContext<ApiErrorCopy>(DEFAULT_COPY)

/** Gives every ApiErrorNotification below it the app's own error copy. Set once,
 *  in the app's providers. */
export function ApiErrorCopyProvider({ copy, children }: { copy: ApiErrorCopy; children: ReactNode }) {
  return <ApiErrorCopyContext.Provider value={copy}>{children}</ApiErrorCopyContext.Provider>
}

/** What to say about a failed request. An AppError carries the API's own sentence, and its
 *  optional code picks the headline and next step; anything else never got a readable answer
 *  at all, so it gets the network or timeout copy instead of a raw exception string. */
function describe(
  error: unknown,
  fallbackTitle: string,
  copy: ApiErrorCopy,
): { title: string; subtitle: string } {
  if (error instanceof AppError) {
    const mapped: ErrorCopy | undefined = error.code ? copy.api[error.code] : undefined
    return {
      title: mapped?.title ?? fallbackTitle,
      subtitle: [error.message, mapped?.hint].filter(Boolean).join(' '),
    }
  }
  const fallback = error instanceof DOMException && error.name === 'AbortError' ? copy.timeout : copy.network
  return { title: fallback.title, subtitle: fallback.hint }
}

/** Persistent in-page error. With `onRetry` it becomes an ActionableNotification,
 *  which is Carbon's shape for "an error that has a recovery action" - an inline
 *  notification plus a loose button beside it is the thing this replaces.
 *
 *  `fallbackTitle` should name what failed ("Could not load the deals"); the
 *  default is only a floor. The subtitle always carries the API's sentence and,
 *  when the code is known, the next step. */
export function ApiErrorNotification({
  error,
  fallbackTitle = 'Could not load this data',
  onRetry,
  retryLabel = 'Try again',
  children,
}: {
  error: unknown
  fallbackTitle?: string
  onRetry?: () => void
  retryLabel?: string
  children?: ReactNode
}) {
  const copy = useContext(ApiErrorCopyContext)
  const { title, subtitle } = describe(error, fallbackTitle, copy)

  if (onRetry) {
    return (
      <ActionableNotification
        kind="error"
        lowContrast
        hideCloseButton
        title={title}
        subtitle={subtitle}
        actionButtonLabel={retryLabel}
        onActionButtonClick={onRetry}
        className="notification-fill"
      >
        {children}
      </ActionableNotification>
    )
  }

  return (
    <InlineNotification
      kind="error"
      lowContrast
      hideCloseButton
      role="alert"
      title={title}
      subtitle={subtitle}
      className="notification-fill"
    >
      {children}
    </InlineNotification>
  )
}
