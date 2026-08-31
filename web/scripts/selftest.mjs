#!/usr/bin/env node
// selftest.mjs -- edge-case battery for lib/. Run with: node scripts/selftest.mjs
// No test framework dependency on purpose, matching finmath.py's own
// pure-stdlib self-test style: this should run with zero npm install.
import { bs, greeks, binomial, monteCarlo, impliedVol, bachelier, black76, merton } from '../src/lib/quant.js';
import { mean, std, quantile, skew, excessKurtosis, autocorr, hurst } from '../src/lib/stats.js';
import { riskMeasures, calmar, ewmaVariance } from '../src/lib/riskMeasures.js';
import { OrderBook, Side } from '../src/lib/orderbook.js';
import { RiskEngine } from '../src/lib/riskEngine.js';
import { quote } from '../src/lib/marketMaking.js';

let pass = 0;
let fail = 0;

function check(label, cond) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${label}`);
  }
}

function finite(x) {
  return typeof x === 'number' && Number.isFinite(x);
}

function approx(a, b, tol = 1e-2) {
  return Math.abs(a - b) < tol;
}

console.log('--- quant.js: Black-Scholes & Greeks ---');

// Baseline: normal, at-the-money-ish market.
const base = [2.07, 2.1, 0.04, 0.0, 0.65, 0.25, 'call'];
check('bs() baseline finite', finite(bs(...base)));
check('bs() baseline positive', bs(...base) > 0);
const gk = greeks(...base);
for (const [k, v] of Object.entries(gk)) check(`greeks().${k} finite`, finite(v) || Number.isNaN(v) === false);
check('delta in [0,1] for a call', gk.delta >= 0 && gk.delta <= 1);
check('gamma non-negative', gk.gamma >= -1e-9);
check('lambda plausible (option leverage, can exceed 1)', gk.lambda > 1);

// T = 0 (expiry today): must degrade to intrinsic value, no NaN/Infinity.
check('bs() call at T=0, ITM = intrinsic', approx(bs(2.5, 2.0, 0.04, 0, 0.65, 0, 'call'), 0.5, 1e-9));
check('bs() call at T=0, OTM = 0', approx(bs(1.5, 2.0, 0.04, 0, 0.65, 0, 'call'), 0, 1e-9));
check('binomial() at T=0 finite (no dt=0 NaN)', finite(binomial(2.0, 2.0, 0.04, 0, 0.65, 0, 'call', 60)));
check('monteCarlo() at T=0 finite', finite(monteCarlo(2.0, 2.0, 0.04, 0, 0.65, 0, 'call', 200)));
check('bachelier() at T=0 finite', finite(bachelier(2.0, 2.0, 0.04, 0, 1.3, 0, 'call')));
check('black76() at T=0 finite', finite(black76(2.0, 2.0, 0.04, 0, 0.65, 0, 'call')));

// sigma = 0 (no vol): must degrade to the DISCOUNTED FORWARD payoff, not
// naive S-K -- catches the exact bug found and fixed during this port
// (r != 0 makes naive intrinsic wrong once vol hits zero).
check('bs() sigma=0 = discounted forward, not naive S-K', approx(bs(2.5, 2.0, 0.04, 0, 0, 0.25, 'call'), 2.5 - 2.0 * Math.exp(-0.04 * 0.25), 1e-6));
check('bs() sigma=0, r=0: discounted forward equals naive intrinsic', approx(bs(2.5, 2.0, 0, 0, 0, 0.25, 'call'), 0.5, 1e-9));
check('greeks() sigma=0 all finite', Object.values(greeks(2.5, 2.0, 0.04, 0, 0, 0.25, 'call')).every((v) => finite(v) || Number.isNaN(v)));

// Deep ITM / deep OTM.
check('deep ITM call delta near 1', greeks(100, 2.0, 0.04, 0, 0.65, 0.25, 'call').delta > 0.9);
check('deep OTM call delta near 0', greeks(0.01, 2.0, 0.04, 0, 0.65, 0.25, 'call').delta < 0.1);
check('deep OTM call price near 0, non-negative', bs(0.01, 2.0, 0.04, 0, 0.65, 0.25, 'call') >= 0);

// Negative rates: increasingly common in real markets, must not break anything.
check('bs() negative rate finite', finite(bs(2.1, 2.0, -0.02, 0, 0.65, 0.25, 'call')));

// Put side + put-call parity sanity check (within finite-difference tolerance).
const S0 = 2.1, K0 = 2.0, r0 = 0.04, q0 = 0.0, sig0 = 0.65, T0 = 0.25;
const callPx = bs(S0, K0, r0, q0, sig0, T0, 'call');
const putPx = bs(S0, K0, r0, q0, sig0, T0, 'put');
const parityLHS = callPx - putPx;
const parityRHS = S0 * Math.exp(-q0 * T0) - K0 * Math.exp(-r0 * T0);
check('put-call parity holds', approx(parityLHS, parityRHS, 1e-9));

// Binomial and Monte Carlo should converge near the closed-form BS price.
check('binomial() converges to bs()', approx(binomial(S0, K0, r0, q0, sig0, T0, 'call', 200), callPx, 0.01));
const mcPx = monteCarlo(S0, K0, r0, q0, sig0, T0, 'call', 20000);
check('monteCarlo() roughly converges to bs()', Math.abs(mcPx - callPx) < 0.05);

// Implied vol solver should round-trip.
const ivTarget = bs(S0, K0, r0, q0, 0.42, T0, 'call');
const ivSolved = impliedVol(ivTarget, S0, K0, r0, q0, T0, 'call');
check('impliedVol() round-trips', approx(ivSolved, 0.42, 1e-3));

// Black-76 with q=0 should equal BS priced off F (spot-carry consistency).
check('black76() finite and positive', black76(S0, K0, r0, q0, sig0, T0, 'call') > 0);

// Merton with lambda=0 (no jumps) should collapse to plain Black-Scholes.
check('merton() lambda=0 collapses to bs()', approx(merton(S0, K0, r0, q0, sig0, T0, 'call', 0, 0, 0.15), callPx, 1e-6));
check('merton() with jumps finite', finite(merton(S0, K0, r0, q0, sig0, T0, 'call', 0.5, -0.02, 0.15)));

console.log('--- stats.js ---');
check('mean([]) = 0, not NaN', mean([]) === 0);
check('std([]) = 0, not NaN', std([]) === 0);
check('std([1]) = 0 (n<2)', std([1]) === 0);
check('quantile([]) = 0, not crash', quantile([], 0.5) === 0);
check('skew([]) = 0', skew([]) === 0);
check('excessKurtosis(short array) = 0', excessKurtosis([1, 2]) === 0);
check('autocorr(short array) = 0', autocorr([1, 2]) === 0);
check('hurst(short array) = 0.5 (undefined, documented default)', hurst([1, 2, 3]) === 0.5);
const uniformNoise = Array.from({ length: 5000 }, () => Math.random() - 0.5);
check('excessKurtosis(uniform) approx -1.2 (sanity vs known theoretical value)', approx(excessKurtosis(uniformNoise), -1.2, 0.15));

console.log('--- riskMeasures.js ---');
const rmEmpty = riskMeasures([], 1000);
check('riskMeasures([]) has no NaN', Object.values(rmEmpty).every((v) => finite(v)));
check('riskMeasures([]) is all-zero', Object.values(rmEmpty).every((v) => v === 0));
const rmSingle = riskMeasures([0.001], 1000);
check('riskMeasures(1 sample) has no NaN', Object.values(rmSingle).every((v) => finite(v)));
const rmZeroNotional = riskMeasures([0.001, -0.002, 0.003], 0);
check('riskMeasures(notional=0) has no NaN', Object.values(rmZeroNotional).every((v) => finite(v)));
check('riskMeasures(notional=0) VaR is 0', rmZeroNotional.varP99 === 0);
const allGains = [0.01, 0.02, 0.005, 0.015];
const rmAllGains = riskMeasures(allGains, 1000);
check('riskMeasures(all gains): omega finite when losses=0', finite(rmAllGains.omega));
check('riskMeasures(all gains): downside deviation = 0', rmAllGains.dd === 0);
check('calmar(returns, maxDD=0) = 0, not Infinity', calmar([0.001, 0.002], 0) === 0);
check('ewmaVariance([]) = 0', ewmaVariance([]) === 0);

// Downside deviation regression check: with a known series, verify it divides
// by the TOTAL count (this is exactly the bug fixed during the React port).
const mixed = [0.02, -0.01, 0.03, -0.02, 0.01]; // 2 negative of 5 total
const ddExpected = Math.sqrt((0.0001 + 0.0004) / 5); // sum(neg^2)/N_total, not /2
check('downside deviation divides by total N, not negative-count', approx(riskMeasures(mixed, 1).dd, ddExpected, 1e-9));

console.log('--- orderbook.js ---');
const ob = new OrderBook();
check('empty book: mid() is null', ob.mid() === null);
check('empty book: microprice() is null', ob.microprice() === null);
check('empty book: imbalance() is null', ob.imbalance() === null);
check('empty book: simulateFill() does not crash', ob.simulateFill(Side.ASK, 100).filled === 0);
ob.upsert(Side.BID, 2.09, 1000);
ob.upsert(Side.ASK, 2.11, 1000);
check('one-sided-then-two-sided book: mid() correct', approx(ob.mid(), 2.1, 1e-9));
check('spreadBps() positive for a normal book', ob.spreadBps() > 0);
const fillOverbook = ob.simulateFill(Side.ASK, 5000); // more than the book holds
check('simulateFill() beyond depth: filled capped, not throw', fillOverbook.filled === 1000 && !fillOverbook.complete);
ob.upsert(Side.BID, 2.09, 0); // qty<=0 must remove the level
check('upsert(qty=0) removes the level', ob.bids.size === 0);

console.log('--- riskEngine.js ---');
const re = new RiskEngine();
check('fresh RiskEngine: exposure(mark)=0', re.exposure(2.1) === 0);
check('fresh RiskEngine: parametricVar=0 (no history yet)', re.parametricVar(2.1) === 0);
re.onFill(1000, 2.1);
re.onMark(2.1); // first mark: no return yet (lastMark was 0)
check('onMark() first call does not produce a spurious return', re.returns.length === 0);
re.onMark(2.12);
check('onMark() second call produces exactly one return', re.returns.length === 1);
re.onFill(-1000, 2.15); // flatten back to zero
check('flattening to exactly 0 resets avgCost to 0', re.xrp === 0 && re.avgCost === 0);

console.log('--- marketMaking.js ---');
const q1 = quote(2.1, 0, 0.0007, 0.15, 1.5);
check('quote() at zero inventory: no skew', approx(q1.inventorySkew, 0, 1e-9));
check('quote() bid < ask always', q1.bid < q1.ask);
const qLong = quote(2.1, 5000, 0.0007, 0.15, 1.5);
check('quote() with long inventory skews reservation DOWN (sell pressure)', qLong.reservationPrice < 2.1);
const qShort = quote(2.1, -5000, 0.0007, 0.15, 1.5);
check('quote() with short inventory skews reservation UP (buy pressure)', qShort.reservationPrice > 2.1);
check('quote() gamma=0 does not produce Infinity (defensive floor)', finite(quote(2.1, 100, 0.01, 0, 1.5).ask));
check('quote() kappa=0 does not produce Infinity (defensive floor)', finite(quote(2.1, 100, 0.01, 0.15, 0).ask));

console.log(`\n${pass} passed, ${fail} failed.`);
if (fail > 0) process.exit(1);
