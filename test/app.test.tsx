// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MacroData, MonthlySeries, StockData } from '../src/lib/types';

// uPlot draws on <canvas>, which jsdom doesn't support; the chart math is tested separately.
vi.mock('../src/components/UPlotChart', () => ({
	UPlotChart: ({ label }: { label: string }) => <div role="img" aria-label={label} />,
	cssVar: () => '#000',
}));

const { default: App } = await import('../src/App');

const TIINGO = '0123456789abcdef0123456789abcdef01234567';
const FRED = 'abcdefghijklmnopqrstuvwxyz012345';

function makeStock(ticker: string): StockData {
	const dates: string[] = [];
	const adjClose: number[] = [];
	let d = Date.UTC(2004, 0, 2);
	for (let i = 0; i < 5200; i++, d += 86400000 * 1.4) {
		dates.push(new Date(d).toISOString().slice(0, 10));
		adjClose.push(50 * Math.exp(i * 0.0003 + 0.15 * Math.sin(i / 90)));
	}
	return { ticker, name: `${ticker} Corp`, exchange: 'NYSE', dates, adjClose, close: adjClose, fetchedAt: '' };
}

function monthly(fn: (i: number) => number): MonthlySeries {
	const months: string[] = [];
	const values: number[] = [];
	for (let i = 0; i < 12 * 26; i++) {
		months.push(`${2000 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`);
		values.push(fn(i));
	}
	return { months, values };
}

const macro: MacroData = {
	fedFunds: monthly((i) => Math.max(0.1, 2.5 + 2.4 * Math.sin(i / 20))),
	cpi: monthly((i) => 170 * 1.002 ** i * (1 + 0.003 * Math.sin(i / 3))),
	unemployment: monthly((i) => 5 + 1.5 * Math.cos(i / 25)),
	fetchedAt: '',
};

/** Fake relay: checks the visitor's key headers like the real Worker does. */
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
	const headers = (init?.headers ?? {}) as Record<string, string>;
	if (url.endsWith('/api/macro')) {
		return headers['X-Fred-Key'] === FRED
			? Response.json(macro)
			: Response.json({ error: 'FRED rejected your API key. Check it in Data keys.' }, { status: 401 });
	}
	if (headers['X-Tiingo-Key'] !== TIINGO) {
		return Response.json({ error: 'Tiingo rejected your API key. Check it in Data keys.' }, { status: 401 });
	}
	const ticker = decodeURIComponent(url.split('/api/stock/')[1] ?? '');
	if (ticker === 'ZZZZ') return Response.json({ error: 'No data found for "ZZZZ". Check the ticker symbol.' }, { status: 404 });
	return Response.json(makeStock(ticker));
});

const saveKeys = () => {
	localStorage.setItem('stock-analysis:tiingo-key', TIINGO);
	localStorage.setItem('stock-analysis:fred-key', FRED);
};

