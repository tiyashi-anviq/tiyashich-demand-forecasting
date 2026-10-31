import { InlineLoading } from '../../carbon'

/** A primary button's label: the action, or what is happening while it runs ("Saving..."). Pass it
 *  as a Modal's `primaryButtonText` or a Button's children, and disable only that button while
 *  `pending`; the fields stay editable, so nothing else on the form looks frozen. */
export function PendingLabel({ pending, idle, busy }: { pending: boolean; idle: string; busy: string }) {
  return pending ? <InlineLoading description={busy} /> : idle
}
