import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../worker/index';
import { normalizeTicker, parseFred, parseTiingo } from '../worker/data';

const BASE = 'https://ameyapurandare.com/projects/stock-analysis/app';

describe('data parsing', () => {
	it('accepts real ticker formats and rejects junk', () => {
		expect(normalizeTicker('aapl')).toBe('AAPL');
		expect(normalizeTicker(' brk.b ')).toBe('BRK.B');
		expect(normalizeTicker('BF-B')).toBe('BF-B');
		expect(normalizeTicker('SPY')).toBe('SPY');
		for (const bad of ['', '1ABC', 'TOOLONGTICKER', '../etc', 'A B', 'AAPL;DROP', 'A.B.C']) {
			expect(normalizeTicker(bad)).toBeNull();
		}
	});

	it('cleans Tiingo prices', () => {
		const data = parseTiingo(
			'X',
			{ name: ' Example Inc ', exchangeCode: 'NASDAQ' },
			[
				{ date: '2024-01-02T00:00:00.000Z', close: 10, adjClose: 9.5 },
				{ date: '2024-01-02T00:00:00.000Z', close: 10, adjClose: 9.5 }, // duplicate
				{ date: '2024-01-03T00:00:00.000Z', close: 11 }, // missing adjClose
				{ date: '2024-01-04T00:00:00.000Z', close: 12, adjClose: 11.4 },
			],
			'now',
		);
		expect(data).toEqual({
			ticker: 'X',
			name: 'Example Inc',
			exchange: 'NASDAQ',
			dates: ['2024-01-02', '2024-01-04'],
			adjClose: [9.5, 11.4],
			close: [10, 12],
			fetchedAt: 'now',
		});
	});

	it('skips FRED missing values', () => {
		expect(
			parseFred({
				observations: [
					{ date: '2024-01-01', value: '5.33' },
					{ date: '2024-02-01', value: '.' },
					{ date: '2024-03-01', value: '5.25' },
				],
			}),
		).toEqual({ months: ['2024-01', '2024-03'], values: [5.33, 5.25] });
	});
});

describe('worker', () => {
	let kv: Map<string, string>;
	let limiterOk: boolean;
	let env: Env;
	const fetchMock = vi.fn();

	const call = (path: string, init?: RequestInit) =>
		worker.fetch(new Request(`${BASE}${path}`, init) as never, env) as Promise<Response>;

	beforeEach(() => {
		kv = new Map();
		limiterOk = true;
		env = {
			ASSETS: { fetch: async (r: Request) => new Response(`asset:${new URL(r.url).pathname}`) } as never,
			CACHE: {
				get: async (k: string) => kv.get(k) ?? null,
				put: async (k: string, v: string) => void kv.set(k, v),
			} as never,
			LOOKUP_LIMITER: { limit: async () => ({ success: limiterOk }) } as never,
			TIINGO_API_KEY: 'tiingo-key',
			FRED_API_KEY: 'fred-key',
		};
		fetchMock.mockReset();
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => vi.unstubAllGlobals());

	const tiingoOk = () =>
		fetchMock.mockImplementation(async (url: string) =>
			url.includes('/prices')
				? Response.json([
						{ date: '2024-01-02T00:00:00.000Z', close: 10, adjClose: 10 },
						{ date: '2024-01-03T00:00:00.000Z', close: 11, adjClose: 11 },
					])
				: Response.json({ name: 'Apple Inc', exchangeCode: 'NASDAQ' }),
		);

	it('serves app files with the URL prefix stripped', async () => {
		expect(await (await call('/')).text()).toBe('asset:/');
		expect(await (await call('/assets/app.js')).text()).toBe('asset:/assets/app.js');
		const redirect = await call('');
		expect(redirect.status).toBe(301);
		expect(redirect.headers.get('Location')).toBe(`${BASE}/`);
	});

	it('fetches a stock once, sends the key only to Tiingo, then serves it from cache', async () => {
		tiingoOk();
		const res = await call('/api/stock/aapl');
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toMatchObject({ ticker: 'AAPL', name: 'Apple Inc', dates: ['2024-01-02', '2024-01-03'] });
		expect(JSON.stringify(body)).not.toContain('tiingo-key');
		expect(fetchMock).toHaveBeenCalledTimes(2);
		for (const [url, init] of fetchMock.mock.calls) {
			expect(url).toMatch(/^https:\/\/api\.tiingo\.com\/tiingo\/daily\/AAPL/);
			expect(init.headers.Authorization).toBe('Token tiingo-key');
		}

		const again = await call('/api/stock/AAPL');
		expect(again.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('rejects bad tickers without calling the provider', async () => {
		const res = await call('/api/stock/%3Cscript%3E');
		expect(res.status).toBe(400);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('remembers unknown tickers briefly', async () => {
		fetchMock.mockResolvedValue(new Response('{}', { status: 404 }));
		expect((await call('/api/stock/ZZZZ')).status).toBe(404);
		expect(kv.get('stock:v1:ZZZZ')).toBe('missing');
		fetchMock.mockClear();
		expect((await call('/api/stock/ZZZZ')).status).toBe(404);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('rate-limits uncached lookups and explains provider quota errors', async () => {
		limiterOk = false;
		expect((await call('/api/stock/MSFT')).status).toBe(429);
		expect(fetchMock).not.toHaveBeenCalled();

		limiterOk = true;
		fetchMock.mockResolvedValue(new Response('{}', { status: 429 }));
		const res = await call('/api/stock/MSFT');
		expect(res.status).toBe(503);
		expect(((await res.json()) as { error: string }).error).toMatch(/daily data limit/);
		expect(kv.has('stock:v1:MSFT')).toBe(false);
	});

	it('fetches and caches macro data', async () => {
		fetchMock.mockImplementation(async (url: string) =>
			Response.json({ observations: [{ date: '2024-01-01', value: url.includes('FEDFUNDS') ? '5.33' : '1' }] }),
		);
		const res = await call('/api/macro');
		expect(res.status).toBe(200);
		expect(((await res.json()) as { fedFunds: unknown }).fedFunds).toEqual({ months: ['2024-01'], values: [5.33] });
		expect(fetchMock).toHaveBeenCalledTimes(3);
		await call('/api/macro');
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it('only allows GET on the API', async () => {
		expect((await call('/api/macro', { method: 'POST' })).status).toBe(405);
		expect((await call('/api/other')).status).toBe(404);
	});
});
