// localStorage can throw (private browsing, blocked storage), so every access is guarded.

export function read(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

export function write(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Storage unavailable: the app still works for this visit.
	}
}

export function remove(key: string): void {
	try {
		localStorage.removeItem(key);
	} catch {
		// ignore
	}
}
