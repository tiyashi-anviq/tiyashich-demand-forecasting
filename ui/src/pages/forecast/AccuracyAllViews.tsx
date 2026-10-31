/* eslint-disable @typescript-eslint/no-explicit-any */
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tile } from '@reiq/ui/carbon'
import { fmtN, fmtPct } from '../../lib/format'
import { queryOf, type Filters } from '../../lib/filters'
import { useView } from '../../lib/useView'

const w = (r: any, h: string) => (r?.[h]?.wape === null || r?.[h]?.wape === undefined ? null : (r[h].wape as number))
const p = (n: number | null) => (n === null ? '–' : fmtPct(n, 1))

/** Model error (WAPE) on the test months for every view at once: national, each product family, each region, each channel. */
export default function AccuracyAllViews({ f }: { f: Filters }) {
  const q = useView<any>('forecast', 'vintages', queryOf(f, undefined, {}, false))
  const d = q.data
  if (!d || d.empty) return null
  const groups: { level: string; rows: any[] }[] = [
    { level: 'National', rows: [d.national] },
    { level: 'Product family', rows: d.by_family ?? [] },
    { level: 'Region', rows: d.by_region ?? [] },
    { level: 'Channel', rows: d.by_channel ?? [] },
  ].filter((g) => g.rows.length)
  return (
    <Tile className="card stack-05" aria-label="Model error for every view">
      <span className="card-heading">
        <span className="card-title">Model accuracy across every view</span>
        <span className="footnote">WAPE on the test months (Oct 2025 to Sep 2026), which the model never saw. Lower is better. Each row adds up its own series month by month.</span>
      </span>
      <div className="table-scroll thin-scroll">
        <Table size="md" aria-label="WAPE by view">
          <TableHead>
            <TableRow>
              <TableHeader>View</TableHeader>
              <TableHeader>Name</TableHeader>
              <TableHeader className="cell-num">Units in test months</TableHeader>
              <TableHeader className="cell-num">M1 WAPE (%)</TableHeader>
              <TableHeader className="cell-num">M2 WAPE (%)</TableHeader>
              <TableHeader className="cell-num">M3 WAPE (%)</TableHeader>
              <TableHeader className="cell-num">Last year&apos;s number, WAPE (%)</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {groups.flatMap((g) => g.rows.map((r: any, i: number) => (
              <TableRow key={`${g.level}-${r.label}`}>
                <TableCell>{i === 0 ? <strong>{g.level}</strong> : ''}</TableCell>
                <TableCell>{g.level === 'National' ? 'Whole selection' : r.label}</TableCell>
                <TableCell className="cell-num">{fmtN(r.units)}</TableCell>
                <TableCell className="cell-num">{p(w(r, 'M1'))}</TableCell>
                <TableCell className="cell-num">{p(w(r, 'M2'))}</TableCell>
                <TableCell className="cell-num">{p(w(r, 'M3'))}</TableCell>
                <TableCell className="cell-num">{p(w(r, 'last_year'))}</TableCell>
              </TableRow>
            )))}
          </TableBody>
        </Table>
      </div>
      <p className="footnote">M1, M2 and M3 are forecasts made 1, 2 and 3 months before the month they predict. WAPE is the sum of the absolute monthly misses divided by the units ordered. Small families and channels have few units, so their error swings more.</p>
    </Tile>
  )
}
