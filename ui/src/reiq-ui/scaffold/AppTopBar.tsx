import type { ReactNode } from 'react'
import { Chat } from '@carbon/icons-react'
import { Header, HeaderGlobalAction, HeaderGlobalBar, HeaderMenuButton, SkipToContent } from '../carbon'
import { BrandMark } from '../components/BrandMark/BrandMark'
import { hubUrl } from '../config'
import { useIsMobile } from '../hooks/useIsMobile'
import { useChatPane } from './ChatPaneContext'
import { useModuleRailState } from './ModuleRailContext'
import { ThemeMenu } from './ThemeMenu'
import { UserMenu } from './UserMenu'
import './AppTopBar.css'

/** Minimal top bar for this standalone app: the module rail's collapse
 *  toggle, the account menu, and the theme switch. */
export function AppTopBar({
  label,
  actions,
  hasChat = false,
}: {
  label: string
  actions?: ReactNode
  hasChat?: boolean
}) {
  const rail = useModuleRailState()
  const chat = useChatPane()
  const isMobile = useIsMobile()

  return (
    <Header aria-label={label} className="app-top-bar">
      <SkipToContent />
      {rail ? (
        <HeaderMenuButton
          // Mobile: the button IS the drawer's own open/close control, so the icon follows the
          // drawer - hamburger (Menu) while closed, X (Close) while open. Desktop's meaning is
          // different (narrow the rail to icon-only vs. expand it back, not open/close an
          // overlay), so its icon mapping is untouched.
          aria-label={isMobile ? (rail.collapsed ? 'Open menu' : 'Close menu') : rail.collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          isCollapsible
          isActive={isMobile ? !rail.collapsed : rail.collapsed}
          onClick={rail.toggle}
        />
      ) : null}

      {/* Plain <a>, not react-router Link: hub is a genuinely separate
          origin/app, not a route inside this one. */}
      <a href={hubUrl} className="cds--header__name app-top-bar-brand">
        <BrandMark className="app-top-bar-brand-mark" />
        <span className="app-top-bar-brand-name">REIQ</span>
      </a>

      <HeaderGlobalBar>
        {actions}
        {hasChat && chat ? (
          <HeaderGlobalAction
            aria-label={chat.open ? 'Close the chat' : 'Ask about this data'}
            tooltipAlignment="end"
            isActive={chat.open}
            onClick={() => chat.setOpen(!chat.open)}
          >
            <Chat size={20} />
          </HeaderGlobalAction>
        ) : null}
        <ThemeMenu />
        <UserMenu />
      </HeaderGlobalBar>
    </Header>
  )
}
