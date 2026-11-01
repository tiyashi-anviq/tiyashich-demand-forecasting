/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext, Fragment, useContext } from 'react'
import { InlineNotification, NumberInput, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@reiq/ui/carbon'
import { fmtInt, fmtSigned } from '../../lib/format'
import { Delta } from '../../ui/StatRow'

const gap = (a: number | null | undefined, b: number | null | undefined) => (a !== null && a !== undefined && b ? a / b - 1 : null)
const num = (v: unknown) => (typeof v === 'number' ? v : parseFloat(String(v)))
/** The page's channel and product filters; the grid shows only the matching lines. */
export const LineFilter = createContext<{ channel: string | null; product: string | null; missing: string[] }>({ channel: null, product: null, missing: [] })
export const lineKey = (r: any) => r.key ?? `${r.channel}|${r.sku}`

/** Numbers at the deepest level, in the order they are submitted: region, then channel, then SKU. Each channel (and region) carries a subtotal.
 *  With `editable`, every SKU line has a number box and `draft` holds what has been typed. */
export function LineGrid({ rows: allRows, label, editable: editableIn, draft, onChange, showRegion }: { rows: any[]; label: string; editable: boolean; draft: Record<string, number>; onChange: (k: string, v: number) => void; showRegion: boolean }) {
  const lf = useContext(LineFilter)
  const rows = allRows.filter((r) => (!lf.channel || r.channel === lf.channel || r.channel_name === lf.channel) && (!lf.product || r.sku === lf.product))
  const editable = editableIn && lf.missing.length === 0
  const val = (r: any) => draft[lineKey(r)] ?? r.qty
  const sum = (xs: any[], f: (r: any) => number) => xs.reduce((a, r) => a + (Number.isFinite(f(r)) ? f(r) : 0), 0)
  const regions = [...new Set(rows.map((r) => r.region ?? ''))]
  const total = (xs: any[], head: string, strong = false) => (
    <TableRow className={strong ? 'row-total' : undefined}>
      <TableCell colSpan={showRegion ? 4 : 3}><strong>{head}</strong></TableCell>
      <TableCell className="cell-num"><strong>{fmtInt(sum(xs, (r) => r.model))}</strong></TableCell>
      <TableCell className="cell-num"><strong>{fmtInt(sum(xs, (r) => r.last_year))}</strong></TableCell>
      <TableCell className="cell-num"><strong>{fmtInt(sum(xs, (r) => r.qty))}</strong></TableCell>
      {editable && <TableCell className="cell-num"><strong>{fmtInt(sum(xs, val))}</strong></TableCell>}
      <TableCell className="cell-num"><Delta value={gap(sum(xs, val), sum(xs, (r) => r.model))} text={fmtSigned(gap(sum(xs, val), sum(xs, (r) => r.model)), 1)} /></TableCell>
    </TableRow>
  )
  return (
    <div className="stack-03">
    {editableIn && lf.missing.length > 0 && (
      <InlineNotification kind="warning" lowContrast hideCloseButton title="Numbers can only be entered for one product."
        subtitle={`Choose ${lf.missing.join(', ')} in the filters above. Every number is entered for one region, channel, family and product.`} />
    )}
    <div className="table-scroll thin-scroll">
      <Table size="md" aria-label={label}>
        <TableHead><TableRow>
          {showRegion && <TableHeader>Region</TableHeader>}
          <TableHeader>Channel</TableHeader><TableHeader>SKU</TableHeader><TableHeader>Description</TableHeader>
          <TableHeader className="cell-num">Model (units)</TableHeader><TableHeader className="cell-num">Same month last year (units)</TableHeader>
          <TableHeader className="cell-num">Current number (units)</TableHeader>
          {editable && <TableHeader>Your number (units)</TableHeader>}
          <TableHeader className="cell-num">Against the model (%)</TableHeader>
        </TableRow></TableHead>
        <TableBody>
          {regions.map((rg) => {
            const inRegion = rows.filter((r) => (r.region ?? '') === rg)
            const channels = [...new Set(inRegion.map((r) => r.channel))]
            return (
              <Fragment key={rg}>
                {channels.map((ch) => {
                  const inCh = inRegion.filter((r) => r.channel === ch)
                  return (
                    <Fragment key={ch}>
                      {inCh.map((r) => (
                        <TableRow key={lineKey(r)}>
                          {showRegion && <TableCell>{r.region}</TableCell>}
                          <TableCell>{r.channel_name && r.channel_name !== r.channel ? `${r.channel_name} (${r.channel})` : r.channel}</TableCell>
                          <TableCell>{r.sku}</TableCell><TableCell>{r.description || '–'}</TableCell>
                          <TableCell className="cell-num">{fmtInt(r.model)}</TableCell><TableCell className="cell-num">{fmtInt(r.last_year)}</TableCell>
                          <TableCell className="cell-num">{fmtInt(r.qty)}</TableCell>
                          {editable && <TableCell><NumberInput id={`n-${lineKey(r)}`} size="sm" hideLabel label={`${rg} ${r.channel} ${r.sku} units`} hideSteppers min={0} step={100} value={val(r)} invalid={!Number.isFinite(val(r)) || val(r) < 0} invalidText="Needs a number"
                            onChange={(_e: unknown, { value }: { value: number | string }) => onChange(lineKey(r), num(value))} /></TableCell>}
                          <TableCell className="cell-num"><Delta value={gap(val(r), r.model)} text={fmtSigned(gap(val(r), r.model), 1)} /></TableCell>
                        </TableRow>
                      ))}
                      {total(inCh, `${rg ? `${rg}, ` : ''}${ch} total`)}
                    </Fragment>
                  )
                })}
                {showRegion && regions.length > 1 && total(inRegion, `${rg} total`, true)}
              </Fragment>
            )
          })}
          {total(rows, 'All lines', true)}
        </TableBody>
      </Table>
    </div>
    </div>
  )
}
