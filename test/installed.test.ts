// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { isInstalled, shouldShowIntro, verifyInstalled } from '../src/lib/install';
import { useInstalled } from '../src/lib/useInstalled';

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

	it('the browser’s own check corrects a stale marker after uninstalling, and confirms a real install', async () => {
		const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> };
		try {
			localStorage.setItem('stock-analysis:installed', '1');
			nav.getInstalledRelatedApps = async () => [];
			await verifyInstalled();
			expect(isInstalled()).toBe(false);
			nav.getInstalledRelatedApps = async () => [{ platform: 'webapp' }];
			await verifyInstalled();
			expect(isInstalled()).toBe(true);
		} finally {
			delete nav.getInstalledRelatedApps;
		}
	});

	it('install buttons come back without a reload once the browser offers to install again', () => {
		localStorage.setItem('stock-analysis:installed', '1');
		const { result } = renderHook(() => useInstalled());
		expect(result.current).toBe(true);
		act(() => {
			window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt: async () => {}, userChoice: new Promise(() => {}) }));
		});
		expect(result.current).toBe(false);
	});
});
