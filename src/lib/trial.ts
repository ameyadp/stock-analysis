// Browser trial: people who haven't signed up get {TRIAL_SESSIONS} free sessions in a browser tab,
// then need the one-time sign-up to keep using the browser version.
//
// A "session" is one visit in a browser tab: it's counted once when the person enters
// the app, and reloads in the same tab don't count again. The count is kept only in
// this browser on this device (localStorage) and is never sent anywhere.

import { isRegistered } from './registration';

export const TRIAL_SESSIONS = 3;
const USED = 'stock-analysis:browser-sessions';
const COUNTED_THIS_SESSION = 'stock-analysis:browser-session-counted';

export function browserSessionsUsed(): number {
	try {
		return Math.max(0, Number(localStorage.getItem(USED)) || 0);
	} catch {
		return 0;
	}
}

/** Count this browser visit (once per tab session) and return the session number. */
export function startBrowserSession(): number {
	let used = browserSessionsUsed();
	try {
		if (sessionStorage.getItem(COUNTED_THIS_SESSION) !== '1') {
			used += 1;
			localStorage.setItem(USED, String(used));
			sessionStorage.setItem(COUNTED_THIS_SESSION, '1');
		}
	} catch {
		// Storage unavailable (e.g. blocked): don't lock the person out.
		return 1;
	}
	return used;
}

export type BrowserAccess = { gate: 'trial-ended' | null; session: number | null };

/** Called when someone enters the app in a browser tab. Signed-up devices are never counted. */
export function enterBrowserApp(): BrowserAccess {
	if (isRegistered()) return { gate: null, session: null };
	const session = startBrowserSession();
	return { gate: session > TRIAL_SESSIONS ? 'trial-ended' : null, session };
}
