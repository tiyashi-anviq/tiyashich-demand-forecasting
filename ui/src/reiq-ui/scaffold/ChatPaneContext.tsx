import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useFoldRailWhile } from './useFoldRailWhile'

/** Open or closed, shared by the top bar's chat button and the pane far below it (same channel
 *  as ModuleRailContext). No router here: AppScaffold also frames apps without one. Which chat
 *  is open lives in the URL (?chat=), read by the pane itself. */
export interface ChatPaneState {
  open: boolean
  setOpen: (open: boolean) => void
}

const ChatPaneContext = createContext<ChatPaneState | null>(null)

/** Open on arrival when the URL names a chat: a link from Talk to Data, or a reload. */
function startsOpen(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('chat')
}

export function ChatPaneProvider({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(startsOpen)
  useFoldRailWhile(open)

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next)
    if (next) return
    // Closed: drop ?chat so a reload does not open it again. The router is not involved; the
    // pane that reads ?chat is unmounted by now.
    const url = new URL(window.location.href)
    if (url.searchParams.has('chat')) {
      url.searchParams.delete('chat')
      window.history.replaceState(window.history.state, '', url)
    }
  }, [])
  const value = useMemo(() => ({ open, setOpen }), [open, setOpen])
  return <ChatPaneContext.Provider value={value}>{children}</ChatPaneContext.Provider>
}

/** null outside an app that has a chat pane. */
export function useChatPane(): ChatPaneState | null {
  return useContext(ChatPaneContext)
}
