import type { MacroData, MonthlySeries, StockData } from './types';

// All statistics are computed in the browser from the raw price and macro data.
// Returns are expressed as fractions (0.12 = 12%) unless the name says otherwise.

const TRADING_DAYS = 252;

// ---------- Price & trend ----------

/** Simple moving average; null until enough points exist. */
export function sma(values: number[], window: number): (number | null)[] {
	const out: (number | null)[] = new Array(values.length).fill(null);
	let sum = 0;
	for (let i = 0; i < values.length; i++) {
		sum += values[i]!;
		if (i >= window) sum -= values[i - window]!;
		if (i >= window - 1) out[i] = sum / window;
	}
	return out;
}

export interface Cross {
	date: string;
	kind: 'golden' | 'death';
}

/** Golden cross: short average moves above long average. Death cross: the reverse. */
export function crosses(dates: string[], short: (number | null)[], long: (number | null)[]): Cross[] {
	const out: Cross[] = [];
	let prev: number | null = null;
	for (let i = 0; i < dates.length; i++) {
		const s = short[i];
		const l = long[i];
		if (s == null || l == null) continue;
		const sign = Math.sign(s - l);
		if (sign === 0) continue;
		if (prev !== null && sign !== prev) out.push({ date: dates[i]!, kind: sign > 0 ? 'golden' : 'death' });
		prev = sign;
	}
	return out;
}

function shiftYears(isoDate: string, years: number): string {
	return `${Number(isoDate.slice(0, 4)) - years}${isoDate.slice(4)}`;
}

