// Shapes shared by the Worker (which produces them) and the app (which reads them).

export interface StockData {
	ticker: string;
	name: string;
	exchange: string;
	/** Trading days, "YYYY-MM-DD", oldest first. */
	dates: string[];
	/** Closing prices adjusted for splits and dividends — use for returns. */
	adjClose: number[];
	/** Actual closing prices as traded — use for "current price". */
	close: number[];
	/** When this data was fetched from the provider (ISO timestamp). */
	fetchedAt: string;
}

export interface MonthlySeries {
	/** "YYYY-MM", oldest first. */
	months: string[];
	values: number[];
}

export interface MacroData {
	/** Effective federal funds rate, % (monthly average). */
	fedFunds: MonthlySeries;
	/** Consumer price index for all urban consumers (index level). */
	cpi: MonthlySeries;
	/** Unemployment rate, %. */
	unemployment: MonthlySeries;
	fetchedAt: string;
}

export interface ApiError {
	error: string;
}
