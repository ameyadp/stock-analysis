import { type FormEvent, useState } from 'react';
import { ApiRequestError, clearDataCache, fetchMacro, fetchStock } from '../api';
import { type ApiKeys, clearKeys, keyProblems, saveKeys } from '../lib/keys';
import { type Consent, getConsent, pingSetupComplete, setConsent } from '../lib/telemetry';

interface Props {
	keys: ApiKeys | null;
	onSaved: (keys: ApiKeys) => void;
	onClose: () => void;
	onCleared: () => void;
}

type Problems = { tiingo?: string; fred?: string; other?: string };

function describe(err: unknown): string {
	return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
}

export function Setup({ keys, onSaved, onClose, onCleared }: Props) {
	const [tiingo, setTiingo] = useState(keys?.tiingo ?? '');
	const [fred, setFred] = useState(keys?.fred ?? '');
	const [show, setShow] = useState(false);
	const [problems, setProblems] = useState<Problems>({});
	const [testing, setTesting] = useState(false);
	const [consent, setConsentState] = useState<Consent | null>(getConsent);

	async function submit(e: FormEvent) {
		e.preventDefault();
		const candidate = { tiingo: tiingo.trim().toLowerCase(), fred: fred.trim().toLowerCase() };
		const formatProblems = keyProblems(candidate);
		setProblems(formatProblems);
		if (formatProblems.tiingo || formatProblems.fred) return;

		setTesting(true);
		// Try both keys for real (bypassing the local cache) before saving them.
		const [stock, macro] = await Promise.allSettled([fetchStock('SPY', candidate, false), fetchMacro(candidate, false)]);
		setTesting(false);

		const next: Problems = {};
		if (stock.status === 'rejected') {
			if (stock.reason instanceof ApiRequestError && stock.reason.status === 401) next.tiingo = describe(stock.reason);
			else next.other = describe(stock.reason);
		}
		if (macro.status === 'rejected') {
			if (macro.reason instanceof ApiRequestError && macro.reason.status === 401) next.fred = describe(macro.reason);
			else next.other ??= describe(macro.reason);
		}
		setProblems(next);
		if (next.tiingo || next.fred || next.other) return;

		saveKeys(candidate);
		void pingSetupComplete();
		onSaved(candidate);
	}

	async function removeKeys() {
		clearKeys();
		await clearDataCache();
		setTiingo('');
		setFred('');
		onCleared();
	}

	async function changeConsent(granted: boolean) {
		const value: Consent = granted ? 'granted' : 'denied';
		setConsentState(value);
		await setConsent(value);
	}

	return (
		<section className="card setup">
			<h2>{keys ? 'Data keys' : 'Connect your free data keys'}</h2>
			<p className="lead">
				This tool uses stock prices from <strong>Tiingo</strong> and economic data from <strong>FRED</strong>. Both are free.
				Everyone uses their own keys, so there are no shared limits. It takes about two minutes.
			</p>

			<form onSubmit={submit} noValidate>
				<ol className="steps">
					<li>
						<label htmlFor="tiingo-key">
							<strong>Tiingo API token</strong>
						</label>
						<p className="muted small">
							Create a free account at{' '}
							<a href="https://www.tiingo.com/account/api/token" target="_blank" rel="noreferrer">
								tiingo.com
							</a>
							, then copy the token shown under Account → API → Token.
						</p>
						<input
							id="tiingo-key"
							type={show ? 'text' : 'password'}
							value={tiingo}
							onChange={(e) => setTiingo(e.target.value)}
							autoComplete="off"
							spellCheck={false}
							placeholder="40 characters"
							aria-invalid={!!problems.tiingo}
							aria-describedby={problems.tiingo ? 'tiingo-error' : undefined}
						/>
						{problems.tiingo && (
							<p id="tiingo-error" className="field-error">
								{problems.tiingo}
							</p>
						)}
					</li>
					<li>
						<label htmlFor="fred-key">
							<strong>FRED API key</strong>
						</label>
						<p className="muted small">
							Create a free account at{' '}
							<a href="https://fredaccount.stlouisfed.org/apikeys" target="_blank" rel="noreferrer">
								fred.stlouisfed.org
							</a>{' '}
							and request an API key. It’s issued instantly.
						</p>
						<input
							id="fred-key"
							type={show ? 'text' : 'password'}
							value={fred}
							onChange={(e) => setFred(e.target.value)}
							autoComplete="off"
							spellCheck={false}
							placeholder="32 characters"
							aria-invalid={!!problems.fred}
							aria-describedby={problems.fred ? 'fred-error' : undefined}
						/>
						{problems.fred && (
							<p id="fred-error" className="field-error">
								{problems.fred}
							</p>
						)}
					</li>
				</ol>

				<label className="toggle">
					<input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show keys
				</label>

				{problems.other && (
					<p className="field-error" role="alert">
						{problems.other}
					</p>
				)}

				<div className="actions">
					<button type="submit" className="primary" disabled={testing}>
						{testing ? 'Testing keys…' : 'Test & save'}
					</button>
					{keys && (
						<>
							<button type="button" className="secondary" onClick={onClose}>
								Cancel
							</button>
							<button type="button" className="secondary danger" onClick={() => void removeKeys()}>
								Remove keys from this browser
							</button>
						</>
					)}
				</div>
			</form>

			<p className="note">
				🔒 Your keys are saved only in this browser. Because Tiingo and FRED don’t accept requests directly from web pages, each
				request passes through this site’s server to reach them. Your key is used for that request only and is never stored or
				logged.
			</p>

			<div className="privacy">
				<label className="toggle">
					<input type="checkbox" checked={consent === 'granted'} onChange={(e) => void changeConsent(e.target.checked)} /> Share
					anonymous usage counts
				</label>
				<p className="muted small">
					If on, the app sends a random ID, the app version, and “active” once a day you use it, so the developer can see whether
					it’s worth building further. Never your keys, tickers, or anything you look up.
				</p>
			</div>
		</section>
	);
}
