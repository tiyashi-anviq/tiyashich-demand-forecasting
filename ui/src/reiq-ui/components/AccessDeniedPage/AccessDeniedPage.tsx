import { Locked } from '@carbon/icons-react'
import { useAuth } from '../../auth/AuthContext'
import { Button } from '../../carbon'
import { hubUrl } from '../../config'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { EmptyState } from '../EmptyState/EmptyState'

/** What a signed-in user sees when their role does not cover this module - the API answered 403,
 *  which AuthContext turned into a single app-wide state (see core/api/httpClientFactory's
 *  onAccessDenied).
 *
 *  Deliberately NOT a redirect to the login page: the session is valid, so signing in again
 *  produces the same 403, and the app would bounce between here and the login form forever. The
 *  only two moves that can actually help are offered instead - go back to hub and open something
 *  this account does have, or ask for the module to be granted.
 *
 *  Built from the same EmptyState as the module's empty and failure states, so a refusal reads
 *  with the same weight as every other full-pane message rather than as a louder screen of its
 *  own. `danger`, not `brand`: the green badge is the vocabulary for an absence the user can fill
 *  in themselves, and this is not one. */
export function AccessDeniedPage({
  message,
  moduleLabel,
}: {
  /** The service's own sentence, shown verbatim. */
  message: string
  /** The module's name, e.g. "Demand Forecasting". Also the tab-title suffix. */
  moduleLabel: string
}) {
  const { user } = useAuth()
  useDocumentTitle('No access', moduleLabel)

  return (
    <EmptyState
      icon={Locked}
      tone="danger"
      title={`You do not have access to ${moduleLabel}`}
      // The service's own sentence, verbatim: it is the side that knows WHICH module was refused
      // and why, and a second sentence written here would only be a guess at it.
      message={message}
      action={
        // A plain link, not a router Link: hub is a separate static build at the origin root
        // (hubUrl), not a route inside this app - the same reason the breadcrumb links it
        // as an anchor. Carbon's Button renders an <a> when given href.
        <Button size="md" kind="tertiary" href={hubUrl}>
          Back to hub
        </Button>
      }
    >
      {user ? (
        // Which account was refused, because "access denied" on a machine with two accounts
        // signed in at different times is otherwise unactionable - and accounts are created by an
        // administrator now, so naming who to ask is the whole next step.
        <p className="empty-state-message">
          Signed in as {user.email}. Ask an administrator to grant this account access to{' '}
          {moduleLabel}.
        </p>
      ) : null}
    </EmptyState>
  )
}
