import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { ApiRequestError, fetchMacro, fetchStock } from './api';
import { monthlyReturns, summarize } from './lib/analysis';
import { continueInBrowser, installNoticeSeen, isStandalone, shouldShowIntro, takeInstallRequest, installLabel } from './lib/install';
import { SiteNav } from './components/SiteNav';
import { useInstalled } from './lib/useInstalled';
import { type ApiKeys, loadKeys } from './lib/keys';
import { pingActive, pingTrialEnded } from './lib/telemetry';
import type { MacroData, StockData } from './lib/types';
import { MacroPanel } from './components/MacroPanel';
import { PriceChart } from './components/PriceChart';
import { RateCycles } from './components/RateCycles';
import { AppIntro } from './components/AppIntro';
import { type GateReason, RegistrationGate, TrialBanner } from './components/RegistrationForm';
import { isRegistered } from './lib/registration';
import { TRIAL_SESSIONS, enterBrowserApp } from './lib/trial';
import { InstallDialog, InstalledNotice } from './components/InstallDialog';
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


export default function App() {
	const installed = useInstalled();
	const [keys, setKeys] = useState<ApiKeys | null>(loadKeys);
	const [setupOpen, setSetupOpen] = useState(() => !loadKeys());
	const [input, setInput] = useState(tickerFromUrl);
	const [ticker, setTicker] = useState(tickerFromUrl);
	const [stock, setStock] = useState<Load<StockData>>({ status: 'idle' });
	const [macro, setMacro] = useState<Load<MacroData>>({ status: 'idle' });
	const [installOpen, setInstallOpen] = useState(takeInstallRequest);
	const [introOpen, setIntroOpen] = useState(shouldShowIntro);
	// Sign-up gate and browser trial:
	//  - installed app: sign-up required once per device before use
	//  - browser tab: TRIAL_SESSIONS free sessions, then sign-up required
	const [access] = useState(() =>
		isStandalone()
			? { gate: (isRegistered() ? null : 'installed') as GateReason | null, session: null as number | null }
			: shouldShowIntro()
				? { gate: null, session: null }
				: enterBrowserApp(),
	);
	const [gate, setGate] = useState<GateReason | null>(access.gate);
	const [trialSession, setTrialSession] = useState<number | null>(access.session);
	// Anonymous count (once per device) of browsers that used up their free trial.
	useEffect(() => {
		if (gate === 'trial-ended') void pingTrialEnded();
	}, [gate]);
	const finishSignUp = () => {
		setGate(null);
		setTrialSession(null);
	};
	const [showInstalledNotice, setShowInstalledNotice] = useState(() => isStandalone() && !installNoticeSeen());

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

	const derived = useMemo(() => {
		if (stock.status !== 'ready') return null;
		return { summary: summarize(stock.data), returns: monthlyReturns(stock.data.dates, stock.data.adjClose) };
	}, [stock]);

	const macroData = macro.status === 'ready' ? macro.data : null;

	if (gate) {
		return (
			<>
				<RegistrationGate
					reason={gate}
					onDone={finishSignUp}
					onInstall={gate === 'installed' || installed ? undefined : () => setInstallOpen(true)}
					onCancel={gate === 'voluntary' ? () => setGate(null) : undefined}
				/>
				{installOpen && <InstallDialog onClose={() => setInstallOpen(false)} />}
			</>
		);
	}

	if (introOpen) {
		return (
			<>
				<AppIntro
					onInstall={() => setInstallOpen(true)}
					onContinue={() => {
						continueInBrowser();
						setIntroOpen(false);
						const entry = enterBrowserApp();
						setGate(entry.gate);
						setTrialSession(entry.session);
					}}
				/>
				{installOpen && <InstallDialog onClose={() => setInstallOpen(false)} />}
			</>
		);
	}

	return (
		<div className="app">
			<SiteNav />
			<header className="topbar">
				<a className="brand" href={import.meta.env.BASE_URL}>
					<span className="logo" aria-hidden="true">
						▲
					</span>
					Stock Analysis
				</a>
				<nav className="top-links">
					{!installed && (
						<button type="button" className="secondary small" onClick={() => setInstallOpen(true)}>
							{installLabel()}
						</button>
					)}
					<button type="button" className="link-button" onClick={() => setSetupOpen(!setupOpen)} aria-expanded={setupOpen}>
						{keys ? '🔑 Data keys' : '🔑 Connect keys'}
					</button>
					<a className="muted small" href="/projects/stock-analysis/" target="_blank" rel="noopener">
						About
					</a>
				</nav>
			</header>

			{trialSession !== null && trialSession <= TRIAL_SESSIONS && (
				<TrialBanner session={trialSession} total={TRIAL_SESSIONS} onSignUp={() => setGate('voluntary')} onInstall={installed ? undefined : () => setInstallOpen(true)} />
			)}
			{showInstalledNotice && <InstalledNotice onClose={() => setShowInstalledNotice(false)} />}
			{installOpen && <InstallDialog onClose={() => setInstallOpen(false)} />}

			{setupOpen && (
				<Setup
					keys={keys}
					onSaved={(k) => {
						setKeys(k);
						setSetupOpen(false);
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
					Prices from <a href="https://www.tiingo.com" target="_blank" rel="noopener noreferrer">Tiingo</a>, adjusted for splits and dividends. Economic data from{' '}
					<a href="https://fred.stlouisfed.org" target="_blank" rel="noopener noreferrer">FRED</a>, Federal Reserve Bank of St. Louis, using your own API keys. This product
					uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.
				</p>
				<p>For education only, not investment advice. Past performance doesn’t predict future results.</p>
			</footer>
		</div>
	);
}
