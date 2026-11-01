import { useState } from 'react'
import { CheckmarkFilled, ChevronDown, ChevronUp, InformationFilled, WarningAltFilled } from '@carbon/icons-react'
import { Button, Tile } from '@reiq/ui/carbon'

type Finding = { tone: string; text: string }

const KIND: Record<string, { cls: string; label: string; Icon: typeof CheckmarkFilled }> = {
  watch: { cls: 'watch', label: 'Watch', Icon: WarningAltFilled },
  good: { cls: 'good', label: 'Good', Icon: CheckmarkFilled },
  note: { cls: 'note', label: 'Note', Icon: InformationFilled },
}
const ORDER = ['watch', 'good', 'note']

/** What the data says: one card, points that need attention first, then good news, then notes. Each carries its own icon, label and colour edge. */
export function Findings({ items, title }: { items: Finding[] | undefined; title: string }) {
  const [open, setOpen] = useState(false)
  if (!items?.length) return null
  const count = (t: string) => items.filter((x) => (KIND[x.tone] ? x.tone : 'note') === t).length
  const summary = ORDER.filter((t) => count(t)).map((t) => `${count(t)} ${KIND[t].label.toLowerCase()}`).join(' · ')
  const sorted = [...items].sort((a, b) => ORDER.indexOf(KIND[a.tone] ? a.tone : 'note') - ORDER.indexOf(KIND[b.tone] ? b.tone : 'note'))
  return (
    <Tile className="card findings" aria-label={title}>
      <div className="card-heading row-03 findings-head">
        <span className="card-title">{title}</span>
        {!open && <span className="footnote">{summary}</span>}
        <Button className="findings-toggle" kind="ghost" size="sm" renderIcon={open ? ChevronUp : ChevronDown} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'}</Button>
      </div>
      {open && <ul className="findings-list">
        {sorted.map((f, i) => {
          const k = KIND[f.tone] ?? KIND.note
          return (
            <li key={i} className={`finding finding-${k.cls}`}>
              <k.Icon size={16} aria-label={k.label} />
              <span><strong>{k.label}.</strong> {f.text}</span>
            </li>
          )
        })}
      </ul>}
    </Tile>
  )
}
