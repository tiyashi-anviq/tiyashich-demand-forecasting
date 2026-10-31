import { useSyncExternalStore } from 'react'

/** A 403 from any API: signed in, but this role does not cover this module. The app's API
 *  client calls reportAccessDenied; the scaffold swaps the page for the refusal. The first
 *  message wins and is never cleared: a role does not change inside one page load, and
 *  retrying the refused call only earns a second refusal. */
const DEFAULT_MESSAGE = 'Your account does not have access to this module. Ask an administrator to grant it.'

let deniedMessage: string | null = null
const listeners = new Set<() => void>()

export function reportAccessDenied(message?: string): void {
  if (deniedMessage) return
  deniedMessage = message || DEFAULT_MESSAGE
  listeners.forEach((notify) => notify())
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify)
  return () => {
    listeners.delete(notify)
  }
}

export function useAccessDenied(): string | null {
  return useSyncExternalStore(subscribe, () => deniedMessage)
}
