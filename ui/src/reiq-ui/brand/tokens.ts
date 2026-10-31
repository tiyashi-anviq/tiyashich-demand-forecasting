// This app's design tokens, in JS form. Each modules/<name>/ui app deploys on its own and owns
// its own copy, so edit this file directly - keeping it in step with reiq-tokens.css beside it.
//
// Use these ONLY where CSS custom properties cannot reach - Leaflet marker options,
// canvas drawing, chart library config. In a stylesheet, use var(--reiq-*) instead so
// the value stays themeable.
//
// The bare `color`/`layout`/`type` exports are the LIGHT palette, so any JS that only
// ever runs in one theme keeps compiling unchanged. Anything that must follow the
// theme reads `themed(path, theme)` instead.

export const color = {
	"text": {
		"primary": "#13261d",
		"secondary": "#526a5d",
		"helper": "#526a5d",
		"on-color": "#ffffff",
		"on-color-muted": "rgba(255, 255, 255, 0.3)",
		"placeholder": "#5f7769"
	},
	"icon": {
		"primary": "#1b4332",
		"secondary": "#526a5d"
	},
	"interactive": {
		"01": "#1b4332",
		"hover": "#061b12",
		"01-glow": "rgba(27, 67, 50, 0.35)"
	},
	"link": {
		"01": "#2f5d46"
	},
	"focus": "#a87523",
	"ai-badge": {
		"bg": "#fbf1dc",
		"fg": "#8a5a12"
	},
	"ui": {
		"01": "#eef4f0",
		"background": "#ffffff"
	},
	"layer": {
		"01": "#f4f8f5",
		"hover": "#e3eee7",
		"selected": "#dcebe2"
	},
	"tag": {
		"background-blue": "#e5ebf0",
		"background-brand": "#e3eee7"
	},
	"border": {
		"subtle": "#d5e3da",
		"strong": "#7a8c81"
	},
	"scrollbar": {
		"thumb": "#c3d4ca"
	},
	"success": {
		"strong": "#198038"
	},
	"error": {
		"strong": "#da1e28",
		"on-strong": "#ffffff"
	},
	"warning": {
		"strong": "#f1c21b"
	},
	"status": {
		"blue-bg": "#e5ebf0",
		"blue-fg": "#24577e",
		"blue-bg-subtle": "#f2f5f7",
		"purple-bg": "#ede8ed",
		"purple-fg": "#6d4069",
		"purple-strong": "#7e517a",
		"teal-bg": "#e0eceb",
		"teal-fg": "#006159",
		"teal-strong": "#0d736a",
		"cyan-bg": "#e0eceb",
		"magenta-bg": "#efe8ea",
		"magenta-fg": "#793d4c",
		"green-bg": "#defbe6",
		"green-fg": "#0e6027",
		"green-bg-strong": "#a7f0ba",
		"red-bg": "#fff1f1",
		"red-fg": "#a2191f",
		"red-bg-strong": "#ffd7d9",
		"amber-bg": "#fcf4d4",
		"amber-fg": "#8a3800",
		"orange-bg": "#fff1e0",
		"orange-fg": "#ba4e00",
		"gray-bg": "#e3eee7",
		"gray-fg": "#526a5d"
	},
	"kpi": {
		"amber": "#84582a",
		"amber-bg": "rgba(132, 88, 42, 0.12)",
		"purple": "#7e517a",
		"purple-bg": "rgba(126, 81, 122, 0.12)",
		"cyan": "#356890",
		"cyan-bg": "rgba(53, 104, 144, 0.12)",
		"teal": "#0d736a",
		"teal-bg": "rgba(13, 115, 106, 0.12)",
		"magenta": "#8c4e5d",
		"magenta-bg": "rgba(140, 78, 93, 0.12)",
		"green": "#3d7149",
		"green-bg": "rgba(61, 113, 73, 0.12)"
	},
	"amenity": {
		"Hospitals": "#da1e28",
		"Schools": "#1192e8",
		"Banks": "#005d5d",
		"Restaurants": "#b28600",
		"Metro": "#6929c4",
		"Bus Stops": "#eb6200",
		"Highways": "#525252",
		"Airports": "#002d9c",
		"Parks": "#198038",
		"Commercial": "#9f1853",
		"Retail": "#ee5396"
	},
	"module": {
		"land-feasibility": "#596022",
		"title-search": "#596022",
		"workspace-site-selection": "#596022",
		"product-mix-forecasting": "#2d5f87",
		"demand-forecasting": "#2d5f87",
		"demand-forecasting-prophet": "#2d5f87",
		"demand-forecasting-manufacturing": "#2d5f87",
		"agentic-demand-forecasting": "#2d5f87",
		"material-price-prediction": "#2d5f87",
		"labour-demand-forecasting": "#2d5f87",
		"construction-vision-quality-ai": "#824a30",
		"regtech-compliance-assistant": "#824a30",
		"cash-flow-prediction": "#754871",
		"sales-dynamic-pricing": "#754871",
		"asset-portfolio-intelligence": "#754871",
		"talk-to-data": "#8a5a12"
	},
	"scrim": {
		"backdrop": "rgba(0, 0, 0, 0.4)"
	},
	"map": {
		"overlay-bg": "#ffffff",
		"overlay-fg": "#13261d",
		"overlay-fg-muted": "#526a5d",
		"overlay-border": "#d5e3da",
		"overlay-hover": "#e3eee7",
		"overlay-accent": "#1b4332",
		"mark": "#ffffff"
	},
	"chart": {
		"1": "#2a78d6",
		"2": "#eb6834",
		"3": "#1baf7a",
		"4": "#eda100",
		"5": "#e87ba4",
		"6": "#4a3aa7",
		"7": "#e34948",
		"8": "#8d8d8d",
		"band": "rgba(27, 175, 122, 0.16)",
		"band-alert": "rgba(216, 166, 87, 0.28)",
		"band-test": "rgba(42, 120, 214, 0.13)",
		"highlight": "#d8a657"
	}
} as const;

