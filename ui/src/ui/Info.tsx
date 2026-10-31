import { Information } from '@carbon/icons-react'
import { Toggletip, ToggletipButton, ToggletipContent } from '@reiq/ui/carbon'

/** An "i" next to a term: opens a short plain-language explanation. */
export function Info({ text, label = 'More about this' }: { text: string; label?: string }) {
  return (
    <Toggletip align="bottom" autoAlign className="info-tip">
      <ToggletipButton label={label}><Information size={16} /></ToggletipButton>
      <ToggletipContent><p>{text}</p></ToggletipContent>
    </Toggletip>
  )
}
