import { useRef, useState, type MouseEvent } from 'react'
import { Asleep, Awake, Laptop } from '@carbon/icons-react'
import { HeaderGlobalAction, Menu, MenuItemRadioGroup } from '../carbon'
import { useTheme, type ThemePreference } from '../theme/useTheme'

const OPTIONS: ThemePreference[] = ['g10', 'g100', 'system']
const LABELS: Record<ThemePreference, string> = { g10: 'Light', g100: 'Dark', system: 'System' }
const ICONS = { g10: Awake, g100: Asleep, system: Laptop }

/** The top bar's theme picker: light, dark, or follow the OS. Carbon's own Menu
 *  with a radio group, opened under the icon; the icon shows the current pick. */
export function ThemeMenu() {
  const { preference, setPreference } = useTheme()
  // The trigger's box while open: Menu places itself against it.
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const Icon = ICONS[preference]
  // Menu closes when it loses focus. Keeping focus in it on mousedown makes a click on the
  // icon close the open menu, instead of closing it on blur and reopening it on click.
  // A spread: HeaderGlobalAction passes it to the button but does not type it.
  const keepMenuFocus = {
    onMouseDown: (event: MouseEvent) => {
      if (anchor) event.preventDefault()
    },
  }

  return (
    <>
      <HeaderGlobalAction
        ref={triggerRef}
        aria-label={`Theme: ${LABELS[preference]}`}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        isActive={anchor !== null}
        {...keepMenuFocus}
        onClick={() => setAnchor(anchor ? null : (triggerRef.current?.getBoundingClientRect() ?? null))}
      >
        <Icon size={20} />
      </HeaderGlobalAction>
      <Menu
        label="Theme"
        mode="basic"
        size="sm"
        open={anchor !== null}
        onClose={() => setAnchor(null)}
        x={anchor ? [anchor.left, anchor.right] : 0}
        y={anchor ? [anchor.top, anchor.bottom] : 0}
      >
        <MenuItemRadioGroup
          label="Theme"
          items={OPTIONS}
          selectedItem={preference}
          itemToString={(item) => LABELS[item as ThemePreference]}
          onChange={(item) => {
            setPreference(item as ThemePreference)
            setAnchor(null)
          }}
        />
      </Menu>
    </>
  )
}
