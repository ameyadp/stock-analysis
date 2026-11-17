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
		deferred = e as InstallPromptEvent;
		notify();
	});
	window.addEventListener('appinstalled', () => {
		deferred = null;
		notify();
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

/** True when running as the installed app rather than in a browser tab. */
export function isStandalone(): boolean {
	if (typeof window === 'undefined') return false;
	return window.matchMedia?.('(display-mode: standalone)').matches === true || (navigator as { standalone?: boolean }).standalone === true;
}

export type Platform = 'ios' | 'mac-safari' | 'other';

export function platform(ua = navigator.userAgent, touchPoints = navigator.maxTouchPoints ?? 0): Platform {
	const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
	if (ios) return 'ios';
	const safari = /Safari/.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Firefox/.test(ua);
	if (safari && /Macintosh/.test(ua)) return 'mac-safari';
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
