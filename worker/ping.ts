// Validation for anonymous usage pings, kept separate from the Worker so it can be unit-tested.

export const EVENTS = ['active', 'opt_in', 'setup_complete', 'install', 'open_app', 'open_web', 'trial_ended'] as const;
export type PingEvent = (typeof EVENTS)[number];

export interface Ping {
	id: string;
	event: PingEvent;
	version: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

/** Returns a clean Ping, or null if the payload is not exactly what the app sends. */
export function parsePing(body: unknown): Ping | null {
	if (typeof body !== 'object' || body === null) return null;
	const { id, event, v } = body as Record<string, unknown>;
	if (typeof id !== 'string' || !UUID.test(id)) return null;
	if (typeof event !== 'string' || !(EVENTS as readonly string[]).includes(event)) return null;
	if (typeof v !== 'string' || !VERSION.test(v)) return null;
	return { id: id.toLowerCase(), event: event as PingEvent, version: v };
}
