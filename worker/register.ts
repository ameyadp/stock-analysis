// Validation for the install sign-up form, kept separate from the Worker so it can be unit-tested.
// Only name, email and location are accepted; anything else in the request is ignored.

export interface Registration {
	name: string;
	email: string;
	location: string;
}

const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
// Practical email check: something@something.tld, no spaces, sensible lengths.
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;

export type RegistrationResult = { ok: true; value: Registration } | { ok: false; error: string; spam?: boolean };

export function parseRegistration(body: unknown): RegistrationResult {
	if (typeof body !== 'object' || body === null) return { ok: false, error: 'Invalid request.' };
	const b = body as Record<string, unknown>;
	// Hidden "website" field: people never see it, bots tend to fill it in.
	if (clean(b.website)) return { ok: false, error: 'Invalid request.', spam: true };

	const name = clean(b.name);
	const email = clean(b.email).toLowerCase();
	const location = clean(b.location);
	if (name.length < 1 || name.length > 100) return { ok: false, error: 'Please enter your name (up to 100 characters).' };
	if (email.length > 254 || !EMAIL.test(email)) return { ok: false, error: 'Please enter a valid email address.' };
	if (location.length < 2 || location.length > 100) return { ok: false, error: 'Please enter your location, like “Austin, TX”.' };
	return { ok: true, value: { name, email, location } };
}

export const UPSERT_REGISTRATION = `INSERT INTO registrations (name, email, location, created_at, updated_at)
	VALUES (?1, ?2, ?3, ?4, ?4)
	ON CONFLICT(email) DO UPDATE SET name = excluded.name, location = excluded.location, updated_at = excluded.updated_at`;

const MAX_REGISTRATION_BYTES = 2048;

const reply = (body: unknown, status: number) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

/** POST api/register: store name, email and location. No IP address or other data is kept. */
export async function handleRegister(request: Request, db: D1Database, limiter: RateLimit): Promise<Response> {
	if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });

	// The visitor's IP is used only for this rate check and is never stored.
	const { success } = await limiter.limit({ key: request.headers.get('CF-Connecting-IP') ?? 'unknown' });
	if (!success) return reply({ error: 'Too many attempts. Please wait a minute and try again.' }, 429);

	const text = await request.text();
	if (text.length > MAX_REGISTRATION_BYTES) return reply({ error: 'Invalid request.' }, 413);
	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		return reply({ error: 'Invalid request.' }, 400);
	}

	const result = parseRegistration(body);
	// Pretend spam succeeded so bots don't learn to avoid the trap.
	if (!result.ok) return result.spam ? reply({ ok: true }, 201) : reply({ error: result.error }, 400);

	const { name, email, location } = result.value;
	await db.prepare(UPSERT_REGISTRATION).bind(name, email, location, new Date().toISOString()).run();
	return reply({ ok: true }, 201);
}
