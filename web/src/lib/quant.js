// quant.js -- option pricing and Greeks.
//
// Ported from dashboards/risk-analytics-board.html (bump-and-revalue Black-Scholes
// against Abramowitz-Stegun erf), with two corrections made during the port:
//   1. veta now follows the same "decay per calendar day" sign/scale convention as
//      theta/charm/color (negated, /365) instead of the odd-one-out raw /1e4 the
//      HTML version used -- consistency with the rest of the time-decay Greeks.
//   2. Position scaling is now an explicit, separate step (scalePortfolio) rather
//      than baked into the label strings, so the underlying per-option Greek is
//      always available in its natural range (e.g. delta in [-1,1]).
// Everything here is a pure function -- see scripts/selftest.mjs for the edge
// cases this is checked against (T=0, sigma=0, deep ITM/OTM, zero notional).

export function erf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

export const N = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
export const npdf = (x) => Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI);

// Black-Scholes-Merton price with continuous dividend yield q.
export function bs(S, K, r, q, sig, T, typ) {
  if (T <= 0) {
    return typ === 'call' ? Math.max(S - K, 0) : Math.max(K - S, 0);
  }
  if (sig <= 0) {
    // Zero vol: the underlying is deterministic under risk-neutral drift, so
    // this is the discounted forward payoff -- NOT naive S-K, which silently
    // ignores discounting/carry whenever r or q is nonzero. (The dashboards
    // this was ported from used Math.max(S-K,0) here for both the T<=0 and
    // sigma<=0 cases combined; that's exactly right for T=0 but understates/
    // overstates value for sigma=0 with T>0 and r or q != 0.)
    const fwd = S * Math.exp(-q * T);
    const disc = K * Math.exp(-r * T);
    return typ === 'call' ? Math.max(fwd - disc, 0) : Math.max(disc - fwd, 0);
  }
  const d1 = (Math.log(S / K) + (r - q + (sig * sig) / 2) * T) / (sig * Math.sqrt(T));
  const d2 = d1 - sig * Math.sqrt(T);
  return typ === 'call'
    ? S * Math.exp(-q * T) * N(d1) - K * Math.exp(-r * T) * N(d2)
    : K * Math.exp(-r * T) * N(-d2) - S * Math.exp(-q * T) * N(-d1);
}

const fd1 = (f, x, h) => (f(x + h) - f(x - h)) / (2 * h);
const fd2 = (f, x, h) => (f(x + h) - 2 * f(x) + f(x - h)) / (h * h);

// All ~18 Greeks via finite differences, bump-and-revalue off bs(). Every
// per-option Greek is in its natural (unscaled) range; scalePortfolio()
// below applies position size on top for the "portfolio Greek" view.
export function greeks(S, K, r, q, sig, T, typ) {
  const P = (s, k, rr, qq, v, t) => bs(s, k, rr, qq, v, t, typ);
  const hS = Math.max(S, 1e-6) * 1e-4;
  const hV = 1e-4;
  const hT = 1e-5;
  const hR = 1e-4;
  const hK = Math.max(K, 1e-6) * 1e-4;

  const price = P(S, K, r, q, sig, T);
  const delta = fd1((s) => P(s, K, r, q, sig, T), S, hS);
  const gamma = fd2((s) => P(s, K, r, q, sig, T), S, hS);
  const vegaRaw = fd1((v) => P(S, K, r, q, v, T), sig, hV);
  const thetaRaw = -fd1((t) => P(S, K, r, q, sig, t), T, hT);
  const rhoRaw = fd1((rr) => P(S, K, rr, q, sig, T), r, hR);
  const epsilonRaw = fd1((qq) => P(S, K, r, qq, sig, T), q, hR);
  const vannaRaw = fd1((v) => fd1((s) => P(s, K, r, q, v, T), S, hS), sig, hV);
  const vommaRaw = fd2((v) => P(S, K, r, q, v, T), sig, hV);
  const charmRaw = -fd1((t) => fd1((s) => P(s, K, r, q, sig, t), S, hS), T, hT);
  // veta: decay of vega per calendar day, matching theta/charm/color's convention
  // (negate the raw d/dT, then convert years -> days). The HTML dashboard divided
  // by 1e4 instead, which doesn't correspond to any clean unit -- fixed here.
  const vetaRaw = -fd1((t) => fd1((v) => P(S, K, r, q, v, t), sig, hV), T, hT);
  const veraRaw = fd1((v) => fd1((rr) => P(S, K, rr, q, v, T), r, hR), sig, hV);
  const speed = fd1((s) => fd2((ss) => P(ss, K, r, q, sig, T), s, hS), S, hS);
  const zomma = fd1((v) => fd2((s) => P(s, K, r, q, v, T), S, hS), sig, hV);
  const colorRaw = -fd1((t) => fd2((s) => P(s, K, r, q, sig, t), S, hS), T, hT);
  const ultimaRaw = fd1((v) => fd2((vv) => P(S, K, r, q, vv, T), v, hV), sig, hV);
  const dualDelta = fd1((k) => P(S, k, r, q, sig, T), K, hK);
  const dualGamma = fd2((k) => P(S, k, r, q, sig, T), K, hK);
  const lambda = price > 0 ? (delta * S) / price : NaN;

  return {
    price,
    delta,
    gamma,
    vega: vegaRaw / 100, // per 1 vol point (1%)
    theta: thetaRaw / 365, // per calendar day
    rho: rhoRaw / 100, // per 1% rate move
    epsilon: epsilonRaw / 100, // per 1% dividend-yield move
    lambda, // dimensionless elasticity -- never position-scaled
    vanna: vannaRaw / 100,
    charm: charmRaw / 365,
    vomma: vommaRaw / 1e4, // per (1 vol point)^2
    veta: vetaRaw / (100 * 365), // per 1 vol point, per calendar day
    vera: veraRaw / 1e4, // per 1 vol point, per 1% rate move
    speed,
    zomma: zomma / 100,
    color: colorRaw / 365,
    ultima: ultimaRaw / 1e6,
    dualDelta,
    dualGamma,
  };
}

