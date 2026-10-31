// Where "All modules" goes. Vite dev runs each app on its own port, so the hub is
// its dev server; a build sits behind Caddy on one origin, where the hub is "/".
export const hubUrl: string = import.meta.env.DEV
	? import.meta.env.VITE_HUB_URL || 'http://localhost:3000'
	: '/'

// Sign-in is on unless a dev server sets VITE_AUTH_ENABLED=false (running without auth-api).
export const authEnabled: boolean = import.meta.env.VITE_AUTH_ENABLED !== 'false'

// One origin: every app reaches auth at the same paths (Caddy in a build, each Vite proxy in dev).
export const authApiUrl = '/auth/api'
export const loginUrl = '/auth/login'

// A module's own app. Built, every module is a path on the one origin. On the dev servers each
// app runs on its own port (its vite.config.ts), so a plain path would stay on the caller's port
// and land on the wrong app.
const DEV_PORTS: Record<string, number> = {
	'land-feasibility': 3002,
	'title-search': 3003,
	'construction-vision-quality-ai': 3007,
	'agentic-demand-forecasting': 3008,
	'workspace-site-selection': 3009,
	'talk-to-data': 3010,
}

export function moduleUrl(slug: string): string {
	const port = DEV_PORTS[slug]
	return import.meta.env.DEV && port ? `http://localhost:${port}/${slug}/` : `/${slug}/`
}
