import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp } from '@carbon/icons-react'
import { StatTile } from '@reiq/ui'
import { Info } from './Info'

export type Stat = { label: string; value: ReactNode; sublabel?: ReactNode; info?: string }

/** A change: the sign and an arrow carry the direction, the colour only echoes it. */
export function Delta({ value, text }: { value: number | null | undefined; text: string }) {
  if (value === null || value === undefined) return <>–</>
  const up = value >= 0
  const Arrow = up ? ArrowUp : ArrowDown
  return <span className={`delta ${up ? 'up' : 'down'}`}><Arrow size={16} aria-hidden="true" /> {text}</span>
}

/** The row of three to six key numbers at the top of a screen: StatTiles in the shared kpi-grid. */
export function StatRow({ items }: { items: Stat[] }) {
  return (
    <div className="kpi-grid">
      {items.map((s) => <StatTile key={s.label} label={s.info ? <span className="kpi-label-content"><span className="kpi-label-text">{s.label}</span><Info text={s.info} label={`About ${s.label}`} /></span> : s.label} value={s.value} sublabel={s.sublabel} />)}
    </div>
  )
}
