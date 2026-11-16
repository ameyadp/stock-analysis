import type { Summary as SummaryData } from '../lib/analysis';
import type { StockData } from '../lib/types';
import { dateLabel, pct, price } from '../format';

function Stat({ label, value, tone, detail }: { label: string; value: string; tone?: 'up' | 'down'; detail?: string }) {
	return (
		<div className="stat">
			<span className="stat-label">{label}</span>
			<strong className={tone}>{value}</strong>
			{detail && <span className="stat-detail">{detail}</span>}
		</div>
	);
}

const tone = (v: number | null) => (v == null ? undefined : v >= 0 ? 'up' : 'down');

export function Summary({ stock, summary }: { stock: StockData; summary: SummaryData }) {
	const { drawdown, trend } = summary;
	const sinceYear = summary.firstDate.slice(0, 4);

	return (
		<section className="summary">
			<div className="title-row">
				<div>
					<h1>
						{stock.name} <span className="ticker">{stock.ticker}</span>
					</h1>
					<p className="muted">
						{stock.exchange && `${stock.exchange} · `}Last close {dateLabel(summary.lastDate)}
					</p>
				</div>
				<div className="price">
					<strong>{price(summary.lastClose)}</strong>
					<span className={tone(summary.dayChange)}>{pct(summary.dayChange)} day</span>
				</div>
			</div>

			<div className="stats">
				{summary.returns.map((r) => (
					<Stat key={r.label} label={`Return, ${r.label}`} value={pct(r.value)} tone={tone(r.value)} />
				))}
				<Stat label={`Per year since ${sinceYear}`} value={pct(summary.cagr)} tone={tone(summary.cagr)} />
				<Stat
					label="Worst fall"
					value={pct(drawdown?.depth)}
					tone="down"
					detail={
						drawdown
							? `${dateLabel(drawdown.peakDate)} → ${dateLabel(drawdown.troughDate)}${drawdown.recoveryDate ? `, recovered ${dateLabel(drawdown.recoveryDate)}` : ', not yet recovered'}`
							: undefined
					}
				/>
				<Stat label="Volatility (1 yr)" value={pct(summary.volatility).replace('+', '')} detail="annualized" />
				{summary.range52w && <Stat label="52-week range" value={`${price(summary.range52w.low)} – ${price(summary.range52w.high)}`} />}
				{trend && (
					<Stat
						label="Trend"
						value={trend.above200 ? 'Uptrend' : 'Downtrend'}
						tone={trend.above200 ? 'up' : 'down'}
						detail={
							trend.lastCross
								? `${trend.lastCross.kind === 'golden' ? 'Golden' : 'Death'} cross on ${dateLabel(trend.lastCross.date)}`
								: '50-day vs 200-day average'
						}
					/>
				)}
			</div>
		</section>
	);
}
