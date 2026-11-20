// Install sign-up: name, email and location only, sent to this app's server.
// The device remembers that it signed up, so people only see the form once.

const REGISTERED = 'stock-analysis:registered';
const URL_REGISTER = `${import.meta.env.BASE_URL}api/register`;

export interface RegistrationInput {
	name: string;
	email: string;
	location: string;
	/** Hidden spam trap: always empty for real people. */
	website: string;
}

export function isRegistered(): boolean {
	try {
		return localStorage.getItem(REGISTERED) === '1';
	} catch {
		return false;
	}
}

export async function submitRegistration(input: RegistrationInput): Promise<{ ok: true } | { ok: false; error: string }> {
	let res: Response;
	try {
		res = await fetch(URL_REGISTER, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(input),
		});
	} catch {
		return { ok: false, error: 'Couldn’t reach the server. Check your connection and try again.' };
	}
	if (!res.ok) {
		const body = (await res.json().catch(() => null)) as { error?: string } | null;
		return { ok: false, error: body?.error ?? 'Something went wrong. Please try again.' };
	}
	try {
		localStorage.setItem(REGISTERED, '1');
	} catch {
		// ignore
	}
	return { ok: true };
}
