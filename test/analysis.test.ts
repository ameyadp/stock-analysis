import { describe, expect, it } from 'vitest';
import {
	cagr,
	correlation,
	crosses,
	inflationYoY,
	macroSensitivity,
	maxDrawdown,
	monthlyChange,
	monthlyReturns,
	ols,
	rateRegimes,
	regimePerformance,
	sma,
	summarize,
	trailingReturn,
	volatility,
} from '../src/lib/analysis';
import type { MacroData, MonthlySeries, StockData } from '../src/lib/types';

/** Consecutive "YYYY-MM" months starting at `start`. */
function months(start: string, count: number): string[] {
	const [y, m] = start.split('-').map(Number) as [number, number];
	return Array.from({ length: count }, (_, i) => {
		const total = y * 12 + (m - 1) + i;
		return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
	});
}

const series = (start: string, values: number[]): MonthlySeries => ({ months: months(start, values.length), values });

describe('price & trend', () => {
	it('computes simple moving averages', () => {
		expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
	});

	it('detects golden and death crosses', () => {
		const dates = ['d1', 'd2', 'd3', 'd4', 'd5'];
		const short = [null, 1, 3, 3, 1];
		const long = [null, 2, 2, 3, 2]; // equal on d4 is ignored
		expect(crosses(dates, short, long)).toEqual([
			{ date: 'd3', kind: 'golden' },
			{ date: 'd5', kind: 'death' },
		]);
	});

	it('measures trailing returns and growth rates', () => {
		const dates = ['2015-01-02', '2020-01-02', '2024-01-02', '2025-01-02'];
		const prices = [50, 100, 160, 200];
		expect(trailingReturn(dates, prices, 1)).toBeCloseTo(0.25);
		expect(trailingReturn(dates, prices, 5)).toBeCloseTo(1);
		expect(trailingReturn(dates, prices, 10)).toBeCloseTo(3);
		expect(trailingReturn(dates, prices, 20)).toBeNull();
		expect(cagr(dates, prices)!).toBeCloseTo(4 ** (1 / 10) - 1, 3);
	});

	it('finds the largest drawdown and its recovery', () => {
		const dates = ['a', 'b', 'c', 'd', 'e', 'f'];
		expect(maxDrawdown(dates, [100, 120, 60, 90, 130, 125])).toEqual({
			depth: -0.5,
			peakDate: 'b',
			troughDate: 'c',
			recoveryDate: 'e',
		});
		expect(maxDrawdown(dates, [100, 80, 50, 60, 70, 75])?.recoveryDate).toBeNull();
		expect(maxDrawdown(dates, [1, 2, 3, 4, 5, 6])).toBeNull();
	});

	it('annualizes daily volatility', () => {
		// Alternating +1% / -1% daily log returns → stdev ≈ 0.01, annualized ≈ 0.01 * sqrt(252)
		const prices = [100];
		for (let i = 0; i < 252; i++) prices.push(prices[i]! * Math.exp(i % 2 ? -0.01 : 0.01));
		expect(volatility(prices)!).toBeCloseTo(0.01 * Math.sqrt(252), 2);
	});
});

describe('monthly data', () => {
	it('builds month-over-month returns from month-end prices, skipping the current month', () => {
		const dates = ['2024-01-15', '2024-01-31', '2024-02-29', '2024-03-28', '2024-04-10'];
		const prices = [90, 100, 110, 99, 120];
		expect(monthlyReturns(dates, prices, '2024-04')).toEqual([
			{ month: '2024-02', ret: expect.closeTo(0.1) },
			{ month: '2024-03', ret: expect.closeTo(-0.1) },
		]);
	});

	it('computes year-over-year inflation and monthly changes', () => {
		const cpi = series('2020-01', [...Array(12).fill(100), 103, 104.5]);
		const infl = inflationYoY(cpi);
		expect(infl.months).toEqual(['2021-01', '2021-02']);
		expect(infl.values[0]).toBeCloseTo(3);
		expect(infl.values[1]).toBeCloseTo(4.5);
		expect([...monthlyChange(infl)]).toEqual([['2021-02', expect.closeTo(1.5)]]);
	});
});

describe('rate regimes', () => {
	// 12 flat months at 1%, 12 months rising 0.25/month, 12 flat, 12 falling.
	const fed = series('2000-01', [
		...Array(12).fill(1),
		...Array.from({ length: 12 }, (_, i) => 1.25 + i * 0.25),
		...Array(12).fill(4),
		...Array.from({ length: 12 }, (_, i) => 3.75 - i * 0.25),
	]);

	it('labels hiking, holding and cutting periods from 6-month rate changes', () => {
		const periods = rateRegimes(fed);
		expect(periods.map((p) => [p.regime, p.start, p.end])).toEqual([
			// The first rise (Jan 2001) already makes the 6-month change +0.25, so hiking starts then.
			['holding', '2000-07', '2000-12'],
			['hiking', '2001-01', '2002-05'],
			['holding', '2002-06', '2002-12'],
			['cutting', '2003-01', '2003-12'],
		]);
		expect(periods[1]).toMatchObject({ rateStart: 1.25, rateEnd: 4 });
	});

	it('folds blips shorter than 3 months into the previous period', () => {
		const blip = series('2000-01', [...Array(12).fill(2), 2.3, 2.3, 2, 2, ...Array(8).fill(2)]);
		expect(rateRegimes(blip).map((p) => p.regime)).toEqual(['holding']);
	});

	it('summarizes stock returns in each regime', () => {
		const periods = rateRegimes(fed);
		const returns = months('2000-07', 42).map((month) => ({
			month,
			ret: periods.find((p) => month >= p.start && month <= p.end)?.regime === 'hiking' ? -0.01 : 0.02,
		}));
		const { byRegime, periods: perf } = regimePerformance(periods, returns);
		const hiking = byRegime.find((r) => r.regime === 'hiking')!;
		expect(hiking.months).toBe(17);
		expect(hiking.annualized).toBeCloseTo(0.99 ** 12 - 1);
		expect(hiking.positiveShare).toBe(0);
		expect(byRegime.find((r) => r.regime === 'holding')!.positiveShare).toBe(1);
		expect(perf[1]!.stockReturn).toBeCloseTo(0.99 ** 17 - 1);
	});
});

