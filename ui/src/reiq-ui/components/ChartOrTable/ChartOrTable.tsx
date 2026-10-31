import { useState, type ReactNode } from 'react'
import {
  ContentSwitcher,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../carbon'
import './ChartOrTable.css'

/** A chart with its Chart / Table switch (the handbook's rule for every chart card): the same
 *  numbers as rows, for anyone who needs the exact value or reads with a screen reader. An
 *  in-place choice, so ContentSwitcher. The table keeps the chart's own height and scrolls inside
 *  itself, so switching never resizes the card. Units belong in the headers.
 *
 *  `heading` is the card's title, put on the same row as the switch (left and right of one line)
 *  instead of leaving the switch alone on a row of its own above the chart. */
export function ChartOrTable({
  chart,
  headers,
  rows,
  label,
  heading,
  inlineTools,
}: {
  chart: ReactNode
  headers: string[]
  rows: (string | number)[][]
  label: string
  heading?: ReactNode
  /** The chart has its own toolbar on and an empty title: share one row with it, so the heading and
   *  the switch sit level with the chart's tools instead of a header row above them. */
  inlineTools?: boolean
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  return (
    <div
      className={
        inlineTools && view === 'chart' ? 'chart-or-table chart-or-table-inline' : 'chart-or-table'
      }
    >
      <div
        className={heading ? 'chart-or-table-head' : 'chart-or-table-head chart-or-table-head-end'}
      >
        {heading ? <h3 className="card-title">{heading}</h3> : null}
        <div className="chart-or-table-controls">
          <ContentSwitcher
            size="sm"
            selectedIndex={view === 'chart' ? 0 : 1}
            onChange={({ index }) => setView(index === 1 ? 'table' : 'chart')}
          >
            <Switch text="Chart" />
            <Switch text="Table" />
          </ContentSwitcher>
        </div>
      </div>
      {view === 'chart' ? (
        chart
      ) : (
        <div className="table-scroll thin-scroll chart-or-table-body">
          <Table size="sm" aria-label={label}>
            <TableHead>
              <TableRow>
                {headers.map((header, index) => (
                  <TableHeader key={header} className={index === 0 ? undefined : 'cell-num'}>
                    {header}
                  </TableHeader>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <TableCell key={cellIndex} className={cellIndex === 0 ? undefined : 'cell-num'}>
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
