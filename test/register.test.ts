import { describe, expect, it } from 'vitest';
import { handleRegister, parseRegistration } from '../worker/register';

describe('parseRegistration', () => {
	it('accepts and tidies name, email and location', () => {
		expect(parseRegistration({ name: '  Ada   Lovelace ', email: ' Ada@Example.COM ', location: ' London,  UK ', website: '' })).toEqual({
			ok: true,
			value: { name: 'Ada Lovelace', email: 'ada@example.com', location: 'London, UK' },
		});
	});

	it('ignores any extra fields', () => {
		const r = parseRegistration({ name: 'A', email: 'a@b.co', location: 'Paris', phone: '555', ip: '1.2.3.4' });
		expect(r).toEqual({ ok: true, value: { name: 'A', email: 'a@b.co', location: 'Paris' } });
	});

	it.each([
		[{ name: '', email: 'a@b.co', location: 'Paris' }, /name/],
		[{ name: 'x'.repeat(101), email: 'a@b.co', location: 'Paris' }, /name/],
		[{ name: 'A', email: 'not-an-email', location: 'Paris' }, /email/],
		[{ name: 'A', email: 'a @b.co', location: 'Paris' }, /email/],
		[{ name: 'A', email: 'a@b.co', location: 'P' }, /location/],
		[{ name: 'A', email: 'a@b.co' }, /location/],
	])('rejects %j', (body, message) => {
		const r = parseRegistration(body);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toMatch(message);
	});

	it('flags the hidden spam-trap field', () => {
		expect(parseRegistration({ name: 'Bot', email: 'bot@spam.io', location: 'Nowhere', website: 'http://spam' })).toMatchObject({ ok: false, spam: true });
	});
});

describe('handleRegister', () => {
	function setup(limitOk = true) {
		const rows = new Map<string, { name: string; email: string; location: string; created_at: string; updated_at: string }>();
		const db = {
			prepare: (sql: string) => ({
				bind: (name: string, email: string, location: string, now: string) => ({
					run: async () => {
						expect(sql).toMatch(/ON CONFLICT\(email\) DO UPDATE/);
						const prev = rows.get(email);
						rows.set(email, { name, email, location, created_at: prev?.created_at ?? now, updated_at: now });
					},
				}),
			}),
		} as unknown as D1Database;
		const limiter = { limit: async () => ({ success: limitOk }) } as unknown as RateLimit;
		const post = (body: unknown, init: RequestInit = {}) =>
			handleRegister(new Request('https://x/api/register', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), ...init }), db, limiter);
		return { rows, post };
	}

	it('stores only name, email and location, one row per email', async () => {
		const { rows, post } = setup();
		expect((await post({ name: 'Ada', email: 'ada@example.com', location: 'London', website: '' })).status).toBe(201);
		expect((await post({ name: 'Ada L', email: 'ADA@example.com', location: 'Paris', website: '' })).status).toBe(201);
		expect(rows.size).toBe(1);
		const row = rows.get('ada@example.com')!;
		expect(Object.keys(row).sort()).toEqual(['created_at', 'email', 'location', 'name', 'updated_at']);
		expect(row).toMatchObject({ name: 'Ada L', location: 'Paris' });
	});

	it('explains invalid input and stores nothing', async () => {
		const { rows, post } = setup();
		const res = await post({ name: 'Ada', email: 'nope', location: 'London' });
		expect(res.status).toBe(400);
		expect(((await res.json()) as { error: string }).error).toMatch(/valid email/);
		expect(rows.size).toBe(0);
	});

	it('quietly drops spam without storing it', async () => {
		const { rows, post } = setup();
		expect((await post({ name: 'Bot', email: 'bot@spam.io', location: 'Nowhere', website: 'x' })).status).toBe(201);
		expect(rows.size).toBe(0);
	});

	it('rejects oversized, malformed, wrong-method and rate-limited requests', async () => {
		const { post } = setup();
		expect((await post('x'.repeat(5000))).status).toBe(413);
		expect((await post('not json')).status).toBe(400);
		const limited = setup(false);
		expect((await limited.post({ name: 'Ada', email: 'ada@example.com', location: 'London' })).status).toBe(429);
		const get = await handleRegister(new Request('https://x/api/register'), {} as D1Database, { limit: async () => ({ success: true }) } as unknown as RateLimit);
		expect(get.status).toBe(405);
	});
});