const colorDark = {
	"text": {
		"primary": "#e5ece8",
		"secondary": "#a2b5aa",
		"helper": "#a2b5aa",
		"placeholder": "#8fa397"
	},
	"icon": {
		"primary": "#86c0a0",
		"secondary": "#a2b5aa"
	},
	"interactive": {
		"01": "#86c0a0",
		"hover": "#e5ece8",
		"01-glow": "rgba(134, 192, 160, 0.35)"
	},
	"link": {
		"01": "#86c0a0"
	},
	"focus": "#e7b563",
	"ai-badge": {
		"bg": "#2c2617",
		"fg": "#d9b878"
	},
	"ui": {
		"01": "#0f1a15",
		"background": "#16221c"
	},
	"layer": {
		"01": "#1c2b24",
		"hover": "#22362b",
		"selected": "#27402f"
	},
	"tag": {
		"background-blue": "#334548",
		"background-brand": "#1c2b24"
	},
	"border": {
		"subtle": "#2a3d33",
		"strong": "#6b7f73"
	},
	"scrollbar": {
		"thumb": "#33473d"
	},
	"success": {
		"strong": "#42be65"
	},
	"error": {
		"strong": "#ff8389",
		"on-strong": "#0f1a15"
	},
	"status": {
		"blue-bg": "#334548",
		"blue-fg": "#a5d0f6",
		"blue-bg-subtle": "#1f2c29",
		"purple-bg": "#3f4143",
		"purple-fg": "#e5bbe1",
		"purple-strong": "#daadd5",
		"teal-bg": "#304740",
		"teal-fg": "#96dad0",
		"teal-strong": "#84cec4",
		"cyan-bg": "#304740",
		"magenta-bg": "#42403e",
		"magenta-fg": "#f3b8c4",
		"green-bg": "#284732",
		"green-fg": "#6fdc8c",
		"green-bg-strong": "#0e6027",
		"red-bg": "#453f3b",
		"red-fg": "#ffb3b8",
		"red-bg-strong": "#750e13",
		"amber-bg": "#42421c",
		"amber-fg": "#f1c21b",
		"orange-bg": "#454031",
		"orange-fg": "#ffb784",
		"gray-bg": "#22362b",
		"gray-fg": "#a2b5aa"
	},
	"kpi": {
		"amber": "#e0b48b",
		"amber-bg": "rgba(224, 180, 139, 0.12)",
		"purple": "#daadd5",
		"purple-bg": "rgba(218, 173, 213, 0.12)",
		"cyan": "#95c3eb",
		"cyan-bg": "rgba(149, 195, 235, 0.12)",
		"teal": "#84cec4",
		"teal-bg": "rgba(132, 206, 196, 0.12)",
		"magenta": "#e8aab7",
		"magenta-bg": "rgba(232, 170, 183, 0.12)",
		"green": "#9ccca4",
		"green-bg": "rgba(156, 204, 164, 0.12)"
	},
	"amenity": {
		"Hospitals": "#ff8389",
		"Schools": "#33b1ff",
		"Banks": "#08bdba",
		"Restaurants": "#d2a106",
		"Metro": "#a56eff",
		"Bus Stops": "#ff832b",
		"Highways": "#a8a8a8",
		"Airports": "#4589ff",
		"Parks": "#42be65",
		"Commercial": "#ff7eb6",
		"Retail": "#ffafd2"
	},
	"module": {
		"land-feasibility": "#bcc48c",
		"title-search": "#bcc48c",
		"workspace-site-selection": "#bcc48c",
		"product-mix-forecasting": "#95c3eb",
		"demand-forecasting": "#95c3eb",
		"demand-forecasting-prophet": "#95c3eb",
		"demand-forecasting-manufacturing": "#95c3eb",
		"agentic-demand-forecasting": "#95c3eb",
		"material-price-prediction": "#95c3eb",
		"labour-demand-forecasting": "#95c3eb",
		"construction-vision-quality-ai": "#e8af96",
		"regtech-compliance-assistant": "#e8af96",
		"cash-flow-prediction": "#daadd5",
		"sales-dynamic-pricing": "#daadd5",
		"asset-portfolio-intelligence": "#daadd5",
		"talk-to-data": "#d9b878"
	},
	"chart": {
		"1": "#3987e5",
		"2": "#d95926",
		"3": "#199e70",
		"4": "#c98500",
		"5": "#d55181",
		"6": "#9085e9",
		"7": "#e66767",
		"8": "#a0a0a0",
		"band": "rgba(25, 158, 112, 0.22)",
		"band-alert": "rgba(231, 181, 99, 0.24)",
		"band-test": "rgba(57, 135, 229, 0.16)",
		"highlight": "#e7b563"
	}
} as const;

