// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pingActive, pingInstall, pingOpen, pingTrialEnded, setConsent } from '../src/lib/telemetry';

const sent = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(init!.body as string));
const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));

beforeEach(() => {
	localStorage.clear();
	fetchMock.mockClear();
	vi.stubGlobal('fetch', fetchMock);
	vi.stubEnv('DEV', false);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe('usage counting', () => {
	it('always counts a browser trial ending, once per device, without the device’s ID', async () => {
		localStorage.removeItem('stock-analysis:trial-end-counted');
		await pingTrialEnded();
		await pingTrialEnded();
		const events = sent();
		expect(events.map((e) => e.event)).toEqual(['trial_ended']);
		expect(localStorage.getItem('stock-analysis:trial-end-counted')).toBe('1');
		expect(localStorage.getItem('stock-analysis:anon-id')).toBeNull();
	});

	it('always counts one open per session, without the device’s ID, split by installed app vs browser', async () => {
		sessionStorage.clear();
		await pingOpen(false);
		await pingOpen(false); // same session: not counted again
		sessionStorage.clear(); // a new session, e.g. launching the installed app
		await pingOpen(true);
		const events = sent();
		expect(events.map((e) => e.event)).toEqual(['open_web', 'open_app']);
		expect(events[0].id).not.toBe(events[1].id);
		expect(localStorage.getItem('stock-analysis:anon-id')).toBeNull();
	});

	it('always counts an install, once per device, without the device’s ID', async () => {
		await pingInstall();
		await pingInstall();
		const events = sent();
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({ event: 'install' });
		expect(localStorage.getItem('stock-analysis:install-counted')).toBe('1');
	});

	it('sends nothing else without consent', async () => {
		await pingActive();
		await setConsent('denied');
		await pingActive();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('sends opt-in events with a stable anonymous ID once consent is given', async () => {
		await setConsent('granted');
		await pingActive(); // already pinged today: skipped
		const events = sent();
		expect(events.map((e) => e.event)).toEqual(['opt_in', 'active']);
		expect(events[0].id).toBe(events[1].id);
		expect(events[0].id).toBe(localStorage.getItem('stock-analysis:anon-id'));

		await pingInstall();
		expect(sent()[2].id).not.toBe(events[0].id); // installs never carry the stored ID
	});
});
