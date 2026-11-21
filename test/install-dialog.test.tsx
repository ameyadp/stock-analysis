// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InstallDialog } from '../src/components/InstallDialog';

beforeEach(() => {
	localStorage.clear();
	localStorage.setItem('stock-analysis:registered', '1');
});
afterEach(cleanup);

describe('install dialog', () => {
	it('on a device where the app is installed, explains how to open it instead of offering to install', () => {
		localStorage.setItem('stock-analysis:installed', '1');
		render(<InstallDialog onClose={() => {}} />);
		expect(screen.getByText(/is already installed on this device/)).toBeTruthy();
		expect(screen.queryByRole('button', { name: /install/i })).toBeNull();
	});

	it('on iPhone, explains Add to Home Screen with steps for the browser in use', () => {
		const original = navigator.userAgent;
		const setUA = (ua: string) => Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
		try {
			setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
			const { unmount } = render(<InstallDialog onClose={() => {}} />);
			expect(screen.getByRole('heading', { name: /to your Home Screen/ })).toBeTruthy();
			expect(screen.getByText(/three quick taps in Safari/)).toBeTruthy();
			expect(screen.getByText(/toolbar at the bottom of the screen/)).toBeTruthy();
			expect(screen.getByRole('button', { name: 'OK' })).toBeTruthy();
			unmount();
			setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1');
			render(<InstallDialog onClose={() => {}} />);
			expect(screen.getByText(/three quick taps in Chrome/)).toBeTruthy();
			expect(screen.getByText(/at the top right, in the address bar/)).toBeTruthy();
		} finally {
			setUA(original);
		}
	});

	it('offers to install again once the browser says it can (the app was removed)', () => {
		localStorage.setItem('stock-analysis:installed', '1');
		render(<InstallDialog onClose={() => {}} />);
		act(() => {
			window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt: async () => {}, userChoice: new Promise(() => {}) }));
		});
		expect(screen.getByRole('button', { name: 'Agree & install' })).toBeTruthy();
		expect(screen.getByText(/Usage counting is required/)).toBeTruthy();
	});

});
