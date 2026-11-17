import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchStock } from '../src/api';

const keys = { tiingo: 'a'.repeat(40), fred: 'b'.repeat(32) };

/** Minimal in-memory stand-in for the browser's Cache Storage. */
function fakeCaches() {
	const store = new Map<string, Response>();
	const cache = {
		match: async (url: string) => store.get(url)?.clone(),
		put: async (url: string, res: Response) => void store.set(url, res),
	};
	return { open: async () => cache, delete: async () => store.clear() !== undefined, store };
}

describe('browser data cache', () => {
	let caches: ReturnType<typeof fakeCaches>;
	const fetchMock = vi.fn();

	beforeEach(() => {
		caches = fakeCaches();
		vi.stubGlobal('caches', caches);
		vi.stubGlobal('fetch', fetchMock);
		fetchMock.mockReset();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it('serves repeat lookups from this browser instead of using the visitor’s quota', async () => {
		fetchMock.mockImplementation(async () => Response.json({ ticker: 'AAPL', dates: ['2024-01-02'] }));
		await fetchStock('AAPL', keys);
		await fetchStock('AAPL', keys);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('refreshes after 12 hours, but falls back to the saved copy when offline', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		fetchMock.mockImplementation(async () => Response.json({ ticker: 'AAPL', dates: ['2024-01-02'] }));
		await fetchStock('AAPL', keys);

		vi.setSystemTime(Date.now() + 13 * 60 * 60 * 1000);
		fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
		expect(await fetchStock('AAPL', keys)).toMatchObject({ ticker: 'AAPL' });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('explains when a ticker was never looked up on this device and there is no connection', async () => {
		fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
		await expect(fetchStock('MSFT', keys)).rejects.toThrow(/offline/);
	});

	it('does not cache errors', async () => {
		fetchMock.mockImplementation(async () => Response.json({ error: 'No data found' }, { status: 404 }));
		await expect(fetchStock('ZZZZ', keys)).rejects.toThrow('No data found');
		expect(caches.store.size).toBe(0);
	});
});
