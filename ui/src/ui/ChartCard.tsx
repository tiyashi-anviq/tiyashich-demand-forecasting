import { Info } from './Info'
import type { ReactNode } from 'react'
import { ChartOrTable } from '@reiq/ui'
import { Tile } from '@reiq/ui/carbon'

/** One chart on a card, with its Chart / Table switch (the same numbers as rows) and the card's title.
 *  `toolbar` holds a control that changes the data (a split by family or region); it stays visible in both views. */
export function ChartCard({ title, info, subtitle, chart, headers, rows, label, toolbar, note }: {
  title: string
  info?: string
  subtitle?: string
  chart: ReactNode
  headers: string[]
  rows: (string | number)[][]
  label: string
  toolbar?: ReactNode
  note?: ReactNode
}) {
  return (
    <Tile className="card">
      {toolbar ? <div className="row-03">{toolbar}</div> : null}
      <ChartOrTable
        heading={<span className="card-heading"><span className="card-title-row">{title}{info ? <Info text={info} label={`About ${title}`} /> : null}</span>{subtitle ? <span className="footnote">{subtitle}</span> : null}</span>}
        label={label} chart={chart} headers={headers} rows={rows} />
      {note ? <p className="footnote">{note}</p> : null}
    </Tile>
  )
}
