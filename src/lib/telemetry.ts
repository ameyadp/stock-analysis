import { read, remove, write } from './storage';

// Anonymous usage counting (same scheme as the Finance Tracker).
//
// Installs and app opens are always counted: the app sends "install", the app version, and a
// one-off random number that isn't stored, so it can't be linked to anything else.
//
// Everything else is opt-in: a random ID kept in this browser, the event name,
// and the app version, with at most one "active" ping per day.
//
// Never tickers, API keys, or anything else about what was looked at.

export type Consent = 'granted' | 'denied';
export type TelemetryEvent = 'active' | 'opt_in' | 'setup_complete' | 'install' | 'open_app' | 'open_web';

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

async function post(event: TelemetryEvent, id: string): Promise<boolean> {
	if (import.meta.env.DEV) return false;
	try {
		const res = await fetch(PING_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, event, v: __APP_VERSION__ }),
			keepalive: true,
		});
		return res.ok;
	} catch {
		return false; // Best effort only.
	}
}

/** Opt-in events, sent with this browser's anonymous ID. */
const send = async (event: TelemetryEvent) => (getConsent() === 'granted' ? post(event, anonId()) : false);

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
const INSTALL_COUNTED = 'stock-analysis:install-counted';

/** Count an install, once per device. Always sent, without the browser's ID. */
export async function pingInstall(): Promise<void> {
	if (read(INSTALL_COUNTED)) return;
	if (await post('install', crypto.randomUUID())) write(INSTALL_COUNTED, '1');
}

const OPEN_COUNTED = 'stock-analysis:open-counted';

/** Count one app open per session (installed app or browser tab). Always sent, without the device's ID. */
export async function pingOpen(installed: boolean): Promise<void> {
	try {
		if (sessionStorage.getItem(OPEN_COUNTED)) return;
		sessionStorage.setItem(OPEN_COUNTED, '1');
	} catch {
		// storage unavailable: still count
	}
	await post(installed ? 'open_app' : 'open_web', crypto.randomUUID());
}