/** Index of the first date on or after `target` (dates sorted ascending). */
function firstIndexOnOrAfter(dates: string[], target: string): number {
	let lo = 0;
	let hi = dates.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (dates[mid]! < target) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

/** Total return over the trailing N years, or null if history is shorter than that. */
export function trailingReturn(dates: string[], prices: number[], years: number): number | null {
	if (dates.length < 2) return null;
	const target = shiftYears(dates[dates.length - 1]!, years);
	if (dates[0]! > target) return null;
	const i = firstIndexOnOrAfter(dates, target);
	return prices[prices.length - 1]! / prices[i]! - 1;
}

const yearsBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / (365.25 * 24 * 3600 * 1000);

/** Compound annual growth rate over the whole series. */
export function cagr(dates: string[], prices: number[]): number | null {
	if (dates.length < 2) return null;
	const years = yearsBetween(dates[0]!, dates[dates.length - 1]!);
	if (years < 1) return null;
	return (prices[prices.length - 1]! / prices[0]!) ** (1 / years) - 1;
}

export interface Drawdown {
	/** Negative fraction, e.g. -0.55 for a 55% fall. */
	depth: number;
	peakDate: string;
	troughDate: string;
	/** Date the price got back above the old peak, or null if it hasn't yet. */
	recoveryDate: string | null;
}

/** Largest peak-to-trough fall. */
export function maxDrawdown(dates: string[], prices: number[]): Drawdown | null {
	if (prices.length < 2) return null;
	let peak = 0;
	let best: { depth: number; peak: number; trough: number } = { depth: 0, peak: 0, trough: 0 };
	for (let i = 1; i < prices.length; i++) {
		if (prices[i]! > prices[peak]!) peak = i;
		const depth = prices[i]! / prices[peak]! - 1;
		if (depth < best.depth) best = { depth, peak, trough: i };
	}
	if (best.depth === 0) return null;
	let recovery: number | null = null;
	for (let i = best.trough + 1; i < prices.length; i++) {
		if (prices[i]! >= prices[best.peak]!) {
			recovery = i;
			break;
		}
	}
	return {
		depth: best.depth,
		peakDate: dates[best.peak]!,
		troughDate: dates[best.trough]!,
		recoveryDate: recovery === null ? null : dates[recovery]!,
	};
}

/** Annualized volatility of daily log returns over the last `days` trading days. */
export function volatility(prices: number[], days = TRADING_DAYS): number | null {
	const start = Math.max(1, prices.length - days);
	const rets: number[] = [];
	for (let i = start; i < prices.length; i++) rets.push(Math.log(prices[i]! / prices[i - 1]!));
	if (rets.length < 20) return null;
	return stdev(rets) * Math.sqrt(TRADING_DAYS);
}

export function range52w(dates: string[], prices: number[]): { low: number; high: number } | null {
	if (dates.length === 0) return null;
	const i = firstIndexOnOrAfter(dates, shiftYears(dates[dates.length - 1]!, 1));
	const slice = prices.slice(i);
	return { low: Math.min(...slice), high: Math.max(...slice) };
}

// ---------- Monthly data ----------

export interface MonthlyReturn {
	month: string;
	ret: number;
}

/** Month-over-month returns from the last trading day of each month. The current partial month is excluded. */
export function monthlyReturns(dates: string[], prices: number[], today = new Date().toISOString().slice(0, 7)): MonthlyReturn[] {
	const monthEnd = new Map<string, number>();
	for (let i = 0; i < dates.length; i++) monthEnd.set(dates[i]!.slice(0, 7), prices[i]!);
	const months = [...monthEnd.keys()].filter((m) => m < today);
	const out: MonthlyReturn[] = [];
	for (let i = 1; i < months.length; i++) {
		if (!isNextMonth(months[i - 1]!, months[i]!)) continue; // skip gaps in the data
		out.push({ month: months[i]!, ret: monthEnd.get(months[i]!)! / monthEnd.get(months[i - 1]!)! - 1 });
	}
	return out;
}

function isNextMonth(a: string, b: string): boolean {
	const [ay, am] = a.split('-').map(Number) as [number, number];
	const [by, bm] = b.split('-').map(Number) as [number, number];
	return by * 12 + bm - (ay * 12 + am) === 1;
}

const toMap = (s: MonthlySeries) => new Map(s.months.map((m, i) => [m, s.values[i]!]));

/** Year-over-year inflation in percent, from CPI index levels. */
export function inflationYoY(cpi: MonthlySeries): MonthlySeries {
	const byMonth = toMap(cpi);
	const months: string[] = [];
	const values: number[] = [];
	for (const m of cpi.months) {
		const prior = byMonth.get(`${Number(m.slice(0, 4)) - 1}${m.slice(4)}`);
		if (prior === undefined) continue;
		months.push(m);
		values.push((byMonth.get(m)! / prior - 1) * 100);
	}
	return { months, values };
}

/** Month-over-month change in percentage points. */
export function monthlyChange(series: MonthlySeries): Map<string, number> {
	const out = new Map<string, number>();
	for (let i = 1; i < series.months.length; i++) {
		if (isNextMonth(series.months[i - 1]!, series.months[i]!)) {
			out.set(series.months[i]!, series.values[i]! - series.values[i - 1]!);
		}
	}
	return out;
}

// ---------- Rate cycles ----------

export type Regime = 'hiking' | 'holding' | 'cutting';

export interface RegimePeriod {
	regime: Regime;
	start: string;
	end: string;
	/** Fed funds rate at the start and end of the period, %. */
	rateStart: number;
	rateEnd: number;
}

/**
 * Classify each month by the change in the Fed funds rate over the previous 6 months:
 * up ≥ 0.25 points = hiking, down ≥ 0.25 points = cutting, otherwise holding.
 * Runs shorter than `minMonths` are folded into the run before them, so brief
 * wobbles don't count as cycles.
 */
export function rateRegimes(fedFunds: MonthlySeries, lookback = 6, threshold = 0.25, minMonths = 3): RegimePeriod[] {
	const { months, values } = fedFunds;
	const labels: { month: string; regime: Regime; rate: number }[] = [];
	for (let i = lookback; i < months.length; i++) {
		const change = values[i]! - values[i - lookback]!;
		const regime: Regime = change >= threshold ? 'hiking' : change <= -threshold ? 'cutting' : 'holding';
		labels.push({ month: months[i]!, regime, rate: values[i]! });
	}

	const periods: (RegimePeriod & { length: number })[] = [];
	for (const l of labels) {
		const last = periods[periods.length - 1];
		if (last && last.regime === l.regime) {
			last.end = l.month;
			last.rateEnd = l.rate;
			last.length++;
		} else {
			periods.push({ regime: l.regime, start: l.month, end: l.month, rateStart: l.rate, rateEnd: l.rate, length: 1 });
		}
	}

	// Fold short runs into the previous period, then merge neighbours that now match.
	const merged: (RegimePeriod & { length: number })[] = [];
	for (const p of periods) {
		const last = merged[merged.length - 1];
		if (last && (p.length < minMonths || p.regime === last.regime)) {
			last.end = p.end;
			last.rateEnd = p.rateEnd;
			last.length += p.length;
		} else {
			merged.push({ ...p });
		}
	}
	return merged.map(({ length: _length, ...p }) => p);
}

export interface RegimeStats {
	regime: Regime;
	months: number;
	/** Annualized return across all months in this regime. */
	annualized: number;
	/** Share of months with a positive return. */
	positiveShare: number;
}

export interface PeriodPerformance extends RegimePeriod {
	/** Total stock return over the period, or null if the stock has no data then. */
	stockReturn: number | null;
	months: number;
}

function regimeOfMonth(periods: RegimePeriod[]): Map<string, Regime> {
	const out = new Map<string, Regime>();
	for (const p of periods) {
		for (let m = p.start; m <= p.end; m = nextMonth(m)) out.set(m, p.regime);
	}
	return out;
}

function nextMonth(m: string): string {
	const [y, mo] = m.split('-').map(Number) as [number, number];
	return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
}

const compound = (rets: number[]) => rets.reduce((acc, r) => acc * (1 + r), 1) - 1;

export function regimePerformance(
	periods: RegimePeriod[],
	returns: MonthlyReturn[],
): { byRegime: RegimeStats[]; periods: PeriodPerformance[] } {
	const regimeFor = regimeOfMonth(periods);
	const grouped: Record<Regime, number[]> = { hiking: [], holding: [], cutting: [] };
	for (const r of returns) {
		const regime = regimeFor.get(r.month);
		if (regime) grouped[regime].push(r.ret);
	}

	const byRegime = (Object.keys(grouped) as Regime[]).map((regime) => {
		const rets = grouped[regime];
		return {
			regime,
			months: rets.length,
			annualized: rets.length ? (1 + compound(rets)) ** (12 / rets.length) - 1 : 0,
			positiveShare: rets.length ? rets.filter((r) => r > 0).length / rets.length : 0,
		};
	});

	const retByMonth = new Map(returns.map((r) => [r.month, r.ret]));
	const perf = periods.map((p) => {
		const rets: number[] = [];
		for (let m = p.start; m <= p.end; m = nextMonth(m)) {
			const r = retByMonth.get(m);
			if (r !== undefined) rets.push(r);
		}
		return { ...p, months: rets.length, stockReturn: rets.length ? compound(rets) : null };
	});

	return { byRegime, periods: perf };
}

// ---------- Macro sensitivity ----------

export function mean(xs: number[]): number {
	return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function stdev(xs: number[]): number {
	const m = mean(xs);
	return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export function correlation(xs: number[], ys: number[]): number | null {
	if (xs.length !== ys.length || xs.length < 3) return null;
	const mx = mean(xs);
	const my = mean(ys);
	let sxy = 0;
	let sxx = 0;
	let syy = 0;
	for (let i = 0; i < xs.length; i++) {
		const dx = xs[i]! - mx;
		const dy = ys[i]! - my;
		sxy += dx * dy;
		sxx += dx * dx;
		syy += dy * dy;
	}
	return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

/** Invert a small square matrix with Gauss–Jordan elimination. Returns null if singular. */
function invert(a: number[][]): number[][] | null {
	const n = a.length;
	const m = a.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
	for (let col = 0; col < n; col++) {
		let pivot = col;
		for (let r = col + 1; r < n; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
		if (Math.abs(m[pivot]![col]!) < 1e-12) return null;
		[m[col], m[pivot]] = [m[pivot]!, m[col]!];
		const div = m[col]![col]!;
		for (let c = 0; c < 2 * n; c++) m[col]![c]! /= div;
		for (let r = 0; r < n; r++) {
			if (r === col) continue;
			const f = m[r]![col]!;
			for (let c = 0; c < 2 * n; c++) m[r]![c]! -= f * m[col]![c]!;
		}
	}
	return m.map((row) => row.slice(n));
}

export interface Regression {
	/** Intercept first, then one coefficient per predictor. */
	coefficients: number[];
	standardErrors: number[];
	tStats: number[];
	rSquared: number;
	n: number;
}

/** Ordinary least squares of y on the predictor columns, with an intercept. */
export function ols(y: number[], predictors: number[][]): Regression | null {
	const n = y.length;
	const k = predictors.length + 1;
	if (n <= k + 2 || predictors.some((p) => p.length !== n)) return null;

	const X = y.map((_, i) => [1, ...predictors.map((p) => p[i]!)]);
	const XtX = Array.from({ length: k }, (_, a) => Array.from({ length: k }, (_, b) => X.reduce((s, row) => s + row[a]! * row[b]!, 0)));
	const inv = invert(XtX);
	if (!inv) return null;
	const Xty = Array.from({ length: k }, (_, a) => X.reduce((s, row, i) => s + row[a]! * y[i]!, 0));
	const beta = inv.map((row) => row.reduce((s, v, j) => s + v * Xty[j]!, 0));

	const residuals = X.map((row, i) => y[i]! - row.reduce((s, v, j) => s + v * beta[j]!, 0));
	const sse = residuals.reduce((s, r) => s + r * r, 0);
	const my = mean(y);
	const sst = y.reduce((s, v) => s + (v - my) ** 2, 0);
	const sigma2 = sse / (n - k);
	const se = inv.map((row, j) => Math.sqrt(sigma2 * row[j]!));

	return {
		coefficients: beta,
		standardErrors: se,
		tStats: beta.map((b, j) => b / se[j]!),
		rSquared: sst ? 1 - sse / sst : 0,
		n,
	};
}

export interface MacroFactor {
	key: 'fedFunds' | 'inflation' | 'unemployment';
	label: string;
	/** Average change in the stock's monthly return (fraction) per +1 percentage point move in the factor. */
	beta: number;
	tStat: number;
	/** |t| ≥ 2: roughly, unlikely to be chance at the 95% level. */
	significant: boolean;
	correlation: number | null;
}

export interface MacroSensitivity {
	factors: MacroFactor[];
	rSquared: number;
	months: number;
	start: string;
	end: string;
	/** Rolling 36-month correlation of monthly returns with Fed funds changes. */
	rollingFedCorrelation: { month: string; value: number }[];
}

/**
 * Regress the stock's monthly returns on same-month changes in the Fed funds rate,
 * inflation and unemployment (all in percentage points). Using changes rather
 * than levels avoids the spurious correlation you get between any two series
 * that trend over decades.
 */
export function macroSensitivity(returns: MonthlyReturn[], macro: MacroData, rollingWindow = 36): MacroSensitivity | null {
	const dFed = monthlyChange(macro.fedFunds);
	const dInfl = monthlyChange(inflationYoY(macro.cpi));
	const dUnemp = monthlyChange(macro.unemployment);

	const rows = returns.filter((r) => dFed.has(r.month) && dInfl.has(r.month) && dUnemp.has(r.month));
	if (rows.length < 36) return null;

	const y = rows.map((r) => r.ret);
	const xs = [rows.map((r) => dFed.get(r.month)!), rows.map((r) => dInfl.get(r.month)!), rows.map((r) => dUnemp.get(r.month)!)];
	const fit = ols(y, xs);
	if (!fit) return null;

	const meta = [
		['fedFunds', 'Fed funds rate'],
		['inflation', 'Inflation'],
		['unemployment', 'Unemployment'],
	] as const;

	const rolling: { month: string; value: number }[] = [];
	for (let i = rollingWindow; i <= rows.length; i++) {
		const c = correlation(y.slice(i - rollingWindow, i), xs[0]!.slice(i - rollingWindow, i));
		if (c !== null) rolling.push({ month: rows[i - 1]!.month, value: c });
	}

	return {
		factors: meta.map(([key, label], j) => ({
			key,
			label,
			beta: fit.coefficients[j + 1]!,
			tStat: fit.tStats[j + 1]!,
			significant: Math.abs(fit.tStats[j + 1]!) >= 2,
			correlation: correlation(y, xs[j]!),
		})),
		rSquared: fit.rSquared,
		months: rows.length,
		start: rows[0]!.month,
		end: rows[rows.length - 1]!.month,
		rollingFedCorrelation: rolling,
	};
}

// ---------- Summary ----------

export interface Summary {
	lastClose: number;
	lastDate: string;
	firstDate: string;
	dayChange: number | null;
	returns: { label: string; value: number | null }[];
	cagr: number | null;
	volatility: number | null;
	drawdown: Drawdown | null;
	range52w: { low: number; high: number } | null;
	trend: { above200: boolean; lastCross: Cross | null } | null;
}

export function summarize(stock: StockData): Summary {
	const { dates, adjClose, close } = stock;
	const n = dates.length;
	const s50 = sma(adjClose, 50);
	const s200 = sma(adjClose, 200);
	const allCrosses = crosses(dates, s50, s200);
	const last50 = s50[n - 1];
	const last200 = s200[n - 1];
	return {
		lastClose: close[n - 1]!,
		lastDate: dates[n - 1]!,
		firstDate: dates[0]!,
		dayChange: n > 1 ? adjClose[n - 1]! / adjClose[n - 2]! - 1 : null,
		returns: [
			{ label: '1 year', value: trailingReturn(dates, adjClose, 1) },
			{ label: '5 years', value: trailingReturn(dates, adjClose, 5) },
			{ label: '10 years', value: trailingReturn(dates, adjClose, 10) },
		],
		cagr: cagr(dates, adjClose),
		volatility: volatility(adjClose),
		drawdown: maxDrawdown(dates, adjClose),
		range52w: range52w(dates, close),
		trend:
			last50 != null && last200 != null
				? { above200: last50 > last200, lastCross: allCrosses[allCrosses.length - 1] ?? null }
				: null,
	};
}
