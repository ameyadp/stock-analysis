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

/** Full-screen gate on the installed app's first launch, if the person hasn't signed up on this device. */
export function RegistrationGate({ onDone }: { onDone: () => void }) {
	return (
		<div className="intro-page">
			<header className="intro-head">
				<img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={56} height={56} />
				<div>
					<h1>Welcome to {APP}</h1>
					<p className="intro-tagline">One quick step before you start: tell us who you are.</p>
				</div>
			</header>
			<div className="reg-card">
				<RegistrationForm onDone={onDone} submitLabel="Start using the app" />
			</div>
		</div>
	);
}
