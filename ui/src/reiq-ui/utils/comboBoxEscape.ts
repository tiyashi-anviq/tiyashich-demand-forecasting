import type { KeyboardEvent } from 'react'

/** Downshift's own opt-out flag (Carbon's ComboBox is built on it). It reads this off the event a
 *  consumer handler has already seen and skips its default behaviour for that key. */
type EscapableKeyEvent = KeyboardEvent<HTMLInputElement> & { preventDownshiftDefault?: boolean }

/** Escape on a Carbon ComboBox must CLOSE THE MENU, not clear the selection.
 *
 *  Carbon leaves Escape entirely to downshift, whose useCombobox reducer answers it with
 *  `{isOpen: false, highlightedIndex: -1}` - plus `{selectedItem: null, inputValue: ''}` when the
 *  menu was ALREADY CLOSED. With the menu already shut there is nothing to close, so that second
 *  case is pure loss: the field reads empty while whatever it was showing a moment ago is quietly
 *  unset. Blocking downshift's default in exactly that case (via `inputProps={{ onKeyDown: ... }}`)
 *  is what keeps a stray Escape press from clearing a selection nobody asked to clear.
 *
 *  aria-expanded is read off the input Carbon itself rendered, so there is no second copy of the
 *  open state to drift from it. */
export function closeMenuButKeepValueOnEscape(event: KeyboardEvent<HTMLInputElement>): void {
  if (event.key !== 'Escape') return
  const menuIsOpen = event.currentTarget.getAttribute('aria-expanded') === 'true'
  if (menuIsOpen) return
  ;(event as EscapableKeyEvent).preventDownshiftDefault = true
}
