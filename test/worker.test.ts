import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../worker/index';
import { isFredKey, isTiingoKey, normalizeTicker, parseFred, parseTiingo } from '../worker/data';
import { parsePing } from '../worker/ping';

const BASE = 'https://ameyapurandare.com/projects/stock-analysis/app';
const TIINGO = 'a'.repeat(40);
const FRED = 'b'.repeat(32);

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

	it('recognizes key formats', () => {
		expect(isTiingoKey('0123456789abcdef0123456789ABCDEF01234567')).toBe(true);
		expect(isTiingoKey('xyz')).toBe(false);
		expect(isTiingoKey(null)).toBe(false);
		expect(isFredKey('0123456789abcdefghijklmnopqrstuv')).toBe(true);
		expect(isFredKey('0123456789ABCDEFGHIJKLMNOPQRSTUV')).toBe(false);
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

	it('validates usage pings', () => {
		const id = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b';
		expect(parsePing({ id, event: 'setup_complete', v: '0.2.0' })).toEqual({ id, event: 'setup_complete', version: '0.2.0' });
		expect(parsePing({ id, event: 'install', v: '0.3.0' })).toEqual({ id, event: 'install', version: '0.3.0' });
		expect(parsePing({ id, event: 'uninstall', v: '0.2.0' })).toBeNull();
		expect(parsePing({ id: 'nope', event: 'active', v: '0.2.0' })).toBeNull();
		expect(parsePing({ id, event: 'active', v: '<b>' })).toBeNull();
	});
});

describe('worker', () => {
	let limiterOk: boolean;
	let inserted: unknown[][];
	let env: Env;
	const fetchMock = vi.fn();

	const call = (path: string, init?: RequestInit) => worker.fetch(new Request(`${BASE}${path}`, init) as never, env) as Promise<Response>;
	const withKeys = (headers: Record<string, string> = {}) => ({ headers: { 'X-Tiingo-Key': TIINGO, 'X-Fred-Key': FRED, ...headers } });

	beforeEach(() => {
		limiterOk = true;
		inserted = [];
		env = {
			// Fake static files: "/" and anything under /assets/app exist; everything else is missing.
			ASSETS: {
				fetch: async (r: Request) => {
					const p = new URL(r.url).pathname;
					if (p === '/index.html' || p === '/folder') return new Response(null, { status: 307, headers: { Location: p === '/folder' ? '/folder/' : '/' } });
					return p === '/' || p.startsWith('/assets/app') ? new Response(`asset:${p}`) : new Response('missing', { status: 404 });
				},
			} as never,
			DB: {
				prepare: () => ({ bind: (...args: unknown[]) => ({ run: async () => void inserted.push(args) }) }),
			} as never,
			LOOKUP_LIMITER: { limit: async () => ({ success: limiterOk }) } as never,
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

	it('serves index.html as the app page and keeps redirects inside the app', async () => {
		const index = await call('/index.html');
		expect(index.status).toBe(200);
		expect(await index.text()).toBe('asset:/');
		const redirect = await call('/folder');
		expect(redirect.status).toBe(307);
		expect(redirect.headers.get('Location')).toBe(`${BASE}/folder/`);
	});

	it('shows the app for unknown page addresses but 404s for missing files', async () => {
		expect(await (await call('/some/page')).text()).toBe('asset:/');
		const oldScript = await call('/assets/index-OLDHASH.js');
		expect(oldScript.status).toBe(404);
	});

	it('relays a stock lookup with the visitor’s own key and never caches it', async () => {
		tiingoOk();
		const res = await call('/api/stock/aapl', withKeys());
		expect(res.status).toBe(200);
		expect(res.headers.get('Cache-Control')).toBe('private, no-store');
		const body = await res.json();
		expect(body).toMatchObject({ ticker: 'AAPL', name: 'Apple Inc', dates: ['2024-01-02', '2024-01-03'] });
		expect(JSON.stringify(body)).not.toContain(TIINGO);
		for (const [url, init] of fetchMock.mock.calls) {
			expect(url).toMatch(/^https:\/\/api\.tiingo\.com\/tiingo\/daily\/AAPL/);
			expect(init.headers.Authorization).toBe(`Token ${TIINGO}`);
		}

		// No server-side cache: a second lookup goes to the provider again.
		await call('/api/stock/AAPL', withKeys());
		expect(fetchMock).toHaveBeenCalledTimes(4);
	});

	it('requires a well-formed key before contacting the provider', async () => {
		expect((await call('/api/stock/AAPL')).status).toBe(401);
		expect((await call('/api/stock/AAPL', { headers: { 'X-Tiingo-Key': 'short' } })).status).toBe(401);
		expect((await call('/api/macro')).status).toBe(401);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('rejects bad tickers without calling the provider', async () => {
		expect((await call('/api/stock/%3Cscript%3E', withKeys())).status).toBe(400);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('explains rejected keys, unknown tickers and quota limits', async () => {
		fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
		let res = await call('/api/stock/MSFT', withKeys());
		expect(res.status).toBe(401);
		expect(((await res.json()) as { error: string }).error).toMatch(/Tiingo rejected your API key/);

		fetchMock.mockResolvedValue(new Response('{}', { status: 404 }));
		expect((await call('/api/stock/ZZZZ', withKeys())).status).toBe(404);

		fetchMock.mockResolvedValue(new Response('{}', { status: 429 }));
		res = await call('/api/stock/MSFT', withKeys());
		expect(res.status).toBe(429);
		expect(((await res.json()) as { error: string }).error).toMatch(/usage limit/);

		fetchMock.mockImplementation(async () =>
			Response.json({ error_code: 400, error_message: 'Bad Request.  The value for variable api_key is not registered.' }, { status: 400 }),
		);
		res = await call('/api/macro', withKeys());
		expect(res.status).toBe(401);
		expect(((await res.json()) as { error: string }).error).toMatch(/FRED rejected your API key/);
	});

	it('rate-limits relay requests per visitor', async () => {
		limiterOk = false;
		expect((await call('/api/stock/MSFT', withKeys())).status).toBe(429);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('relays macro data with the visitor’s FRED key', async () => {
		fetchMock.mockImplementation(async (url: string) =>
			Response.json({ observations: [{ date: '2024-01-01', value: url.includes('FEDFUNDS') ? '5.33' : '1' }] }),
		);
		const res = await call('/api/macro', withKeys());
		expect(res.status).toBe(200);
		expect(((await res.json()) as { fedFunds: unknown }).fedFunds).toEqual({ months: ['2024-01'], values: [5.33] });
		expect(fetchMock).toHaveBeenCalledTimes(3);
		for (const [url] of fetchMock.mock.calls) expect(url).toContain(`api_key=${FRED}`);
	});

	it('records valid usage pings and rejects anything else', async () => {
		const ping = (body: string) => call('/api/ping', { method: 'POST', body });
		const id = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b';
		expect((await ping(JSON.stringify({ id, event: 'active', v: '0.2.0' }))).status).toBe(204);
		expect(inserted).toEqual([[expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), 'active', id, '0.2.0']]);
		expect((await ping('not json')).status).toBe(400);
		expect((await ping(JSON.stringify({ id, event: 'purchase', v: '0.2.0' }))).status).toBe(400);
		expect((await ping('x'.repeat(2000))).status).toBe(413);
		expect((await call('/api/ping')).status).toBe(405);
		expect(inserted).toHaveLength(1);
	});

	it('only allows GET on the data API', async () => {
		expect((await call('/api/macro', { method: 'POST' })).status).toBe(405);
		expect((await call('/api/other', withKeys())).status).toBe(404);
	});
});
