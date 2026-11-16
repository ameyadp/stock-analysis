import { BASE_PATH } from './base';
import { ProviderError, fetchMacro, fetchStock, normalizeTicker } from './data';

// Serves the app under BASE_PATH and two JSON endpoints:
//   GET  api/stock/:ticker  — ~30 years of daily prices (Tiingo), cached 12 hours
//   GET  api/macro          — Fed funds rate, CPI, unemployment (FRED), cached 24 hours
// API keys stay here as secrets and are never sent to the browser.

export interface Env {
	ASSETS: Fetcher;
	CACHE: KVNamespace;
	LOOKUP_LIMITER: RateLimit;
	TIINGO_API_KEY: string;
	FRED_API_KEY: string;
}

const BASE_NO_SLASH = BASE_PATH.slice(0, -1);
const STOCK_TTL = 12 * 60 * 60;
const MISSING_TTL = 60 * 60;
const MACRO_TTL = 24 * 60 * 60;

function json(body: unknown, status = 200, maxAge = 0): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store',
		},
	});
}

const errorResponse = (error: string, status: number) => json({ error }, status);

async function handleStock(rawTicker: string, request: Request, env: Env): Promise<Response> {
	const ticker = normalizeTicker(rawTicker);
	if (!ticker) return errorResponse('That doesn’t look like a ticker symbol.', 400);

	const key = `stock:v1:${ticker}`;
	const cached = await env.CACHE.get(key);
	if (cached === 'missing') return errorResponse(`No data found for "${ticker}". Check the ticker symbol.`, 404);
	if (cached) return new Response(cached, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });

	// Only uncached lookups cost API quota, so only those are rate-limited.
	const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
	const { success } = await env.LOOKUP_LIMITER.limit({ key: ip });
	if (!success) return errorResponse('Too many lookups. Please wait a minute and try again.', 429);

	try {
		const data = await fetchStock(ticker, env.TIINGO_API_KEY);
		const body = JSON.stringify(data);
		await env.CACHE.put(key, body, { expirationTtl: STOCK_TTL });
		return new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
	} catch (err) {
		if (err instanceof ProviderError) {
			if (err.status === 404) await env.CACHE.put(key, 'missing', { expirationTtl: MISSING_TTL });
			return errorResponse(err.message, err.status);
		}
		console.error('stock lookup failed', ticker, err);
		return errorResponse('Something went wrong fetching that stock.', 500);
	}
}

async function handleMacro(env: Env): Promise<Response> {
	const key = 'macro:v1';
	const cached = await env.CACHE.get(key);
	if (cached) return new Response(cached, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });

	try {
		const body = JSON.stringify(await fetchMacro(env.FRED_API_KEY));
		await env.CACHE.put(key, body, { expirationTtl: MACRO_TTL });
		return new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
	} catch (err) {
		if (err instanceof ProviderError) return errorResponse(err.message, err.status);
		console.error('macro fetch failed', err);
		return errorResponse('Something went wrong fetching economic data.', 500);
	}
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

		if (path.startsWith('/api/')) {
			if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } });
			const stock = path.match(/^\/api\/stock\/([^/]+)$/);
			if (stock) return handleStock(stock[1]!, request, env);
			if (path === '/api/macro') return handleMacro(env);
			return errorResponse('Not found', 404);
		}

		url.pathname = path;
		return env.ASSETS.fetch(new Request(url, request));
	},
} satisfies ExportedHandler<Env>;
