import { InlineNotification } from '@reiq/ui/carbon'

type Finding = { tone: string; text: string }

/** What the data says, one notification per point. The kind carries the meaning (good, watch, note) with its own icon. */
export function Findings({ items, title }: { items: Finding[] | undefined; title: string }) {
  if (!items?.length) return null
  return (
    <section className="stack-03" aria-label={title}>
      {items.map((f, i) => (
        <InlineNotification key={i} kind={f.tone === 'good' ? 'success' : f.tone === 'watch' ? 'warning' : 'info'} lowContrast hideCloseButton
          title="" subtitle={f.text} statusIconDescription={f.tone === 'good' ? 'Good' : f.tone === 'watch' ? 'Watch' : 'Note'} />
      ))}
    </section>
  )
}
