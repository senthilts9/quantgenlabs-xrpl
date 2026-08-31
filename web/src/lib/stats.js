// stats.js -- small return-series statistics shared by riskMeasures.js and the
// order-book microstructure panel. All guard against the empty/short-array
// cases that would otherwise divide by zero or return NaN.

export const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

export function std(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}

export function quantile(a, p) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const idx = Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)));
  return s[idx];
}

export function skew(a) {
  const m = mean(a);
  const s = std(a);
  if (s === 0 || a.length < 3) return 0;
  return a.reduce((z, x) => z + ((x - m) / s) ** 3, 0) / a.length;
}

export function excessKurtosis(a) {
  const m = mean(a);
  const s = std(a);
  if (s === 0 || a.length < 4) return 0;
  return a.reduce((z, x) => z + ((x - m) / s) ** 4, 0) / a.length - 3;
}

// Lag-1 sample autocorrelation. Numerator sums n-1 lagged products; denominator
// uses the full-sample variance (n terms) -- the standard convention (matches
// numpy/pandas), not a bug despite the differing counts.
export function autocorr(a) {
  if (a.length < 3) return 0;
  const m = mean(a);
  let num = 0;
  let den = 0;
  for (let i = 1; i < a.length; i++) num += (a[i] - m) * (a[i - 1] - m);
  for (const x of a) den += (x - m) ** 2;
  return den ? num / den : 0;
}

// Classical single-window rescaled-range (R/S) Hurst exponent estimate.
// Known to be noisy for short series -- a more robust estimate would fit
// log(R/S) vs log(n) across multiple window sizes; documented as a
// simplification, not a bug.
export function hurst(a) {
  if (a.length < 20) return 0.5;
  const m = mean(a);
  let cum = 0;
  let mn = Infinity;
  let mx = -Infinity;
  for (const x of a) {
    cum += x - m;
    mn = Math.min(mn, cum);
    mx = Math.max(mx, cum);
  }
  const range = mx - mn;
  const s2 = std(a);
  return s2 ? Math.log(range / s2) / Math.log(a.length) : 0.5;
}
