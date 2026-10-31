/** A share inside a table cell: the bar and the number, so the number is always there. */
export function MiniBar({ value, text }: { value: number; text: string }) {
  return (
    <div className="row-03">
      <div className="bar-track" aria-hidden="true"><div className="bar-fill" style={{ inlineSize: `${Math.max(0, Math.min(1, value)) * 100}%` }} /></div>
      <span className="tabular-nums">{text}</span>
    </div>
  )
}
