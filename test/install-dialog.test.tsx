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
