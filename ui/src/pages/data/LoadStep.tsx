import { CheckmarkOutline } from '@carbon/icons-react'
import { ApiErrorNotification, AppError, EmptyState, PageSection } from '@reiq/ui'
import type { Batch, Quality } from '../../types'
import { fmtInt } from '../../lib/format'
import { DataCard, type Col } from '../../ui/DataCard'
import { StatRow } from '../../ui/StatRow'

type Line = { what: string; choice: string }
const COLS: Col<Line>[] = [
  { header: 'Fix', cell: (r) => r.what, sort: (r) => r.what.toLowerCase() },
  { header: 'What happens', cell: (r) => r.choice },
]

/** Plain-language summary of what pressing Load will do. */
export default function LoadStep({ batch, quality, decisions, error }: { batch: Batch; quality: Quality; decisions: Record<string, string>; error: string | null }) {
  const included = batch.groups.filter((g) => g.include && g.type !== 'reference')
  const rows = included.reduce((a, g) => a + g.rows, 0)
  const lines: Line[] = []
  for (const i of quality.issues ?? []) {
    const d = decisions[i.id] ?? i.default
    if (!d || d === 'keep' || !i.actions.length) continue
    lines.push({ what: `${i.title}, ${i.dataset}`, choice: i.actions.find((a) => a.id === d)?.label ?? d })
  }
  const kinds = new Set(included.map((g) => g.type)).size

  return (
    <div className="stack-05">
      <PageSection title="Ready to load" note="Review what will happen. Your original files are not changed.">
        {error ? <ApiErrorNotification error={new AppError(error)} fallbackTitle="Loading did not finish" /> : null}
        <StatRow items={[
          { label: 'Tables loaded', value: included.length, sublabel: `Across ${kinds} kinds of data` },
          { label: 'Rows before cleaning', value: fmtInt(rows) },
          { label: 'Left out', value: batch.groups.length - included.length, sublabel: 'Reference tables' },
        ]} />
      </PageSection>
      {lines.length === 0
        ? <EmptyState inline icon={CheckmarkOutline} title="No fixes will be applied" message="Everything loads as it is." />
        : <DataCard id="fixes" title="Fixes that will be applied" description={`${lines.length} fix${lines.length === 1 ? '' : 'es'}`} cols={COLS} rows={lines} itemsLabel="Fixes per page" rowKey={(r, i) => `${r.what}-${i}`} />}
    </div>
  )
}
