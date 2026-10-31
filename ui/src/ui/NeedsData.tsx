import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataBase } from '@carbon/icons-react'
import { ApiErrorNotification, AppError, EmptyState } from '@reiq/ui'
import { Button, InlineLoading } from '@reiq/ui/carbon'
import { useBuild } from '../lib/useView'
import { ViewSkeleton } from './ViewShell'

/** The gate every analysis screen sits behind: no data yet, still being prepared, failed, or ready. */
export function NeedsData({ base, building, children }: { base: 'eda' | 'forecast'; building: { what: string; how: string }; children: ReactNode }) {
  const build = useBuild(base)
  const go = useNavigate()
  if (build.isPending) return <ViewSkeleton />
  if (build.isError) return <ApiErrorNotification error={build.error} fallbackTitle="Could not check whether your data is loaded" onRetry={() => void build.refetch()} />
  const b = build.data
  if (b.state === 'no_data') {
    return (
      <EmptyState icon={DataBase} title="Your data is not loaded yet" message="Load your files in Data setup, then come back to this screen."
        action={<Button kind="primary" size="md" onClick={() => go('/data')}>Go to Data setup</Button>} />
    )
  }
  if (b.state === 'error') {
    return <ApiErrorNotification error={new AppError(b.error ?? b.message ?? 'The build stopped.')} fallbackTitle={`Could not ${building.what}`} onRetry={() => void build.refetch()} />
  }
  if (b.state === 'building') {
    return (
      <div className="stack-05">
        <InlineLoading status="active" description={b.message || building.what} />
        <p className="supporting">{building.how}</p>
        <ViewSkeleton />
      </div>
    )
  }
  return <>{children}</>
}
