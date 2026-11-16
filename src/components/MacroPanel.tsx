import { useMemo } from 'react';
import type { AlignedData, Options } from 'uplot';
import { type MacroFactor, type MonthlyReturn, macroSensitivity } from '../lib/analysis';
import type { MacroData } from '../lib/types';
import { monthLabel, num, pctWhole, toUnix } from '../format';
import { UPlotChart, cssVar } from './UPlotChart';

/** Size of the move each sensitivity is described for, in percentage points. */
const STEP = 0.25;

function describe(f: MacroFactor, ticker: string): string {
	const effect = f.beta * STEP * 100; // percentage points of monthly return
	const direction = effect >= 0 ? 'higher' : 'lower';
	return `When ${f.label.toLowerCase()} rose ¼ point in a month, ${ticker} did ${num(Math.abs(effect))} points ${direction} that month on average.`;
}

export function MacroPanel({ ticker, returns, macro }: { ticker: string; returns: MonthlyReturn[]; macro: MacroData }) {
	const result = useMemo(() => macroSensitivity(returns, macro), [returns, macro]);

	const chart = useMemo(() => {
		if (!result) return null;
		const data: AlignedData = [result.rollingFedCorrelation.map((p) => toUnix(p.month)), result.rollingFedCorrelation.map((p) => p.value)];
		const text = cssVar('--muted');
		const grid = cssVar('--grid');
		const axis = { stroke: text, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid, width: 1 } };
		const options: Omit<Options, 'width' | 'height'> = {
			scales: { x: { time: true }, y: { range: [-1, 1] } },
			axes: [axis, { ...axis, size: 44 }],
			series: [
				{ value: (_u, v) => (v == null ? '—' : monthLabel(new Date(v * 1000).toISOString().slice(0, 7))) },
				{ label: '3-year correlation', stroke: cssVar('--rate'), width: 1.5, fill: cssVar('--rate-fill'), value: (_u, v) => (v == null ? '—' : num(v)) },
			],
		};
		return { data, options };
	}, [result]);

	if (!result) {
		return (
			<section className="card">
				<h2>Sensitivity to the economy</h2>
				<p className="muted">Not enough monthly history to estimate this reliably (needs at least 3 years).</p>
			</section>
		);
	}

	return (
		<section className="card">
			<h2>Sensitivity to the economy</h2>
			<p className="lead">
				How {ticker}’s monthly return moved with same-month changes in interest rates, inflation and unemployment, from{' '}
				{monthLabel(result.start)} to {monthLabel(result.end)} ({result.months} months).
			</p>

			<div className="factors">
				{result.factors.map((f) => (
					<div key={f.key} className="factor">
						<div className="factor-head">
							<strong>{f.label}</strong>
							<span className={`badge ${f.significant ? 'strong' : 'weak'}`}>{f.significant ? 'Clear link' : 'Could be noise'}</span>
						</div>
						<p>{describe(f, ticker)}</p>
						<p className="muted small">
							Correlation {f.correlation === null ? '—' : num(f.correlation)} · t-statistic {num(f.tStat, 1)}
						</p>
					</div>
				))}
			</div>

			<p className="callout">
				Together, these three explain <strong>{pctWhole(result.rSquared)}</strong> of {ticker}’s month-to-month moves. The rest comes
				from the company itself and the wider market.
			</p>

			{chart && (
				<>
					<h3>Is the link with rates stable?</h3>
					<UPlotChart options={chart.options} data={chart.data} height={200} label="Rolling 3-year correlation with Fed funds rate changes" />
					<p className="note">
						Rolling 3-year correlation between {ticker}’s monthly returns and monthly changes in the Fed funds rate. Below zero
						means the stock tended to fall when rates rose. A line that swings across zero means the relationship isn’t stable.
					</p>
				</>
			)}

			<p className="note">
				Method: a regression of monthly returns on monthly changes (not levels) of the Fed funds rate, year-over-year CPI
				inflation and the unemployment rate. Using changes avoids the misleading correlations you get between any two series
				that both drift over decades. “Clear link” means |t| ≥ 2. This describes the past; it doesn’t predict the future.
			</p>
		</section>
	);
}
