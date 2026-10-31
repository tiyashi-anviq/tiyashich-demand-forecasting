/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Sign-in is enforced unless this is exactly "false". This app has no sign-in. */
  readonly VITE_AUTH_ENABLED?: string
  readonly VITE_HUB_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
