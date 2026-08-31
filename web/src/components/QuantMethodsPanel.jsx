import React, { useMemo } from 'react';
import Row, { SubHeading } from './Row.jsx';
import { fmt, fmt0, sgn } from '../lib/format.js';
import { bs, binomial, monteCarlo, impliedVol, bachelier, black76, merton } from '../lib/quant.js';
import { hurst, autocorr, std } from '../lib/stats.js';

export default function QuantMethodsPanel({ S, K, r, q, sig, T, typ, book, returns, startS }) {
  const values = useMemo(() => {
    const bidBest = book.bids[0];
    const askBest = book.asks[0];
    const mid = (bidBest[0] + askBest[0]) / 2;
    const micro = (askBest[0] * bidBest[1] + bidBest[0] * askBest[1]) / (bidBest[1] + askBest[1]);
    const vb = book.bids.reduce((s, [, q2]) => s + q2, 0);
    const va = book.asks.reduce((s, [, q2]) => s + q2, 0);
    const imb = (vb - va) / (vb + va);
    const spread = ((askBest[0] - bidBest[0]) / mid) * 1e4;
    const depth = book.asks.filter(([p]) => p <= mid * 1.001).reduce((s, [, q2]) => s + q2, 0);
    const price = bs(S, K, r, q, sig, T, typ);
    const iv = impliedVol(price, S, K, r, q, T, typ);
    const rho0 = S / (startS || S);
    const il = ((2 * Math.sqrt(rho0)) / (1 + rho0) - 1) * 100;
    // Kyle's lambda / Amihud illiquidity: same simplified single-snapshot
    // proxies the HTML dashboard used (spread/depth for impact; realized-vol
    // per unit depth for Amihud) -- illustrative off a synthetic book, not
    // the full regression/time-averaged definitions. Documented in README.
    const kyleLambda = (spread / (2 * depth)) * 1e4;
    const amihud = (Math.abs(std(returns)) / (vb + va)) * 1e6;
    return { mid, micro, imb, spread, depth, price, iv, il, kyleLambda, amihud };
  }, [S, K, r, q, sig, T, typ, book, startS, returns]);

  return (
    <section className="panel">
      <p className="panel-title">
        Quant methods <span className="count">18 live</span>
      </p>
      <SubHeading>option pricing</SubHeading>
      <Row label="Black-Scholes call" value={fmt(bs(S, K, r, q, sig, T, 'call'), 4)} />
      <Row label="Black-Scholes put" value={fmt(bs(S, K, r, q, sig, T, 'put'), 4)} />
      <Row label="Binomial CRR" value={fmt(binomial(S, K, r, q, sig, T, typ, 60), 4)} unit="60 steps" />
      <Row label="Monte-Carlo" value={fmt(monteCarlo(S, K, r, q, sig, T, typ, 1500), 4)} unit="1.5k paths" />
      <Row label="Implied vol (solver)" value={`${fmt(values.iv * 100, 2)}%`} />
      <Row label="Bachelier (normal)" value={fmt(bachelier(S, K, r, q, sig * S, T, typ), 4)} />
      <Row label="Black-76 (futures)" value={fmt(black76(S, K, r, q, sig, T, typ), 4)} />
      <Row label="Merton jump-diff" value={fmt(merton(S, K, r, q, sig, T, typ, 0.5, -0.02, 0.15), 4)} />

      <SubHeading>microstructure</SubHeading>
      <Row label="Mid" value={fmt(values.mid, 4)} />
      <Row label="Microprice" value={fmt(values.micro, 4)} />
      <Row label="Imbalance" value={fmt(values.imb, 3)} cls={sgn(values.imb)} />
      <Row label="Spread" value={`${fmt(values.spread, 2)} bps`} />
      <Row label="Depth @10bps" value={`${fmt0(values.depth)} XRP`} />
      <Row label="Kyle's λ (impact)" value={fmt(values.kyleLambda, 4)} />
      <Row label="Amihud illiq." value={fmt(values.amihud, 4)} />

      <SubHeading>time-series &amp; AMM</SubHeading>
      <Row label="Realized variance" value={`${fmt(returns.reduce((s, x) => s + x * x, 0) * 1e4, 3)}e-4`} />
      <Row label="Autocorr lag-1" value={fmt(autocorr(returns), 3)} />
      <Row label="Hurst exponent" value={fmt(hurst(returns), 3)} />
      <Row label="Breakeven move σ√T" value={`${fmt(sig * Math.sqrt(T) * 100, 2)}%`} />
      <Row label="AMM price (x·y=k)" value={fmt(values.mid, 4)} />
      <Row label="Impermanent loss" value={`${fmt(values.il, 3)}%`} cls={values.il < 0 ? 'neg' : ''} />
    </section>
  );
}
