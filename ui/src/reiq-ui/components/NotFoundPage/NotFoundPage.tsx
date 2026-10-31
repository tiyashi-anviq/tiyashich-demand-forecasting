import { Link } from 'react-router-dom'
import { Compass } from '@carbon/icons-react'
import { Button } from '../../carbon'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { EmptyState } from '../EmptyState/EmptyState'
import { ModulePageHeader } from '../ModulePageHeader/ModulePageHeader'

/** The catch-all route: a header, then why there is nothing here and the one way
 *  back into the module, which is its home route ("/"). */
export function NotFoundPage({
  moduleLabel,
  message,
  homeLabel,
}: {
  /** The module's name. Labels the header crumb and the tab title. */
  moduleLabel: string
  /** Why the link might be dead, in this module's words. */
  message: string
  /** The home button, e.g. "Go to deals". */
  homeLabel: string
}) {
  useDocumentTitle('Page not found', moduleLabel)

  return (
    <>
      <ModulePageHeader moduleLabel={moduleLabel} moduleHref="/" title="Page not found" />
      <EmptyState
        icon={Compass}
        title="There is no page at this address"
        message={message}
        action={
          <Button size="md" kind="primary" as={Link} to="/">
            {homeLabel}
          </Button>
        }
      />
    </>
  )
}
