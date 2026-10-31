import type { ReactNode } from 'react'
import { ArrowRight } from '@carbon/icons-react'
import { Button } from '@reiq/ui/carbon'

/** One primary action per step, pinned to the bottom of the pane so it is always in reach. */
export default function FooterBar({ note, onBack, backLabel = 'Back', primaryLabel, onPrimary, primaryDisabled, primaryIcon = true, busy }: {
  note?: ReactNode
  onBack?: () => void
  backLabel?: string
  primaryLabel: string
  onPrimary: () => void
  primaryDisabled?: boolean
  primaryIcon?: boolean
  busy?: ReactNode
}) {
  return (
    <div className="wizard-footer">
      <div className="wizard-footer-note">{note}</div>
      {onBack && <Button kind="secondary" size="md" onClick={onBack}>{backLabel}</Button>}
      {busy ?? <Button kind="primary" size="md" renderIcon={primaryIcon ? ArrowRight : undefined} disabled={primaryDisabled} onClick={onPrimary}>{primaryLabel}</Button>}
    </div>
  )
}
