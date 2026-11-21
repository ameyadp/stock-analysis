import { installLabel } from '../lib/install';
import { type FormEvent, useState } from 'react';
import { submitRegistration } from '../lib/registration';

const APP = 'Stock Analysis';
export const PRIVACY_CONTACT = 'support@ameyapurandare.com';

/** Required before installing: name, email and location, nothing else. */
export function RegistrationForm({ onDone, submitLabel = 'Continue' }: { onDone: () => void; submitLabel?: string }) {
	const [name, setName] = useState('');
	const [email, setEmail] = useState('');
	const [location, setLocation] = useState('');
	const [website, setWebsite] = useState(''); // spam trap, hidden from people
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);

	async function submit(e: FormEvent) {
		e.preventDefault();
		setBusy(true);
		setError('');
		const result = await submitRegistration({ name, email, location, website });
		setBusy(false);
		if (result.ok) onDone();
		else setError(result.error);
	}

	return (
		<form className="reg-form" onSubmit={submit}>
			<label>
				Name
				<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={100} required />
			</label>
			<label>
				Email
				<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={254} required />
			</label>
			<label>
				Location
				<input
					value={location}
					onChange={(e) => setLocation(e.target.value)}
					placeholder="City and country, e.g. Austin, USA"
					autoComplete="address-level2"
					maxLength={100}
					required
				/>
			</label>
			<div className="reg-trap" aria-hidden="true">
				<label>
					Website
					<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
				</label>
			</div>

			<p className="reg-privacy">
				We ask for your name, email and location to understand who uses {APP} and to occasionally email you about major updates.
				That’s all this form collects, and it’s never sold or shared. Your app data stays on your device. To see or delete your
				information, email <a href={`mailto:${PRIVACY_CONTACT}`}>{PRIVACY_CONTACT}</a>.
			</p>

			<p className="usage-note" role="note">
				📊 Using Stock Analysis includes anonymous usage counts, and this is required: each install and app open, plus once a day a random ID, the app version and the word “active”, so I can see how many people use it. Never your keys, tickers or anything you look up.
			</p>

			{error && (
				<p className="reg-error" role="alert">
					{error}
				</p>
			)}
			<div className="actions">
				<button type="submit" disabled={busy}>
					{busy ? 'Saving…' : submitLabel}
				</button>
			</div>
		</form>
	);
}

export type GateReason = 'installed' | 'trial-ended' | 'voluntary';

const GATE_TEXT: Record<GateReason, { title: string; subtitle: string; submit: string }> = {
	installed: { title: `Welcome to ${APP}`, subtitle: 'One quick step before you start: tell us who you are.', submit: 'Start using the app' },
	'trial-ended': {
		title: 'You’ve used your 3 free sessions',
		subtitle: `Sign up (it’s free) to keep using ${APP} in your browser, or install the app.`,
		submit: `Keep using ${APP}`,
	},
	voluntary: { title: `Sign up for ${APP}`, subtitle: 'Free, and it unlocks unlimited use in your browser.', submit: 'Sign up' },
};

/** Full-screen sign-up: on the installed app's first launch, when the browser trial ends, or when chosen. */
export function RegistrationGate({
	reason = 'installed',
	onDone,
	onInstall,
	onCancel,
}: {
	reason?: GateReason;
	onDone: () => void;
	onInstall?: () => void;
	onCancel?: () => void;
}) {
	const text = GATE_TEXT[reason];
	return (
		<div className="intro-page">
			<header className="intro-head">
				<img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={56} height={56} />
				<div>
					<h1>{text.title}</h1>
					<p className="intro-tagline">{text.subtitle}</p>
				</div>
			</header>
			<div className="reg-card">
				<RegistrationForm onDone={onDone} submitLabel={text.submit} />
				{(onInstall || onCancel) && (
					<div className="actions">
						{onInstall && (
							<button type="button" className="secondary" onClick={onInstall}>
								Install the app instead
							</button>
						)}
						{onCancel && (
							<button type="button" className="secondary" onClick={onCancel}>
								Not now
							</button>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

/** Shown in the browser during the free trial. */
export function TrialBanner({ session, total, onSignUp, onInstall }: { session: number; total: number; onSignUp: () => void; onInstall?: () => void }) {
	const left = total - session;
	return (
		<aside className="trial-banner" role="region" aria-label="Free trial">
			<p>
				<strong>
					Free browser session {session} of {total}.
				</strong>{' '}
				{left > 0 ? `${left} more before sign-up is needed.` : 'Next time, a free sign-up is needed.'} Signing up or installing keeps {APP} free to use.
			</p>
			<div className="actions">
				<button type="button" onClick={onSignUp}>
					Sign up
				</button>
				{onInstall && (
					<button type="button" className="secondary" onClick={onInstall}>
						{installLabel()}
					</button>
				)}
			</div>
		</aside>
	);
}