beforeEach(() => {
	localStorage.clear();
	localStorage.setItem('stock-analysis:telemetry-consent', 'denied');
	fetchMock.mockClear();
	vi.stubGlobal('fetch', fetchMock);
	window.history.replaceState(null, '', '/projects/stock-analysis/app/');
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('first-time setup', () => {
	it('asks for keys, checks their format, tests them, and saves them', async () => {
		const user = userEvent.setup();
		render(<App />);
		expect(screen.getByRole('heading', { name: 'Connect your free data keys' })).toBeTruthy();

		await user.type(screen.getByLabelText('Tiingo API token'), 'too-short');
		await user.type(screen.getByLabelText('FRED API key'), 'NOPE');
		await user.click(screen.getByRole('button', { name: 'Test & save' }));
		expect(screen.getByText(/A Tiingo token is 40 letters/)).toBeTruthy();
		expect(screen.getByText(/A FRED key is 32 lowercase/)).toBeTruthy();
		expect(fetchMock).not.toHaveBeenCalled();

		await user.clear(screen.getByLabelText('Tiingo API token'));
		await user.type(screen.getByLabelText('Tiingo API token'), TIINGO.toUpperCase());
		await user.clear(screen.getByLabelText('FRED API key'));
		await user.type(screen.getByLabelText('FRED API key'), ` ${FRED} `);
		await user.click(screen.getByRole('button', { name: 'Test & save' }));

		await waitFor(() => expect(screen.queryByRole('heading', { name: 'Connect your free data keys' })).toBeNull());
		expect(localStorage.getItem('stock-analysis:tiingo-key')).toBe(TIINGO);
		expect(localStorage.getItem('stock-analysis:fred-key')).toBe(FRED);
		expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/api/stock/SPY'))).toBe(true);

		await user.click(screen.getByRole('button', { name: 'AAPL' }));
		expect(await screen.findByRole('heading', { name: /AAPL Corp/ })).toBeTruthy();
	});

	it('points to the key the provider rejected and does not save', async () => {
		const user = userEvent.setup();
		render(<App />);
		await user.type(screen.getByLabelText('Tiingo API token'), 'f'.repeat(40));
		await user.type(screen.getByLabelText('FRED API key'), FRED);
		await user.click(screen.getByRole('button', { name: 'Test & save' }));
		expect(await screen.findByText(/Tiingo rejected your API key/)).toBeTruthy();
		expect(screen.getByLabelText('Tiingo API token').getAttribute('aria-invalid')).toBe('true');
		expect(screen.getByLabelText('FRED API key').getAttribute('aria-invalid')).toBe('false');
		expect(localStorage.getItem('stock-analysis:tiingo-key')).toBeNull();
	});

	it('asks for usage consent once and remembers the answer', async () => {
		localStorage.removeItem('stock-analysis:telemetry-consent');
		const user = userEvent.setup();
		render(<App />);
		await user.click(screen.getByRole('button', { name: 'No thanks' }));
		expect(screen.queryByRole('region', { name: 'Usage sharing' })).toBeNull();
		expect(localStorage.getItem('stock-analysis:telemetry-consent')).toBe('denied');
	});

	it('lets people remove their keys', async () => {
		saveKeys();
		const user = userEvent.setup();
		render(<App />);
		await user.click(screen.getByRole('button', { name: '🔑 Data keys' }));
		await user.click(screen.getByRole('button', { name: 'Remove keys from this browser' }));
		expect(screen.getByRole('heading', { name: 'Connect your free data keys' })).toBeTruthy();
		expect(localStorage.getItem('stock-analysis:tiingo-key')).toBeNull();
	});
});

describe('analysis with saved keys', () => {
	beforeEach(saveKeys);

	it('analyzes a ticker end to end, sending the visitor’s own keys', async () => {
		const user = userEvent.setup();
		render(<App />);
		expect(screen.getByText('How does a stock behave when the Fed moves?')).toBeTruthy();

		await user.type(screen.getByLabelText('Stock ticker'), 'aapl');
		await user.click(screen.getByRole('button', { name: 'Analyze' }));

		expect(await screen.findByRole('heading', { name: /AAPL Corp/ })).toBeTruthy();
		expect(screen.getByText('Return, 1 year')).toBeTruthy();
		expect(screen.getByRole('img', { name: 'Price history for AAPL' })).toBeTruthy();
		expect(await screen.findByText('Through Fed rate cycles')).toBeTruthy();
		expect(screen.getByText('Sensitivity to the economy')).toBeTruthy();
		expect(screen.getAllByText(/^(Clear link|Could be noise)$/)).toHaveLength(3);
		expect(window.location.search).toBe('?t=AAPL');

		const stockCall = fetchMock.mock.calls.find(([url]) => url.endsWith('/api/stock/AAPL'))!;
		expect(stockCall[1]).toEqual({ headers: { 'X-Tiingo-Key': TIINGO } });
		const macroCall = fetchMock.mock.calls.find(([url]) => url.endsWith('/api/macro'))!;
		expect(macroCall[1]).toEqual({ headers: { 'X-Fred-Key': FRED } });
	});

	it('loads the ticker from a shared link', async () => {
		window.history.replaceState(null, '', '/projects/stock-analysis/app/?t=nvda');
		render(<App />);
		expect(await screen.findByRole('heading', { name: /NVDA Corp/ })).toBeTruthy();
	});

	it('shows a readable error for unknown tickers', async () => {
		const user = userEvent.setup();
		render(<App />);
		await user.type(screen.getByLabelText('Stock ticker'), 'ZZZZ{Enter}');
		expect((await screen.findByRole('alert')).textContent).toMatch(/No data found for "ZZZZ"/);
	});

	it('offers to update keys when a saved key stops working', async () => {
		localStorage.setItem('stock-analysis:tiingo-key', 'e'.repeat(40));
		const user = userEvent.setup();
		render(<App />);
		await user.click(screen.getByRole('button', { name: 'SPY' }));
		expect((await screen.findByRole('alert')).textContent).toMatch(/Tiingo rejected your API key/);
		await user.click(screen.getByRole('button', { name: 'Update data keys' }));
		expect(screen.getByRole('heading', { name: 'Data keys' })).toBeTruthy();
	});

	it('still shows price analysis if economic data is unavailable', async () => {
		fetchMock.mockImplementation(async (url: string) =>
			url.endsWith('/api/macro')
				? Response.json({ error: 'The economic data provider is unavailable right now.' }, { status: 502 })
				: Response.json(makeStock('SPY')),
		);
		window.history.replaceState(null, '', '/projects/stock-analysis/app/?t=SPY');
		render(<App />);
		expect(await screen.findByRole('heading', { name: /SPY Corp/ })).toBeTruthy();
		await waitFor(() => expect(screen.getByText(/Economic data unavailable/)).toBeTruthy());
		expect(screen.queryByText('Through Fed rate cycles')).toBeNull();
	});
});
