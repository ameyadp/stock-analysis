import { useMemo, useState } from 'react';
import { type MonthlyReturn, type Regime, rateRegimes, regimePerformance } from '../lib/analysis';
import type { MacroData } from '../lib/types';
import { monthLabel, num, pct, pctWhole } from '../format';

const LABEL: Record<Regime, string> = { hiking: 'Fed hiking', holding: 'Fed on hold', cutting: 'Fed cutting' };
const ORDER: Regime[] = ['hiking', 'holding', 'cutting'];

export function RateCycles({ ticker, returns, macro }: { ticker: string; returns: MonthlyReturn[]; macro: MacroData }) {
	const [showAll, setShowAll] = useState(false);

	const result = useMemo(() => {
		if (returns.length === 0) return null;
		const periods = rateRegimes(macro.fedFunds).filter((p) => p.end >= returns[0]!.month);
		return regimePerformance(periods, returns);
	}, [macro, returns]);

	if (!result) return null;
	const stats = ORDER.map((r) => result.byRegime.find((b) => b.regime === r)!).filter((s) => s.months > 0);
	const maxAbs = Math.max(0.01, ...stats.map((s) => Math.abs(s.annualized)));
	const hiking = stats.find((s) => s.regime === 'hiking');
	const cutting = stats.find((s) => s.regime === 'cutting');
	const periods = result.periods.filter((p) => p.stockReturn !== null).reverse();
	const visiblePeriods = showAll ? periods : periods.slice(0, 6);

	return (
		<section className="card">
			<h2>Through Fed rate cycles</h2>
			{hiking && cutting && (
				<p className="lead">
					Since {monthLabel(returns[0]!.month, 'long')}, {ticker} returned <strong>{pct(hiking.annualized)} a year</strong> while the
					Fed was raising rates and <strong>{pct(cutting.annualized)} a year</strong> while it was cutting.
				</p>
			)}

			<div className="regimes">
				{stats.map((s) => (
					<div key={s.regime} className={`regime ${s.regime}`}>
						<div className="regime-head">
							<span className={`badge ${s.regime}`}>{LABEL[s.regime]}</span>
							<span className="muted small">{s.months} months</span>
						</div>
						<div className="bar-track" aria-hidden="true">
							<div
								className={`bar ${s.annualized >= 0 ? 'up' : 'down'}`}
								style={{ width: `${(Math.abs(s.annualized) / maxAbs) * 50}%`, [s.annualized >= 0 ? 'left' : 'right']: '50%' }}
							/>
						</div>
						<div className="regime-numbers">
							<strong className={s.annualized >= 0 ? 'up' : 'down'}>{pct(s.annualized)}</strong>
							<span className="muted small">per year · {pctWhole(s.positiveShare)} of months up</span>
						</div>
					</div>
				))}
			</div>

			<h3>Cycle by cycle</h3>
			<div className="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Period</th>
							<th>Fed</th>
							<th>Fed funds rate</th>
							<th className="num">{ticker} return</th>
						</tr>
					</thead>
					<tbody>
						{visiblePeriods.map((p) => (
							<tr key={p.start}>
								<td>
									{monthLabel(p.start)} – {monthLabel(p.end)}
								</td>
								<td>
									<span className={`badge ${p.regime}`}>{LABEL[p.regime].replace('Fed ', '')}</span>
								</td>
								<td>
									{num(p.rateStart)}% → {num(p.rateEnd)}%
								</td>
								<td className={`num ${p.stockReturn! >= 0 ? 'up' : 'down'}`}>{pct(p.stockReturn)}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{periods.length > 6 && (
				<button type="button" className="link-button" onClick={() => setShowAll(!showAll)}>
					{showAll ? 'Show fewer' : `Show all ${periods.length} periods`}
				</button>
			)}
			<p className="note">
				Each month is classed by how much the Fed funds rate moved over the previous six months: up at least 0.25 points is
				hiking, down at least 0.25 is cutting, anything else is on hold. Returns over different cycles also reflect everything
				else going on at the time, so treat this as context, not cause and effect.
			</p>
		</section>
	);
}
