/** Mirrors reiq's own AuthUser shape (reiq/src/core/auth/types.ts) - this app
 *  never logs anyone in itself, it only asks the shared auth service "who, if
 *  anyone, is this". */
export interface AuthUser {
  id: string
  email: string
  name: string
  roles: string[]
  permissions: Record<string, string>
  /** `{module_slug: role_slug}` - the explicit per-module assignments an administrator made in
   *  the hub admin console (module_auth.user_modules). `permissions` answers "may they open it
   *  at all"; this answers "as what", which is the question a module with its own role vocabulary
   *  has to ask - construction-vision-quality-ai draws a different app for a site engineer than
   *  for a QA checker. A global admin holds every module through `roles`/`permissions` and may
   *  have nothing listed here, so read it through `moduleRole()`, never directly. */
  modules?: Record<string, string>
}
