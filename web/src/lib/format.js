export function fmt(x, digits = 4) {
  if (x == null || !Number.isFinite(x)) return '—';
  return x.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmt0(x) {
  if (x == null || !Number.isFinite(x)) return '—';
  return Math.round(x).toLocaleString();
}

export const sgn = (x) => (x > 0 ? 'pos' : x < 0 ? 'neg' : '');
