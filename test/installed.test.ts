// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isInstalled, shouldShowIntro } from '../src/lib/install';

const setStandalone = (on: boolean) => {
	window.matchMedia = ((q: string) => ({ matches: on && q.includes('standalone'), media: q, addEventListener() {}, removeEventListener() {} })) as never;
};

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	setStandalone(false);
});
afterEach(() => setStandalone(false));

describe('installed on this device', () => {
	it('a fresh browser tab shows the overview', () => {
		expect(isInstalled()).toBe(false);
		expect(shouldShowIntro()).toBe(true);
	});

	it('running as the installed app remembers it for browser tabs on the same device', () => {
		setStandalone(true);
		expect(isInstalled()).toBe(true);
		expect(shouldShowIntro()).toBe(false);
		setStandalone(false);
		expect(localStorage.getItem('stock-analysis:installed')).toBe('1');
		expect(isInstalled()).toBe(true);
		expect(shouldShowIntro()).toBe(false);
	});

	it('forgets it when the browser offers to install again (the app was removed)', () => {
		localStorage.setItem('stock-analysis:installed', '1');
		window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'dismissed' }) }));
		expect(isInstalled()).toBe(false);
		expect(shouldShowIntro()).toBe(true);
	});
});
