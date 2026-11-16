import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { ApiRequestError, fetchMacro, fetchStock } from './api';
import { monthlyReturns, summarize } from './lib/analysis';
import { type ApiKeys, loadKeys } from './lib/keys';
import { type Consent, getConsent, pingActive, setConsent } from './lib/telemetry';
import type { MacroData, StockData } from './lib/types';
import { MacroPanel } from './components/MacroPanel';
import { PriceChart } from './components/PriceChart';
import { RateCycles } from './components/RateCycles';
import { Setup } from './components/Setup';
import { Summary } from './components/Summary';

const EXAMPLES = ['SPY', 'AAPL', 'NVDA', 'JPM', 'INTC', 'XOM'];

type Load<T> =
	| { status: 'idle' }
	| { status: 'loading' }
	| { status: 'ready'; data: T }
	| { status: 'error'; message: string; keyProblem: boolean };

const tickerFromUrl = () => new URLSearchParams(window.location.search).get('t')?.toUpperCase() ?? '';

const failed = (err: unknown) => ({
	status: 'error' as const,
	message: err instanceof Error ? err.message : 'Something went wrong.',
	keyProblem: err instanceof ApiRequestError && err.status === 401,
});

function ConsentBanner({ onAnswer }: { onAnswer: (c: Consent) => void }) {
	return (
		<aside className="banner" role="region" aria-label="Usage sharing">
			<p>
				<strong>Help decide if this tool is worth building further?</strong> Share an anonymous daily “used the app” count. Never
				your keys or what you look up. You can change this under Data keys.
			</p>
			<div className="actions">
				<button type="button" className="primary" onClick={() => onAnswer('granted')}>
					Share anonymous counts
				</button>
				<button type="button" className="secondary" onClick={() => onAnswer('denied')}>
					No thanks
				</button>
			</div>
		</aside>
	);
}

export default function App() {
	const [keys, setKeys] = useState<ApiKeys | null>(loadKeys);
	const [setupOpen, setSetupOpen] = useState(() => !loadKeys());
	const [consent, setConsentState] = useState<Consent | null>(getConsent);
	const [input, setInput] = useState(tickerFromUrl);
	const [ticker, setTicker] = useState(tickerFromUrl);
	const [stock, setStock] = useState<Load<StockData>>({ status: 'idle' });
	const [macro, setMacro] = useState<Load<MacroData>>({ status: 'idle' });

	useEffect(() => {
		void pingActive();
	}, []);

	useEffect(() => {
		if (!keys) return setMacro({ status: 'idle' });
		let cancelled = false;
		setMacro({ status: 'loading' });
		fetchMacro(keys).then(
			(data) => !cancelled && setMacro({ status: 'ready', data }),
			(err: unknown) => !cancelled && setMacro(failed(err)),
		);
		return () => {
			cancelled = true;
		};
	}, [keys]);

	useEffect(() => {
		if (!ticker || !keys) return setStock({ status: 'idle' });
		let cancelled = false;
		setStock({ status: 'loading' });
		document.title = `${ticker} · Stock Analysis`;
		fetchStock(ticker, keys).then(
			(data) => !cancelled && setStock({ status: 'ready', data }),
			(err: unknown) => !cancelled && setStock(failed(err)),
		);
		return () => {
			cancelled = true;
		};
	}, [ticker, keys]);

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
		if (!keys) setSetupOpen(true);
		if (t === ticker) return;
		const url = new URL(window.location.href);
		url.searchParams.set('t', t);
		window.history.pushState(null, '', url);
		setTicker(t);
	}

	function answerConsent(c: Consent) {
		setConsentState(c);
		void setConsent(c);
	}

	const derived = useMemo(() => {
		if (stock.status !== 'ready') return null;
		return { summary: summarize(stock.data), returns: monthlyReturns(stock.data.dates, stock.data.adjClose) };
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
				<nav className="top-links">
					<button type="button" className="link-button" onClick={() => setSetupOpen(!setupOpen)} aria-expanded={setupOpen}>
						{keys ? '🔑 Data keys' : '🔑 Connect keys'}
					</button>
					<a className="muted small" href="/projects/stock-analysis/">
						About
					</a>
				</nav>
			</header>

			{consent === null && <ConsentBanner onAnswer={answerConsent} />}

			{setupOpen && (
				<Setup
					keys={keys}
					onSaved={(k) => {
						setKeys(k);
						setSetupOpen(false);
						setConsentState(getConsent());
					}}
					onClose={() => setSetupOpen(false)}
					onCleared={() => {
						setKeys(null);
						setStock({ status: 'idle' });
					}}
				/>
			)}

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
				{stock.status === 'idle' && !setupOpen && (
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
					<div className="status error" role="alert">
						<p>{stock.message}</p>
						{stock.keyProblem && (
							<button type="button" className="secondary" onClick={() => setSetupOpen(true)}>
								Update data keys
							</button>
						)}
					</div>
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
							<div className="status">
								<p>{macro.status === 'error' ? `Economic data unavailable: ${macro.message}` : 'Loading economic data…'}</p>
								{macro.status === 'error' && macro.keyProblem && (
									<button type="button" className="secondary" onClick={() => setSetupOpen(true)}>
										Update data keys
									</button>
								)}
							</div>
						)}
					</>
				)}
			</main>

			<footer className="foot">
				<p>
					Prices from <a href="https://www.tiingo.com">Tiingo</a>, adjusted for splits and dividends. Economic data from{' '}
					<a href="https://fred.stlouisfed.org">FRED</a>, Federal Reserve Bank of St. Louis, using your own API keys. This product
					uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.
				</p>
				<p>For education only, not investment advice. Past performance doesn’t predict future results.</p>
			</footer>
		</div>
	);
}
