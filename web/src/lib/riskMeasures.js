// riskMeasures.js -- VaR/CVaR/ratio suite for the Risk Analytics board.
// Ported from risk-analytics-board.html with two corrections:
//   1. Downside deviation now divides by the TOTAL sample count (treating
//      up-periods as contributing 0), matching the standard Sortino-ratio
//      definition. The HTML version divided by the count of negative periods
//      only, which inflates downside deviation (and understates Sortino)
//      versus the textbook formula.
//   2. The dead `ulcer` stub (always computed as 0, never returned or
//      displayed) has been dropped rather than ported forward.
// LEDGERS_PER_YEAR matches sim_main.cpp/risk.hpp/risk.py's own ~4s-close
// assumption -- keep this in sync with the return series' actual per-tick
// cadence (see marketFeed.js) or the annualization is meaningless, which is
// exactly the bug that made Annualized sigma read 1017% before the shock-size
// fix in the underlying feed.
import { mean, std, quantile, skew, excessKurtosis } from './stats.js';

export const LEDGERS_PER_YEAR = 7.9e6;
const EWMA_LAMBDA = 0.94; // matches risk.hpp/risk.py's default

export function ewmaVariance(returns, lambda = EWMA_LAMBDA) {
  let v = 0;
  for (const x of returns) v = lambda * v + (1 - lambda) * x * x;
  return v;
}

export function riskMeasures(returns, notional) {
  const stp = std(returns);
  const ann = stp * Math.sqrt(LEDGERS_PER_YEAR);
  const ewma = Math.sqrt(ewmaVariance(returns) * LEDGERS_PER_YEAR);
  const m = mean(returns);
  const sk = skew(returns);
  const ku = excessKurtosis(returns);
  const absNotional = Math.abs(notional);

  const z99 = 2.326;
  const z95 = 1.645;
  const varP99 = absNotional * z99 * stp;
  const varP95 = absNotional * z95 * stp;
  const varH99 = absNotional * Math.abs(quantile(returns, 0.01));

  // Monte-Carlo VaR: resample from N(m, stp^2) via Box-Muller, take the 1st
  // percentile. A parametric-normal resampling, not a full historical MC --
  // fine for illustration, matches the HTML dashboard's own approach.
  const mcSample = [];
  for (let i = 0; i < 2000; i++) {
    const u1 = Math.random();
    const u2 = Math.random();
    mcSample.push(m + stp * Math.sqrt(-2 * Math.log(u1 || 1e-12)) * Math.cos(2 * Math.PI * u2));
  }
  const varMC = absNotional * Math.abs(quantile(mcSample, 0.01));

  // Cornish-Fisher expansion (standard formula):
  // z_cf = z + (z^2-1)S/6 + (z^3-3z)K/24 - (2z^3-5z)S^2/36
  const zcf =
    z99 +
    ((z99 * z99 - 1) * sk) / 6 +
    ((z99 ** 3 - 3 * z99) * ku) / 24 -
    ((2 * z99 ** 3 - 5 * z99) * sk * sk) / 36;
  const varCF = absNotional * zcf * stp;

  const thresh = quantile(returns, 0.01);
  const tail = returns.filter((x) => x <= thresh);
  const cvar = absNotional * Math.abs(tail.length ? mean(tail) : 0);

  // Downside deviation: sqrt(mean of min(0,r)^2) over the FULL sample.
  const downsideSq = returns.map((x) => (x < 0 ? x * x : 0));
  const dd = Math.sqrt(mean(downsideSq));

  const sharpe = stp ? (m / stp) * Math.sqrt(LEDGERS_PER_YEAR) : 0;
  const sortino = dd ? (m / dd) * Math.sqrt(LEDGERS_PER_YEAR) : 0;

  const gains = returns.filter((x) => x > 0).reduce((a, b) => a + b, 0);
  const losses = -returns.filter((x) => x < 0).reduce((a, b) => a + b, 0);
  const omega = losses ? gains / losses : 0;

  const q95 = Math.abs(quantile(returns, 0.95));
  const q05 = Math.abs(quantile(returns, 0.05));
  const tailRatio = q05 ? q95 / q05 : 0;

  return {
    stp,
    ann,
    ewma,
    varP95,
    varP99,
    varH99,
    varMC,
    varCF,
    cvar,
    sharpe,
    sortino,
    dd,
    semivar: dd * dd,
    sk,
    ku,
    omega,
    tailRatio,
  };
}

// maxDrawdown is tracked incrementally over a spot path (peak-to-trough,
// fractional) -- kept separate from riskMeasures() since it depends on path
// order, not just the return distribution. calmar needs a per-period mean
// return `m` and the current fractional maxDD; call sites compute
// `(mean(returns) * LEDGERS_PER_YEAR) / maxDD` directly. With only a handful
// of samples this ratio is extremely noisy (a tiny mean gets multiplied by
// ~7.9M) -- expected statistical behavior early in a run, not a bug.
export function calmar(returns, maxDD) {
  if (!maxDD) return 0;
  return (mean(returns) * LEDGERS_PER_YEAR) / maxDD;
}
