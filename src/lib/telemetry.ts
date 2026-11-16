import { read, remove, write } from './storage';

// Anonymous, opt-in usage counting (same scheme as the Finance Tracker).
//
// What is sent (only if the visitor opts in): a random ID created in this
// browser, the event name, and the app version. Never tickers, API keys, or
// anything else about what was looked at. At most one "active" ping per day.

export type Consent = 'granted' | 'denied';
export type TelemetryEvent = 'active' | 'opt_in' | 'setup_complete';

const CONSENT = 'stock-analysis:telemetry-consent';
const ANON_ID = 'stock-analysis:anon-id';
const LAST_PING = 'stock-analysis:last-ping-day';
const PING_URL = `${import.meta.env.BASE_URL}api/ping`;

export function getConsent(): Consent | null {
	const value = read(CONSENT);
	return value === 'granted' || value === 'denied' ? value : null;
}

function anonId(): string {
	let id = read(ANON_ID);
	if (!id) {
		id = crypto.randomUUID();
		write(ANON_ID, id);
	}
	return id;
}

async function send(event: TelemetryEvent): Promise<boolean> {
	if (import.meta.env.DEV || getConsent() !== 'granted') return false;
	try {
		const res = await fetch(PING_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: anonId(), event, v: __APP_VERSION__ }),
			keepalive: true,
		});
		return res.ok;
	} catch {
		return false; // Best effort only.
	}
}

const today = () => new Date().toISOString().slice(0, 10);

/** Record that the app was opened today (once per day, only with consent). */
export async function pingActive(): Promise<void> {
	if (getConsent() !== 'granted' || read(LAST_PING) === today()) return;
	if (await send('active')) write(LAST_PING, today());
}

export async function setConsent(consent: Consent): Promise<void> {
	write(CONSENT, consent);
	if (consent === 'granted') {
		await send('opt_in');
		await pingActive();
	} else {
		// Forget the ID so a later opt-in starts fresh.
		remove(ANON_ID);
		remove(LAST_PING);
	}
}

export const pingSetupComplete = () => send('setup_complete');
