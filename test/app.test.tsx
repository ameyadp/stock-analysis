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

const fetchMock = vi.fn(async (url: string) => {
	if (url.endsWith('/api/macro')) return Response.json(macro);
	const ticker = decodeURIComponent(url.split('/api/stock/')[1] ?? '');
	if (ticker === 'ZZZZ') return Response.json({ error: 'No data found for "ZZZZ". Check the ticker symbol.' }, { status: 404 });
	return Response.json(makeStock(ticker));
});

beforeEach(() => {
	fetchMock.mockClear();
	vi.stubGlobal('fetch', fetchMock);
	window.history.replaceState(null, '', '/projects/stock-analysis/app/');
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('Stock Analysis app', () => {
	it('analyzes a ticker end to end', async () => {
		const user = userEvent.setup();
		render(<App />);
		expect(screen.getByText('How does a stock behave when the Fed moves?')).toBeTruthy();

		await user.type(screen.getByLabelText('Stock ticker'), 'aapl');
		await user.click(screen.getByRole('button', { name: 'Analyze' }));

		expect(await screen.findByRole('heading', { name: /AAPL Corp/ })).toBeTruthy();
		expect(screen.getByText('Return, 1 year')).toBeTruthy();
		expect(screen.getByText('Worst fall')).toBeTruthy();
		expect(screen.getByRole('img', { name: 'Price history for AAPL' })).toBeTruthy();
		expect(await screen.findByText('Through Fed rate cycles')).toBeTruthy();
		expect(screen.getByText('Cycle by cycle')).toBeTruthy();
		expect(screen.getByText('Sensitivity to the economy')).toBeTruthy();
		expect(screen.getAllByText(/^(Clear link|Could be noise)$/)).toHaveLength(3);
		expect(window.location.search).toBe('?t=AAPL');
		expect(fetchMock.mock.calls.map(([url]) => url)).toContainEqual(expect.stringMatching(/\/api\/stock\/AAPL$/));
	});

	it('loads the ticker from a shared link', async () => {
		window.history.replaceState(null, '', '/projects/stock-analysis/app/?t=nvda');
		render(<App />);
		expect(await screen.findByRole('heading', { name: /NVDA Corp/ })).toBeTruthy();
	});

	it('switches tickers from the example chips', async () => {
		const user = userEvent.setup();
		render(<App />);
		await user.click(screen.getByRole('button', { name: 'JPM' }));
		expect(await screen.findByRole('heading', { name: /JPM Corp/ })).toBeTruthy();
		await user.click(screen.getByRole('button', { name: 'XOM' }));
		expect(await screen.findByRole('heading', { name: /XOM Corp/ })).toBeTruthy();
	});

	it('shows a readable error for unknown tickers', async () => {
		const user = userEvent.setup();
		render(<App />);
		await user.type(screen.getByLabelText('Stock ticker'), 'ZZZZ{Enter}');
		expect((await screen.findByRole('alert')).textContent).toMatch(/No data found for "ZZZZ"/);
	});

	it('still shows price analysis if economic data is unavailable', async () => {
		fetchMock.mockImplementation(async (url: string) =>
			url.endsWith('/api/macro') ? Response.json({ error: 'The economic data provider is unavailable right now.' }, { status: 502 }) : Response.json(makeStock('SPY')),
		);
		window.history.replaceState(null, '', '/projects/stock-analysis/app/?t=SPY');
		render(<App />);
		expect(await screen.findByRole('heading', { name: /SPY Corp/ })).toBeTruthy();
		await waitFor(() => expect(screen.getByText(/Economic data unavailable/)).toBeTruthy());
		expect(screen.queryByText('Through Fed rate cycles')).toBeNull();
	});
});
