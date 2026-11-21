import { installLabel } from '../lib/install';
import { SiteNav } from './SiteNav';
// Overview shown when the app is opened in a browser tab (not installed):
// what it does, a screenshot, and a nudge to install for regular use.

const FEATURES: { title: string; text: string }[] = [
	{ title: '30 years of price & trend', text: 'Adjusted prices, moving averages, golden and death crosses, drawdowns and volatility.' },
	{ title: 'Through Fed rate cycles', text: 'How the stock did while the Fed was hiking, holding or cutting, cycle by cycle.' },
	{ title: 'Sensitivity to the economy', text: 'How monthly returns moved with rates, inflation and unemployment, in plain English.' },
	{ title: 'Your own free data keys', text: 'Uses free Tiingo and FRED keys that stay in your browser. Setup takes about two minutes.' },
];

export function AppIntro({ onInstall, onContinue }: { onInstall: () => void; onContinue: () => void }) {
	return (
		<div className="intro-page">
			<SiteNav />
			<header className="intro-head">
				<img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={56} height={56} />
				<div>
					<h1>Stock Analysis</h1>
					<p className="intro-tagline">See how a stock behaved through Fed rate cycles, and how sensitive it is to the economy.</p>
				</div>
			</header>

			<p className="usage-note" role="note">
				📊 Using Stock Analysis includes anonymous usage counts, and this is required: each install and app open, plus once a day a random ID, the app version and the word “active”, so I can see how many people use it. Never your keys, tickers or anything you look up.
			</p>

			<div className="intro-actions">
				<button type="button" className="intro-primary" onClick={onInstall}>
					{installLabel()}
				</button>
				<button type="button" className="intro-secondary" onClick={onContinue}>
					Continue in browser
				</button>
			</div>
			<p className="intro-why">
				Installing is the best way to use it regularly: it opens in its own window from your dock, start menu or home screen, and
				works offline. It’s free: installing takes a one-time sign-up, and in the browser you get 3 sessions before signing up.
			</p>

			<img
				className="intro-shot"
				src={`${import.meta.env.BASE_URL}overview.webp`}
				alt="Screenshot of Stock Analysis"
				width={1100}
				height={760}
			/>

			<ul className="intro-features">
				{FEATURES.map((f) => (
					<li key={f.title}>
						<strong>{f.title}</strong>
						<span>{f.text}</span>
					</li>
				))}
			</ul>

			<p className="intro-foot">For education only, not investment advice. Installing asks once for your name, email and location.</p>
		</div>
	);
}
