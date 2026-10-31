import type { ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { Filter } from '@carbon/icons-react'
import { ApiErrorNotification, EmptyState, type AppError } from '@reiq/ui'
import { Button, SkeletonPlaceholder, SkeletonText } from '@reiq/ui/carbon'

/** The shape of a screen while it loads: stat tiles, then two chart cards, the same boxes the loaded screen draws. */
export function ViewSkeleton() {
  return (
    <div className="stack-05" role="status" aria-busy="true" aria-label="Loading this view">
      <div className="kpi-grid">
        {[0, 1, 2, 3].map((i) => <SkeletonPlaceholder key={i} className="skeleton-tile" />)}
      </div>
      <div className="grid g2">
        <div className="card"><SkeletonText heading width="40%" /><SkeletonPlaceholder className="skeleton-chart" /></div>
        <div className="card"><SkeletonText heading width="40%" /><SkeletonPlaceholder className="skeleton-chart" /></div>
      </div>
    </div>
  )
}

/** The five data states for one fetching surface, in the handbook's order:
 *  loading, error, empty, loaded, and a refetch that keeps the old values and pulses. */
export function ViewShell<T extends { empty?: boolean }>({
  query, errorTitle, emptyTitle = 'Nothing matches these filters', emptyMessage = 'Widen the family, region, channel or period.', onClear, children,
}: {
  query: UseQueryResult<T, AppError>
  errorTitle: string
  emptyTitle?: string
  emptyMessage?: string
  onClear?: () => void
  children: (data: T) => ReactNode
}) {
  if (query.isPending) return <ViewSkeleton />
  if (query.isError && !query.data) {
    return <ApiErrorNotification error={query.error} fallbackTitle={errorTitle} onRetry={() => void query.refetch()} />
  }
  const d = query.data as T
  if (d.empty) {
    return (
      <EmptyState icon={Filter} title={emptyTitle} message={emptyMessage}
        action={onClear ? <Button kind="primary" size="md" onClick={onClear}>Clear filters</Button> : undefined} />
    )
  }
  return (
    <div className={`stack-05${query.isFetching ? ' pulse-refresh' : ''}`} aria-busy={query.isFetching}>
      {query.isError && <ApiErrorNotification error={query.error} fallbackTitle="Could not refresh this view" onRetry={() => void query.refetch()} />}
      {children(d)}
    </div>
  )
}
