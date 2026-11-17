import { BASE_PATH } from './base';
import { ProviderError, fetchMacro, fetchStock, isFredKey, isTiingoKey, normalizeTicker } from './data';
import { parsePing } from './ping';

// Serves the app under BASE_PATH plus a small API:
//   GET  api/stock/:ticker  — relays to Tiingo with the visitor's own key (X-Tiingo-Key)
//   GET  api/macro          — relays to FRED with the visitor's own key (X-Fred-Key)
//   POST api/ping           — anonymous, opt-in usage counts
//
// Tiingo and FRED don't allow requests straight from browsers (no CORS), so the
// app sends requests through here. Visitors' keys are used only for that one
// upstream request: never stored, logged, or shared between visitors.

export interface Env {
	ASSETS: Fetcher;
	DB: D1Database;
	LOOKUP_LIMITER: RateLimit;
}

const BASE_NO_SLASH = BASE_PATH.slice(0, -1);
const MAX_PING_BYTES = 512;

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			// Responses are fetched with a visitor's own key: never cache them in shared caches.
			'Cache-Control': 'private, no-store',
		},
	});
}

const errorResponse = (error: string, status: number) => json({ error }, status);

async function relay(request: Request, env: Env, fetcher: () => Promise<unknown>): Promise<Response> {
	const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
	const { success } = await env.LOOKUP_LIMITER.limit({ key: ip });
	if (!success) return errorResponse('Too many requests. Please wait a minute and try again.', 429);
	try {
		return json(await fetcher());
	} catch (err) {
		if (err instanceof ProviderError) return errorResponse(err.message, err.status);
		console.error('relay failed', err instanceof Error ? err.message : 'unknown error');
		return errorResponse('Something went wrong fetching data. Please try again.', 500);
	}
}

function handleStock(rawTicker: string, request: Request, env: Env): Promise<Response> | Response {
	const ticker = normalizeTicker(rawTicker);
	if (!ticker) return errorResponse('That doesn’t look like a ticker symbol.', 400);
	const key = request.headers.get('X-Tiingo-Key');
	if (!isTiingoKey(key)) return errorResponse('Add your Tiingo API key in Data keys to look up stocks.', 401);
	return relay(request, env, () => fetchStock(ticker, key));
}

function handleMacro(request: Request, env: Env): Promise<Response> | Response {
	const key = request.headers.get('X-Fred-Key');
	if (!isFredKey(key)) return errorResponse('Add your FRED API key in Data keys to load economic data.', 401);
	return relay(request, env, () => fetchMacro(key));
}

async function handlePing(request: Request, env: Env): Promise<Response> {
	const text = await request.text();
	if (text.length > MAX_PING_BYTES) return new Response(null, { status: 413 });
	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		return new Response(null, { status: 400 });
	}
	const ping = parsePing(body);
	if (!ping) return new Response(null, { status: 400 });

	const day = new Date().toISOString().slice(0, 10);
	// One row per device, event and day: repeated pings on the same day are ignored.
	await env.DB.prepare('INSERT OR IGNORE INTO events (day, event, anon_id, version) VALUES (?, ?, ?, ?)')
		.bind(day, ping.event, ping.id, ping.version)
		.run();
	return new Response(null, { status: 204 });
}

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === BASE_NO_SLASH) {
			url.pathname = BASE_PATH;
			return Response.redirect(url.toString(), 301);
		}
		if (!url.pathname.startsWith(BASE_PATH)) return new Response('Not found', { status: 404 });

		const path = url.pathname.slice(BASE_NO_SLASH.length);

		if (path === '/api/ping') {
			if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
			return handlePing(request, env);
		}
		if (path.startsWith('/api/')) {
			if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } });
			const stock = path.match(/^\/api\/stock\/([^/]+)$/);
			if (stock) return handleStock(stock[1]!, request, env);
			if (path === '/api/macro') return handleMacro(request, env);
			return errorResponse('Not found', 404);
		}

		url.pathname = path;
		const asset = await env.ASSETS.fetch(new Request(url, request));
		// Unknown page addresses show the app; unknown files (e.g. an old script) stay a 404.
		if (asset.status === 404 && !/\.[a-z0-9]+$/i.test(path)) {
			url.pathname = '/';
			return env.ASSETS.fetch(new Request(url, request));
		}
		return asset;
	},
} satisfies ExportedHandler<Env>;
