import type { ApiError, MacroData, StockData } from './lib/types';

const API = `${import.meta.env.BASE_URL}api`;

async function get<T>(path: string): Promise<T> {
	let res: Response;
	try {
		res = await fetch(`${API}${path}`);
	} catch {
		throw new Error('Couldn’t reach the server. Check your connection and try again.');
	}
	const body = (await res.json().catch(() => null)) as T | ApiError | null;
	if (!res.ok || body === null) {
		throw new Error((body as ApiError | null)?.error ?? 'Something went wrong. Please try again.');
	}
	return body as T;
}

export const fetchStock = (ticker: string) => get<StockData>(`/stock/${encodeURIComponent(ticker)}`);
export const fetchMacro = () => get<MacroData>('/macro');
