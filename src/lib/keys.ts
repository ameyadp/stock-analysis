import { isFredKey, isTiingoKey } from '../../worker/data';
import { read, remove, write } from './storage';

// Each visitor uses their own free Tiingo and FRED API keys, saved only in this browser.

export interface ApiKeys {
	tiingo: string;
	fred: string;
}

const TIINGO = 'stock-analysis:tiingo-key';
const FRED = 'stock-analysis:fred-key';

export function loadKeys(): ApiKeys | null {
	const tiingo = read(TIINGO);
	const fred = read(FRED);
	return isTiingoKey(tiingo) && isFredKey(fred) ? { tiingo, fred } : null;
}

export function saveKeys(keys: ApiKeys): void {
	write(TIINGO, keys.tiingo);
	write(FRED, keys.fred);
}

export function clearKeys(): void {
	remove(TIINGO);
	remove(FRED);
}

/** Problems with the format of entered keys, before trying them against the providers. */
export function keyProblems(keys: ApiKeys): { tiingo?: string; fred?: string } {
	return {
		...(isTiingoKey(keys.tiingo) ? {} : { tiingo: 'A Tiingo token is 40 letters and numbers (0–9, a–f).' }),
		...(isFredKey(keys.fred) ? {} : { fred: 'A FRED key is 32 lowercase letters and numbers.' }),
	};
}