describe('regression', () => {
	it('recovers known coefficients', () => {
		const x1 = Array.from({ length: 60 }, (_, i) => Math.sin(i));
		const x2 = Array.from({ length: 60 }, (_, i) => Math.cos(i * 1.7));
		const noise = Array.from({ length: 60 }, (_, i) => 0.001 * Math.sin(i * 7.3));
		const y = x1.map((v, i) => 0.5 + 2 * v - 3 * x2[i]! + noise[i]!);
		const fit = ols(y, [x1, x2])!;
		expect(fit.coefficients[0]).toBeCloseTo(0.5, 2);
		expect(fit.coefficients[1]).toBeCloseTo(2, 2);
		expect(fit.coefficients[2]).toBeCloseTo(-3, 2);
		expect(fit.rSquared).toBeGreaterThan(0.999);
		expect(Math.abs(fit.tStats[1]!)).toBeGreaterThan(100);
	});

	it('matches the textbook simple-regression standard error', () => {
		const x = [1, 2, 3, 4, 5, 6, 7, 8];
		const y = [2.1, 3.9, 6.2, 7.8, 10.1, 12.2, 13.8, 16.1];
		const fit = ols(y, [x])!;
		const n = x.length;
		const mx = x.reduce((a, b) => a + b) / n;
		const sxx = x.reduce((a, v) => a + (v - mx) ** 2, 0);
		const resid = y.map((v, i) => v - fit.coefficients[0]! - fit.coefficients[1]! * x[i]!);
		const se = Math.sqrt(resid.reduce((a, r) => a + r * r, 0) / (n - 2) / sxx);
		expect(fit.standardErrors[1]).toBeCloseTo(se, 10);
	});

	it('returns null for degenerate inputs', () => {
		expect(ols([1, 2, 3], [[1, 2, 3]])).toBeNull(); // too few points
		expect(ols(Array(10).fill(1), [Array(10).fill(5)])).toBeNull(); // predictor identical to intercept
		expect(correlation([1, 1, 1], [1, 2, 3])).toBeNull();
	});

	it('estimates sensitivity of returns to macro changes', () => {
		const n = 80;
		const fedVals = [2];
		const unVals = [5];
		for (let i = 1; i < n + 14; i++) {
			fedVals.push(fedVals[i - 1]! + 0.3 * Math.sin(i * 1.3));
			unVals.push(unVals[i - 1]! + 0.2 * Math.cos(i * 0.7));
		}
		const cpiVals = Array.from({ length: n + 14 }, (_, i) => 100 * 1.002 ** i * (1 + 0.004 * Math.sin(i * 0.9)));
		const macro: MacroData = {
			fedFunds: series('2000-01', fedVals),
			unemployment: series('2000-01', unVals),
			cpi: series('2000-01', cpiVals),
			fetchedAt: '',
		};
		const dFed = monthlyChange(macro.fedFunds);
		// The stock loses 5% for each +1 point move in the Fed funds rate, plus small noise.
		const returns = months('2001-02', n).map((month, i) => ({ month, ret: 0.01 - 0.05 * dFed.get(month)! + 0.002 * Math.sin(i * 5.1) }));
		const result = macroSensitivity(returns, macro)!;
		const fed = result.factors.find((f) => f.key === 'fedFunds')!;
		expect(fed.beta).toBeCloseTo(-0.05, 2);
		expect(fed.significant).toBe(true);
		expect(result.factors.find((f) => f.key === 'unemployment')!.significant).toBe(false);
		expect(result.rollingFedCorrelation.length).toBe(result.months - 36 + 1);
		expect(result.rollingFedCorrelation.every((c) => c.value < -0.9)).toBe(true);
	});
});

describe('summarize', () => {
	it('combines the headline numbers', () => {
		const dates: string[] = [];
		const adj: number[] = [];
		let d = Date.UTC(2014, 0, 2);
		for (let i = 0; i < 2600; i++, d += 86400000 * 1.4) {
			dates.push(new Date(d).toISOString().slice(0, 10));
			adj.push(100 * 1.0004 ** i);
		}
		const stock: StockData = { ticker: 'X', name: 'X', exchange: '', dates, adjClose: adj, close: adj, fetchedAt: '' };
		const s = summarize(stock);
		expect(s.lastClose).toBe(adj[adj.length - 1]);
		expect(s.trend).toEqual({ above200: true, lastCross: null });
		expect(s.drawdown).toBeNull();
		expect(s.returns.map((r) => r.value !== null)).toEqual([true, true, false]);
	});
});