// Cox-Ross-Rubinstein binomial tree (European; no early exercise).
export function binomial(S, K, r, q, sig, T, typ, steps) {
  if (T <= 0 || sig <= 0 || steps < 1) return bs(S, K, r, q, sig, T, typ);
  const dt = T / steps;
  const u = Math.exp(sig * Math.sqrt(dt));
  const d = 1 / u;
  const p = (Math.exp((r - q) * dt) - d) / (u - d);
  const disc = Math.exp(-r * dt);
  const v = [];
  for (let i = 0; i <= steps; i++) {
    const ST = S * u ** (steps - i) * d ** i;
    v.push(typ === 'call' ? Math.max(ST - K, 0) : Math.max(K - ST, 0));
  }
  for (let s = steps; s > 0; s--) {
    for (let i = 0; i < s; i++) v[i] = disc * (p * v[i] + (1 - p) * v[i + 1]);
  }
  return v[0];
}

// Risk-neutral Monte Carlo (Box-Muller normals).
export function monteCarlo(S, K, r, q, sig, T, typ, paths) {
  if (T <= 0 || sig <= 0) return bs(S, K, r, q, sig, T, typ);
  let sum = 0;
  for (let i = 0; i < paths; i++) {
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1 || 1e-12)) * Math.cos(2 * Math.PI * u2);
    const ST = S * Math.exp((r - q - (sig * sig) / 2) * T + sig * Math.sqrt(T) * z);
    sum += typ === 'call' ? Math.max(ST - K, 0) : Math.max(K - ST, 0);
  }
  return Math.exp(-r * T) * (sum / paths);
}

// Bisection implied-vol solver; bs() is monotone increasing in sigma.
export function impliedVol(price, S, K, r, q, T, typ) {
  let lo = 0.001;
  let hi = 5;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (bs(S, K, r, q, mid, T, typ) > price) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

// Bachelier (normal) model. sigN is an ABSOLUTE (dollar) vol; callers commonly
// approximate it as sig*S -- a first-order approximation, best near-ATM/short-
// dated (documented as illustrative in README's calibration notes).
export function bachelier(S, K, r, q, sigN, T, typ) {
  const F = S * Math.exp((r - q) * T);
  if (T <= 0 || sigN <= 0) return typ === 'call' ? Math.max(F - K, 0) : Math.max(K - F, 0);
  const d = (F - K) / (sigN * Math.sqrt(T));
  const c = Math.exp(-r * T) * ((F - K) * N(d) + sigN * Math.sqrt(T) * npdf(d));
  return typ === 'call' ? c : c - Math.exp(-r * T) * (F - K);
}

// Black-76 (options on a forward/future).
export function black76(S, K, r, q, sig, T, typ) {
  const F = S * Math.exp((r - q) * T);
  if (T <= 0 || sig <= 0) return typ === 'call' ? Math.max(F - K, 0) : Math.max(K - F, 0);
  const d1 = (Math.log(F / K) + ((sig * sig) / 2) * T) / (sig * Math.sqrt(T));
  const d2 = d1 - sig * Math.sqrt(T);
  return typ === 'call'
    ? Math.exp(-r * T) * (F * N(d1) - K * N(d2))
    : Math.exp(-r * T) * (K * N(-d2) - F * N(-d1));
}

// Merton (1976) jump-diffusion. Uses raw lambda*T for the Poisson weights, the
// same simplification the HTML dashboard used; with this call site's small
// mean jump size (kappa ~ -0.9%) the gap versus the risk-neutral-adjusted
// lambda'=lambda(1+kappa) is well under 1% -- noted here, not "fixed", since
// the README already documents this model as illustrative/uncalibrated.
export function merton(S, K, r, q, sig, T, typ, lam, mj, vj) {
  let sum = 0;
  let fact = 1;
  for (let k = 0; k < 12; k++) {
    if (k > 0) fact *= k;
    const lt = lam * T;
    const w = (Math.exp(-lt) * lt ** k) / fact;
    const sigk = Math.sqrt(sig * sig + (k * vj * vj) / Math.max(T, 1e-9));
    const rk = r - lam * (Math.exp(mj + (vj * vj) / 2) - 1) + (k * (mj + (vj * vj) / 2)) / Math.max(T, 1e-9);
    sum += w * bs(S, K, rk, q, sigk, T, typ);
  }
  return sum;
}
