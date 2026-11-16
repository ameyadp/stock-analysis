import { useMemo, useState } from 'react';
import type { AlignedData, Options } from 'uplot';
import { type Cross, crosses, sma } from '../lib/analysis';
import type { MacroData, StockData } from '../lib/types';
import { dateLabel, num, price, toUnix } from '../format';
import { UPlotChart, cssVar } from './UPlotChart';

const RANGES = [
	{ label: '1Y', years: 1 },
	{ label: '5Y', years: 5 },
	{ label: '10Y', years: 10 },
	{ label: 'Max', years: 100 },
] as const;

export function PriceChart({ stock, macro }: { stock: StockData; macro: MacroData | null }) {
	const [range, setRange] = useState<number>(10);
	const [logScale, setLogScale] = useState(true);
	const [showFed, setShowFed] = useState(true);

	const full = useMemo(() => {
		const s50 = sma(stock.adjClose, 50);
		const s200 = sma(stock.adjClose, 200);
		return { s50, s200, crosses: crosses(stock.dates, s50, s200) };
	}, [stock]);

	const { data, options, visibleCrosses } = useMemo(() => {
		const last = stock.dates[stock.dates.length - 1]!;
		const from = `${Number(last.slice(0, 4)) - range}${last.slice(4)}`;
		const start = Math.max(0, stock.dates.findIndex((d) => d >= from));
		const dates = stock.dates.slice(start);
		const crossByDate = new Map<string, Cross>(full.crosses.map((c) => [c.date, c]));
		const fedByMonth = new Map(macro?.fedFunds.months.map((m, i) => [m, macro.fedFunds.values[i]!]) ?? []);
		const adj = stock.adjClose.slice(start);
		const s50 = full.s50.slice(start);
		const s200 = full.s200.slice(start);

		const data: AlignedData = [
			dates.map(toUnix),
			adj,
			s50,
			s200,
			dates.map((d, i) => (crossByDate.get(d)?.kind === 'golden' ? adj[i]! : null)),
			dates.map((d, i) => (crossByDate.get(d)?.kind === 'death' ? adj[i]! : null)),
			dates.map((d) => (showFed ? (fedByMonth.get(d.slice(0, 7)) ?? null) : null)),
		];

		const text = cssVar('--muted');
		const grid = cssVar('--grid');
		const axis = { stroke: text, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid, width: 1 } };

		const options: Omit<Options, 'width' | 'height'> = {
			scales: { x: { time: true }, y: { distr: logScale ? 3 : 1 }, rate: { range: (_u, _min, max) => [0, Math.max(6, Math.ceil(max ?? 6))] } },
			axes: [
				axis,
				{ ...axis, values: (_u, vals) => vals.map((v) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`)), size: 60 },
				{ ...axis, scale: 'rate', side: 1, grid: { show: false }, values: (_u, vals) => vals.map((v) => `${v}%`), show: showFed },
			],
			series: [
				{ value: (_u, v) => (v == null ? '—' : dateLabel(new Date(v * 1000).toISOString().slice(0, 10))) },
				{ label: 'Price (adjusted)', stroke: cssVar('--price'), width: 1.5, value: (_u, v) => (v == null ? '—' : price(v)) },
				{ label: '50-day avg', stroke: cssVar('--sma50'), width: 1, dash: [4, 3], value: (_u, v) => (v == null ? '—' : price(v)) },
				{ label: '200-day avg', stroke: cssVar('--sma200'), width: 1.5, value: (_u, v) => (v == null ? '—' : price(v)) },
				{ label: 'Golden cross', stroke: cssVar('--positive'), fill: cssVar('--positive'), paths: () => null, points: { show: true, size: 9 }, value: (_u, v) => (v == null ? '' : '▲') },
				{ label: 'Death cross', stroke: cssVar('--negative'), fill: cssVar('--negative'), paths: () => null, points: { show: true, size: 9 }, value: (_u, v) => (v == null ? '' : '▼') },
				{ label: 'Fed funds rate', scale: 'rate', stroke: cssVar('--rate'), width: 1.5, show: showFed, value: (_u, v) => (v == null ? '—' : `${num(v)}%`) },
			],
			legend: { live: true },
			cursor: { points: { size: 6 } },
		};

		return { data, options, visibleCrosses: full.crosses.filter((c) => c.date >= dates[0]!) };
	}, [stock, macro, full, range, logScale, showFed]);

	return (
		<section className="card">
			<div className="card-head">
				<h2>Price &amp; trend</h2>
				<div className="controls">
					<div className="segmented" role="group" aria-label="Time range">
						{RANGES.map((r) => (
							<button key={r.label} type="button" aria-pressed={range === r.years} onClick={() => setRange(r.years)}>
								{r.label}
							</button>
						))}
					</div>
					<label className="toggle">
						<input type="checkbox" checked={logScale} onChange={(e) => setLogScale(e.target.checked)} /> Log scale
					</label>
					{macro && (
						<label className="toggle">
							<input type="checkbox" checked={showFed} onChange={(e) => setShowFed(e.target.checked)} /> Fed rate
						</label>
					)}
				</div>
			</div>
			<UPlotChart options={options} data={data} height={360} label={`Price history for ${stock.ticker}`} />
			<p className="note">
				Prices are adjusted for splits and dividends, so the line shows total return. A <strong>golden cross</strong> (▲) is when
				the 50-day average rises above the 200-day average, a common sign of an uptrend; a <strong>death cross</strong> (▼) is the
				reverse. {visibleCrosses.length} crossover{visibleCrosses.length === 1 ? '' : 's'} in this range.
			</p>
		</section>
	);
}
