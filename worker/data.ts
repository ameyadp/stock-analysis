import type { MacroData, MonthlySeries, StockData } from '../src/lib/types';

// Fetching and cleaning data from Tiingo (stock prices) and FRED (macro data).
// Pure functions where possible so they can be unit-tested without the network.

export const YEARS_OF_HISTORY = 30;

/** Tickers like AAPL, BRK.B, BF-B, SPY. Rejects anything else before it reaches the provider. */
export function normalizeTicker(raw: string): string | null {
	const t = decodeURIComponent(raw).trim().toUpperCase();
	return /^[A-Z][A-Z0-9]{0,6}([.-][A-Z0-9]{1,3})?$/.test(t) ? t : null;
}

export function startDate(now: Date, years: number): string {
	return `${now.getUTCFullYear() - years}-01-01`;
}

export class ProviderError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
	}
}

interface TiingoMeta {
	ticker?: string;
	name?: string;
	exchangeCode?: string;
}

interface TiingoPrice {
	date?: string;
	close?: number;
	adjClose?: number;
}

export function parseTiingo(ticker: string, meta: TiingoMeta, prices: TiingoPrice[], fetchedAt: string): StockData {
	const dates: string[] = [];
	const adjClose: number[] = [];
	const close: number[] = [];
	for (const p of prices) {
		const date = p.date?.slice(0, 10);
		if (!date || !Number.isFinite(p.adjClose) || !Number.isFinite(p.close) || p.adjClose! <= 0) continue;
		if (dates.length && date <= dates[dates.length - 1]!) continue; // keep strictly increasing dates
		dates.push(date);
		adjClose.push(p.adjClose!);
		close.push(p.close!);
	}
	return {
		ticker,
		name: meta.name?.trim() || ticker,
		exchange: meta.exchangeCode ?? '',
		dates,
		adjClose,
		close,
		fetchedAt,
	};
}

export async function fetchStock(ticker: string, apiKey: string, now = new Date()): Promise<StockData> {
	const headers = { Authorization: `Token ${apiKey}`, Accept: 'application/json' };
	const base = `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(ticker)}`;
	const [metaRes, pricesRes] = await Promise.all([
		fetch(base, { headers }),
		fetch(`${base}/prices?startDate=${startDate(now, YEARS_OF_HISTORY)}&resampleFreq=daily`, { headers }),
	]);

	for (const res of [metaRes, pricesRes]) {
		if (res.status === 404) throw new ProviderError(`No data found for "${ticker}". Check the ticker symbol.`, 404);
		if (res.status === 429) throw new ProviderError('The daily data limit has been reached. Please try again later.', 503);
		if (!res.ok) throw new ProviderError('The stock data provider is unavailable right now. Please try again later.', 502);
	}

	const data = parseTiingo(ticker, (await metaRes.json()) as TiingoMeta, (await pricesRes.json()) as TiingoPrice[], now.toISOString());
	if (data.dates.length < 2) throw new ProviderError(`No price history found for "${ticker}".`, 404);
	return data;
}

interface FredResponse {
	observations?: { date?: string; value?: string }[];
}

/** FRED uses "." for missing values; those are skipped. */
export function parseFred(body: FredResponse): MonthlySeries {
	const months: string[] = [];
	const values: number[] = [];
	for (const o of body.observations ?? []) {
		const value = Number(o.value);
		if (!o.date || o.value === '.' || !Number.isFinite(value)) continue;
		months.push(o.date.slice(0, 7));
		values.push(value);
	}
	return { months, values };
}

export const FRED_SERIES = { fedFunds: 'FEDFUNDS', cpi: 'CPIAUCSL', unemployment: 'UNRATE' } as const;

export async function fetchMacro(apiKey: string, now = new Date()): Promise<MacroData> {
	// Two extra years so year-over-year inflation is available from the start of the stock history.
	const start = startDate(now, YEARS_OF_HISTORY + 2);
	const entries = await Promise.all(
		Object.entries(FRED_SERIES).map(async ([key, id]) => {
			const url =
				`https://api.stlouisfed.org/fred/series/observations?series_id=${id}` +
				`&observation_start=${start}&frequency=m&file_type=json&api_key=${encodeURIComponent(apiKey)}`;
			const res = await fetch(url);
			if (!res.ok) throw new ProviderError('The economic data provider is unavailable right now.', 502);
			return [key, parseFred((await res.json()) as FredResponse)] as const;
		}),
	);
	const series = Object.fromEntries(entries) as Record<keyof typeof FRED_SERIES, MonthlySeries>;
	return { ...series, fetchedAt: now.toISOString() };
}
