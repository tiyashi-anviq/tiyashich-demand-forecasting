import { PageSection } from '@reiq/ui'
import type { Workspace } from '../../types'
import { fmtDate, fmtInt } from '../../lib/format'
import { DataCard, type Col } from '../../ui/DataCard'
import { StatRow } from '../../ui/StatRow'

type Kind = { label: string; n: number; rows: number }
type Fix = { label: string; n: number }

const KIND_COLS: Col<Kind>[] = [
  { header: 'Kind of data', cell: (r) => r.label, sort: (r) => r.label.toLowerCase() },
  { header: 'Tables', num: true, cell: (r) => r.n, sort: (r) => r.n },
  { header: 'Rows', num: true, cell: (r) => fmtInt(r.rows), sort: (r) => r.rows },
]
const FIX_COLS: Col<Fix>[] = [
  { header: 'What was cleaned', cell: (r) => r.label },
  { header: 'Count', num: true, cell: (r) => fmtInt(r.n), sort: (r) => r.n },
]

export default function Done({ ws }: { ws: Workspace }) {
  const tables = ws.tables ?? []
  const fx = ws.fixes
  const rows = tables.reduce((a, t) => a + t.rows, 0)
  const sales = tables.filter((t) => t.type === 'sales' && t.weekly)
  const from = sales.map((t) => t.date_from).filter(Boolean).sort()[0]
  const to = sales.map((t) => t.date_to).filter(Boolean).sort().slice(-1)[0]
  const kinds = new Map<string, Kind>()
  for (const t of tables) {
    const k = kinds.get(t.type) ?? { label: t.type_label, n: 0, rows: 0 }
    k.n += 1; k.rows += t.rows; kinds.set(t.type, k)
  }
  const fixes: Fix[] = (fx ? [
    { label: 'Repeated rows removed', n: fx.duplicates_removed },
    { label: 'Blank cells filled by interpolation', n: fx.blanks_filled },
    { label: 'Place names matched to depot codes', n: fx.locations_resolved },
    { label: 'Rows removed (bad or missing keys)', n: fx.rows_removed },
    { label: 'Spikes marked or capped', n: fx.outliers_flagged + fx.outliers_capped },
    { label: 'Weeks of lost demand estimated', n: fx.demand_estimated },
    { label: 'Promotion weeks separated', n: fx.promo_weeks },
  ] : []).filter((f) => f.n > 0)

  return (
    <div className="stack-05">
      <PageSection title="Loaded and ready for forecasting">
        <StatRow items={[
          { label: 'Tables', value: tables.length },
          { label: 'Rows', value: fmtInt(rows) },
          { label: 'Sales history', value: from ? fmtDate(from) : '', sublabel: to ? `to ${fmtDate(to)}` : 'No weekly sales table found' },
        ]} />
      </PageSection>
      <div className="grid">
        <DataCard id="loaded" title="What is loaded" description={`${tables.length} tables`} cols={KIND_COLS} rows={[...kinds.values()]} itemsLabel="Kinds per page" rowKey={(r) => r.label} />
        {fixes.length > 0 && <DataCard id="cleaned" title="What was cleaned" description="Fixes applied while loading" cols={FIX_COLS} rows={fixes} itemsLabel="Fixes per page" rowKey={(r) => r.label} />}
      </div>
    </div>
  )
}
