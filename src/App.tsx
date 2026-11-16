import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { fetchMacro, fetchStock } from './api';
import { monthlyReturns, summarize } from './lib/analysis';
import type { MacroData, StockData } from './lib/types';
import { MacroPanel } from './components/MacroPanel';
import { PriceChart } from './components/PriceChart';
import { RateCycles } from './components/RateCycles';
import { Summary } from './components/Summary';

const EXAMPLES = ['SPY', 'AAPL', 'NVDA', 'JPM', 'INTC', 'XOM'];

type Load<T> = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; message: string };

const tickerFromUrl = () => new URLSearchParams(window.location.search).get('t')?.toUpperCase() ?? '';

export default function App() {
	const [input, setInput] = useState(tickerFromUrl);
	const [ticker, setTicker] = useState(tickerFromUrl);
	const [stock, setStock] = useState<Load<StockData>>({ status: 'idle' });
	const [macro, setMacro] = useState<Load<MacroData>>({ status: 'loading' });

	useEffect(() => {
		fetchMacro().then(
			(data) => setMacro({ status: 'ready', data }),
			(err: Error) => setMacro({ status: 'error', message: err.message }),
		);
	}, []);

	useEffect(() => {
		if (!ticker) return setStock({ status: 'idle' });
		let cancelled = false;
		setStock({ status: 'loading' });
		document.title = `${ticker} · Stock Analysis`;
		fetchStock(ticker).then(
			(data) => !cancelled && setStock({ status: 'ready', data }),
			(err: Error) => !cancelled && setStock({ status: 'error', message: err.message }),
		);
		return () => {
			cancelled = true;
		};
	}, [ticker]);

	useEffect(() => {
		const onPop = () => {
			setTicker(tickerFromUrl());
			setInput(tickerFromUrl());
		};
		window.addEventListener('popstate', onPop);
		return () => window.removeEventListener('popstate', onPop);
	}, []);

	function analyze(next: string) {
		const t = next.trim().toUpperCase();
		if (!t) return;
		setInput(t);
		if (t === ticker) return;
		const url = new URL(window.location.href);
		url.searchParams.set('t', t);
		window.history.pushState(null, '', url);
		setTicker(t);
	}

	const derived = useMemo(() => {
		if (stock.status !== 'ready') return null;
		return {
			summary: summarize(stock.data),
			returns: monthlyReturns(stock.data.dates, stock.data.adjClose),
		};
	}, [stock]);

	const macroData = macro.status === 'ready' ? macro.data : null;

	return (
		<div className="app">
			<header className="topbar">
				<a className="brand" href={import.meta.env.BASE_URL}>
					<span className="logo" aria-hidden="true">
						▲
					</span>
					Stock Analysis
				</a>
				<a className="muted small" href="/projects/stock-analysis/">
					About this project
				</a>
			</header>

			<form
				className="search"
				role="search"
				onSubmit={(e: FormEvent) => {
					e.preventDefault();
					analyze(input);
				}}
			>
				<input
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder="Ticker, e.g. AAPL"
					aria-label="Stock ticker"
					autoCapitalize="characters"
					autoCorrect="off"
					spellCheck={false}
					maxLength={12}
				/>
				<button type="submit">Analyze</button>
			</form>
			<div className="examples">
				<span className="muted small">Try:</span>
				{EXAMPLES.map((t) => (
					<button key={t} type="button" className="chip" onClick={() => analyze(t)}>
						{t}
					</button>
				))}
			</div>

			<main>
				{stock.status === 'idle' && (
					<section className="card intro">
						<h2>How does a stock behave when the Fed moves?</h2>
						<p>
							Enter a US stock or ETF ticker to see up to 30 years of price history and trend signals, how it performed while
							the Fed was raising versus cutting rates, and how sensitive its monthly returns have been to changes in interest
							rates, inflation and unemployment.
						</p>
					</section>
				)}
				{stock.status === 'loading' && (
					<p className="status" role="status">
						Loading {ticker}…
					</p>
				)}
				{stock.status === 'error' && (
					<p className="status error" role="alert">
						{stock.message}
					</p>
				)}
				{stock.status === 'ready' && derived && (
					<>
						<Summary stock={stock.data} summary={derived.summary} />
						<PriceChart stock={stock.data} macro={macroData} />
						{macroData ? (
							<>
								<RateCycles ticker={stock.data.ticker} returns={derived.returns} macro={macroData} />
								<MacroPanel ticker={stock.data.ticker} returns={derived.returns} macro={macroData} />
							</>
						) : (
							<p className="status">
								{macro.status === 'loading' ? 'Loading economic data…' : `Economic data unavailable: ${macro.status === 'error' ? macro.message : ''}`}
							</p>
						)}
					</>
				)}
			</main>

			<footer className="foot">
				<p>
					Prices from <a href="https://www.tiingo.com">Tiingo</a>, adjusted for splits and dividends. Economic data from{' '}
					<a href="https://fred.stlouisfed.org">FRED</a>, Federal Reserve Bank of St. Louis. This product uses the FRED® API but is
					not endorsed or certified by the Federal Reserve Bank of St. Louis.
				</p>
				<p>For education only, not investment advice. Past performance doesn’t predict future results.</p>
			</footer>
		</div>
	);
}
