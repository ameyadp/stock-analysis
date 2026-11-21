// Installing as an app (PWA): capture the browser's install prompt, detect the
// platform for manual instructions, and remember whether the install notice was shown.

interface InstallPromptEvent extends Event {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

if (typeof window !== 'undefined') {
	// Chrome and Edge fire this when the app can be installed; keep it for our own button.
	window.addEventListener('beforeinstallprompt', (e) => {
		e.preventDefault();
		// Chrome and Edge only offer installing when the app isn't installed.
		forgetInstalled();
		deferred = e as InstallPromptEvent;
		notify();
	});
	window.addEventListener('appinstalled', () => {
		deferred = null;
		markInstalled();
		notify();
		reloadSoon();
	});
	// Installing from a tab moves that tab into the new app window without reloading it,
	// which would leave the browser-only overview on screen. Start fresh in app mode.
	window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', (e) => {
		if (e.matches) reloadSoon();
	});
}

export const canPromptInstall = () => deferred !== null;

export function onInstallAvailabilityChange(fn: () => void): () => void {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

/** Show the browser's install prompt. Resolves true if the person installed. */
export async function promptInstall(): Promise<boolean> {
	const event = deferred;
	if (!event) return false;
	deferred = null;
	notify();
	await event.prompt();
	const choice = await event.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
	return choice.outcome === 'accepted';
}

const INSTALLED = 'stock-analysis:installed';
let reloading = false;

function reloadSoon() {
	if (reloading) return;
	reloading = true;
	// A moment's delay lets the install count finish sending.
	setTimeout(() => window.location.reload(), 400);
}

function markInstalled(): void {
	try {
		localStorage.setItem(INSTALLED, '1');
	} catch {
		// storage unavailable
	}
}

function forgetInstalled(): void {
	try {
		localStorage.removeItem(INSTALLED);
	} catch {
		// storage unavailable
	}
}

/**
 * True when the app is installed on this device: running as the app, or a browser tab on a
 * device where it was installed. Browser tabs then skip the overview and install prompts.
 */
export function isInstalled(): boolean {
	if (isStandalone()) {
		markInstalled();
		return true;
	}
	try {
		return localStorage.getItem(INSTALLED) === '1';
	} catch {
		return false;
	}
}

/** True when running as the installed app rather than in a browser tab. */
export function isStandalone(): boolean {
	if (typeof window === 'undefined') return false;
	return window.matchMedia?.('(display-mode: standalone)').matches === true || (navigator as { standalone?: boolean }).standalone === true;
}

export type IosBrowser = 'safari' | 'chrome' | 'other';

/** On iPhone and iPad, which browser: each puts the Share button somewhere different. */
export function iosBrowser(ua = navigator.userAgent): IosBrowser {
	if (/CriOS/.test(ua)) return 'chrome';
	if (/FxiOS|EdgiOS|OPiOS/.test(ua)) return 'other';
	return 'safari';
}

/** Label for install buttons. iPhone and iPad can't install from a button: you add it to the Home Screen. */
export const installLabel = () => (typeof navigator !== 'undefined' && platform() === 'ios' ? 'Add to Home Screen' : 'Install app');

export type Platform = 'ios' | 'mac-safari' | 'chrome' | 'edge' | 'firefox' | 'other';

export function platform(ua = navigator.userAgent, touchPoints = navigator.maxTouchPoints ?? 0): Platform {
	const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
	if (ios) return 'ios';
	const safari = /Safari/.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Firefox/.test(ua);
	if (safari && /Macintosh/.test(ua)) return 'mac-safari';
	if (/Firefox\//.test(ua)) return 'firefox';
	if (/Edg\//.test(ua)) return 'edge';
	if (/Chrome\//.test(ua) && !/OPR\//.test(ua)) return 'chrome';
	return 'other';
}

const NOTICE_SEEN = 'stock-analysis:install-notice-seen';

export function installNoticeSeen(): boolean {
	try {
		return localStorage.getItem(NOTICE_SEEN) === '1';
	} catch {
		return true;
	}
}

export function markInstallNoticeSeen(): void {
	try {
		localStorage.setItem(NOTICE_SEEN, '1');
	} catch {
		// ignore
	}
}

/** True if the page was opened with ?install (e.g. from the website's "Install app" link). Removes the flag from the URL. */
export function takeInstallRequest(): boolean {
	const url = new URL(window.location.href);
	if (!url.searchParams.has('install')) return false;
	url.searchParams.delete('install');
	window.history.replaceState(null, '', url);
	return true;
}

const CONTINUE_IN_BROWSER = 'stock-analysis:continue-in-browser';

/** Whether to show the overview screen: only in a browser tab, until the person chooses to continue there. */
export function shouldShowIntro(): boolean {
	if (isInstalled()) return false;
	try {
		return sessionStorage.getItem(CONTINUE_IN_BROWSER) !== '1';
	} catch {
		return false;
	}
}

export function continueInBrowser(): void {
	try {
		sessionStorage.setItem(CONTINUE_IN_BROWSER, '1');
	} catch {
		// ignore
	}
}
