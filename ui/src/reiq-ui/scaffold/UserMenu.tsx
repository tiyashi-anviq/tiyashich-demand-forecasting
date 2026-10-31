import { useState } from 'react'
import { ChevronDown } from '@carbon/icons-react'
import { Popover, PopoverContent, Tag } from '../carbon'
import { useAuth } from '../auth/AuthContext'
import { loginHref } from '../auth/loginHref'
import { signOut } from '../auth/authApi'
import { isAdmin } from '../auth/permissions'
import { hubUrl } from '../config'
import './UserMenu.css'

/** Profile/Settings/Guide have no destination page in this module yet, so each
 *  renders disabled with the same "Coming soon" Tag hub's own module picker
 *  uses for a not-yet-available module - honest about doing nothing, rather
 *  than a button that looks live and silently closes the menu. Wire each to a
 *  real route (and drop its disabled state) as that page lands. */
const ACCOUNT_LINKS = ['Profile', 'Settings', 'Guide']

function initialsOf(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}

/** Avatar + name trigger that opens a Popover with the /me identity (name,
 *  email) and account actions. Carbon has no single "user menu" component,
 *  so this composes Popover/PopoverContent (already Carbon-provided
 *  positioning + outside-click/Escape dismissal) with plain buttons for the
 *  rows, matching the OverflowMenu-item convention used elsewhere in this
 *  app. Mirrors AuthIndicator's sign-in fallback for the unauthenticated
 *  case. */
export function UserMenu() {
  const { status, user } = useAuth()
  const [open, setOpen] = useState(false)

  if (status === 'disabled') return null

  if (status !== 'authenticated' || !user) {
    return (
      <a className="user-menu-signin" href={loginHref()}>
        Not signed in - sign in
      </a>
    )
  }

  const displayName = user.name || user.email
  const initials = initialsOf(displayName)

  function handleSignOut() {
    setOpen(false)
    void signOut(loginHref()).then((next) => window.location.assign(next))
  }

  return (
    <Popover
      open={open}
      onRequestClose={() => setOpen(false)}
      align="bottom-end"
      // Carbon's floating placement: the panel's right edge lines up with the trigger's and it is
      // kept inside the viewport (shifted, never cut off at the screen edge), which the static
      // placement could not do - it put the edge on the trigger's centre.
      autoAlign
      caret={false}
      dropShadow={false}
      className="user-menu"
    >
      <button
        type="button"
        className="user-menu-trigger"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Account menu for ${displayName}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="user-menu-avatar" aria-hidden="true">
          {initials}
        </span>
        <span className="user-menu-name">{displayName}</span>
        <ChevronDown size={16} className="user-menu-chevron" />
      </button>

      <PopoverContent className="user-menu-panel">
        <div className="user-menu-panel-inner">
          <div className="user-menu-header">
            <span className="user-menu-avatar user-menu-avatar-lg" aria-hidden="true">
              {initials}
            </span>
            <div className="user-menu-identity">
              <span className="user-menu-identity-name">{displayName}</span>
              <span className="user-menu-identity-email">{user.email}</span>
            </div>
          </div>

          <div className="user-menu-divider" role="separator" />

          {/* The admin console's entry point, in every app. A plain <a>: the console is the hub's
              page, another app. Hidden from everyone else; the API is what enforces it. */}
          {isAdmin(user) ? (
            <a href={`${hubUrl.replace(/\/$/, '')}/admin`} className="user-menu-item" onClick={() => setOpen(false)}>
              Administration
            </a>
          ) : null}

          {ACCOUNT_LINKS.map((label) => (
            <button
              key={label}
              type="button"
              className="user-menu-item user-menu-item-disabled"
              disabled
              aria-disabled="true"
            >
              {label}
              <Tag type="gray" size="sm">
                Coming soon
              </Tag>
            </button>
          ))}

          <div className="user-menu-divider" role="separator" />

          <button type="button" className="user-menu-item user-menu-item-danger" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