export const layout = {
	"radius": {
		"card": "0",
		"round": "50%"
	},
	"size": {
		"filter-rail": "24rem",
		"chart-card-body": "260px",
		"topbar": "3rem",
		"nav": "15rem",
		"nav-collapsed": "3rem",
		"breadcrumb": "2.5rem",
		"sidebar": "16rem",
		"sidebar-md": "13rem",
		"sidebar-collapsed": "3rem",
		"drawer": "20rem",
		"map-control": "2.5rem",
		"simulation-drawer": "40rem",
		"topbar-brand": "3.5rem",
		"chat-panel": "22rem",
		"chat-panel-max": "40rem",
		"active-indicator": "3px"
	},
	"shadow": {
		"resting": "0 1px 2px rgba(0, 0, 0, 0.06), 0 1px 1px rgba(0, 0, 0, 0.04)",
		"raised": "0 4px 12px rgba(0, 0, 0, 0.12), 0 2px 4px rgba(0, 0, 0, 0.08)",
		"marker-drop-pin": "0 1px 2px rgba(0, 0, 0, 0.35)",
		"marker-drop-thumb": "0 1px 2px rgba(0, 0, 0, 0.5)",
		"map-control-resting": "0 1px 3px rgba(0, 0, 0, 0.15)",
		"map-control-raised": "0 2px 6px rgba(0, 0, 0, 0.15)",
		"map-control-handle": "0 1px 3px rgba(0, 0, 0, 0.4)"
	},
	"motion": {
		"fast": "150ms ease"
	},
	"breakpoint": {
		"md": "672px",
		"max": "1584px"
	}
} as const;

export const type = {
	"font": {
		"sans": "'Vend Sans', system-ui, sans-serif",
		"mono": "'JetBrains Mono', monospace",
		"display": "'Oldenburg', cursive"
	},
	"weight": {
		"light": "300",
		"regular": "400",
		"medium": "500",
		"semibold": "600"
	},
	"letter-spacing": {
		"caps": "0.06em"
	}
} as const;

const LIGHT = { color, layout, type } as const;
const DARK = { color: colorDark } as const;

/** Dotted-path lookup rooted at the group name: `themed('color.interactive.01', theme)`,
 *  `themed('color.amenity.Bus Stops', theme)`. Falls back to the light value when the path
 *  declared no dark override. Throws on an unknown path - a typo must fail loudly rather
 *  than silently render black. */
export function themed(path: string, theme: 'light' | 'dark'): string {
	const at = (root: unknown): unknown =>
		path
			.split('.')
			.reduce<unknown>(
				(node, key) =>
					node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined,
				root
			);
	if (theme === 'dark') {
		const override = at(DARK);
		if (typeof override === 'string') return override;
	}
	const base = at(LIGHT);
	if (typeof base !== 'string') throw new Error(`unknown token path: ${path}`);
	return base;
}

export const cssVar = (name: string) => `var(--reiq-${name})`;
