const pctFmt = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const pctPlain = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0 });
const priceFmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });

/** 0.123 → "+12.3%" */
export const pct = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : pctFmt.format(v));
/** 0.42 → "42%" */
export const pctWhole = (v: number) => pctPlain.format(v);
export const price = (v: number) => priceFmt.format(v);
export const num = (v: number, digits = 2) => v.toFixed(digits);

export function monthLabel(month: string, style: 'short' | 'long' = 'short'): string {
	const [y, m] = month.split('-').map(Number) as [number, number];
	return new Intl.DateTimeFormat(undefined, { month: style, year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export function dateLabel(date: string): string {
	return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

export const toUnix = (isoDate: string) => Date.parse(`${isoDate.length === 7 ? `${isoDate}-01` : isoDate}T00:00:00Z`) / 1000;
