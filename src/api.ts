import type { ApiKeys } from './lib/keys';
import type { ApiError, MacroData, StockData } from './lib/types';

const API = `${import.meta.env.BASE_URL}api`;
const CACHE_NAME = 'stock-analysis-data-v1';
const STOCK_TTL = 12 * 60 * 60 * 1000;
const MACRO_TTL = 24 * 60 * 60 * 1000;

/** Error from the API, with the HTTP status so the UI can tell a bad key from a bad ticker. */
export class ApiRequestError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
	}
}

// Responses are cached in this browser (Cache Storage) so repeat lookups don't
// spend the visitor's API quota. Nothing is cached on the server.
async function openCache(): Promise<Cache | null> {
	try {
		return typeof caches === 'undefined' ? null : await caches.open(CACHE_NAME);
	} catch {
		return null;
	}
}

async function get<T>(path: string, headers: Record<string, string>, ttl: number, useCache = true): Promise<T> {
	const url = `${API}${path}`;
	const cache = useCache ? await openCache() : null;
	const hit = await cache?.match(url).catch(() => undefined);
	if (hit && Date.now() - Number(hit.headers.get('X-Saved-At')) < ttl) return (await hit.json()) as T;

	let res: Response;
	try {
		res = await fetch(url, { headers });
	} catch {
		// Offline: fall back to the last saved copy, however old.
		if (hit) return (await hit.json()) as T;
		throw new ApiRequestError('You’re offline, and this hasn’t been looked up on this device before.', 0);
	}
	const text = await res.text();
	let body: T | ApiError | null = null;
	try {
		body = JSON.parse(text) as T | ApiError;
	} catch {
		// fall through
	}
	if (!res.ok || body === null) {
		throw new ApiRequestError((body as ApiError | null)?.error ?? 'Something went wrong. Please try again.', res.status);
	}
	await cache
		?.put(url, new Response(text, { headers: { 'Content-Type': 'application/json', 'X-Saved-At': String(Date.now()) } }))
		.catch(() => {});
	return body as T;
}

export const fetchStock = (ticker: string, keys: ApiKeys, useCache = true) =>
	get<StockData>(`/stock/${encodeURIComponent(ticker)}`, { 'X-Tiingo-Key': keys.tiingo }, STOCK_TTL, useCache);

export const fetchMacro = (keys: ApiKeys, useCache = true) =>
	get<MacroData>('/macro', { 'X-Fred-Key': keys.fred }, MACRO_TTL, useCache);

export async function clearDataCache(): Promise<void> {
	try {
		if (typeof caches !== 'undefined') await caches.delete(CACHE_NAME);
	} catch {
		// ignore
	}
}
