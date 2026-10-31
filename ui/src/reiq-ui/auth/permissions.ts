import type { AuthUser } from './types'

/** Two questions the hub asks about the signed-in account, both answered from the /me payload
 *  it already has - no extra call, and no second copy of the rules.
 *
 *  NEITHER IS A SECURITY BOUNDARY. Both decide what this page draws, nothing else: a module's
 *  data is gated by Caddy's forward_auth on /<module>/api/*, and the admin API gates itself
 *  (modules/auth/api/app/routers/admin.py). Hiding a tile or a page here is a courtesy to the
 *  user, not enforcement - anyone can type the URL, and the API is what refuses them. */

/** True when the account holds ANY permission on `slug`.
 *
 *  `permissions` is the {module_slug: "rwx"} map GET /auth/api/me returns. '*' is the wildcard
 *  the admin role holds (migrations/000_baseline.sql): it matches every module, including ones added
 *  after the grant was made, so it is checked alongside the module's own entry rather than
 *  instead of it - the server ADDS the wildcard's letters to a module's own for the same reason.
 *
 *  Any letter is enough. A user with read but not write still gets the tile; the module's own
 *  screens are what refuse the write. */
export function canOpenModule(user: AuthUser | null, slug: string): boolean {
  if (!user) return false
  const wildcard = user.permissions['*'] ?? ''
  const own = user.permissions[slug] ?? ''
  return wildcard.length > 0 || own.length > 0
}

/** True when the account holds the 'admin' role - what the admin console's link and route check
 *  before rendering. The role slug, not a permission: /auth/api/admin/* itself checks the role
 *  (auth_service.require_admin), so checking the same thing here keeps the two in step. */
export function isAdmin(user: AuthUser | null): boolean {
  return user?.roles.includes('admin') ?? false
}

/** Write access ('w') to a module, through the wildcard grant or the module's own: an editor or
 *  admin, not a viewer. It only decides whether an edit control is drawn; the API enforces. */
export function canWrite(user: AuthUser | null, slug: string): boolean {
  if (!user) return false
  return `${user.permissions['*'] ?? ''}${user.permissions[slug] ?? ''}`.includes('w')
}

/** The account's role slug INSIDE one module (module_auth.module_roles.slug), or null when they
 *  hold none. For a module whose roles mean different jobs rather than different amounts of
 *  access - construction-vision-quality-ai's engineer, qa, pm, operator - this is what decides
 *  which app that person sees.
 *
 *  A global admin is admin in every module whatever `modules` says (000_baseline.sql), so the
 *  global role is checked first; that is the same precedence auth-api's own gate applies, and
 *  reading `user.modules[slug]` directly would get it wrong for exactly the accounts most likely
 *  to be testing a module.
 *
 *  NOT a security boundary, like everything else here: it decides what this page draws. */
export function moduleRole(user: AuthUser | null, slug: string): string | null {
  if (!user) return null
  if (isAdmin(user)) return 'admin'
  return user.modules?.[slug] ?? null
}
