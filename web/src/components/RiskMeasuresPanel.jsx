import React from 'react';
import Row, { SubHeading } from './Row.jsx';
import { fmt, sgn } from '../lib/format.js';

export default function RiskMeasuresPanel({ rm, maxDDDollar, calmarValue }) {
  return (
    <section className="panel">
      <p className="panel-title">
        Risk measures <span className="count">19 live</span>
      </p>
      <SubHeading>volatility</SubHeading>
      <Row label="Realized σ (per step)" value={`${fmt(rm.stp * 100, 3)}%`} />
      <Row label="Annualized σ" value={`${fmt(rm.ann * 100, 1)}%`} />
      <Row label="EWMA σ (ann.)" value={`${fmt(rm.ewma * 100, 1)}%`} />

      <SubHeading>value at risk · delta-adj notional</SubHeading>
      <Row label="VaR 95% param" value={fmt(rm.varP95, 2)} cls="neg" />
      <Row label="VaR 99% param" value={fmt(rm.varP99, 2)} cls="neg" />
      <Row label="VaR 99% historical" value={fmt(rm.varH99, 2)} cls="neg" />
      <Row label="VaR 99% Monte-Carlo" value={fmt(rm.varMC, 2)} cls="neg" />
      <Row label="VaR 99% Cornish-Fisher" value={fmt(rm.varCF, 2)} cls="neg" />
      <Row label="CVaR / ES 99%" value={fmt(rm.cvar, 2)} cls="neg" />

      <SubHeading>ratios &amp; shape</SubHeading>
      <Row label="Max drawdown" value={fmt(maxDDDollar, 2)} cls="neg" />
      <Row label="Sharpe (ann.)" value={fmt(rm.sharpe, 2)} cls={sgn(rm.sharpe)} />
      <Row label="Sortino" value={fmt(rm.sortino, 2)} cls={sgn(rm.sortino)} />
      <Row label="Calmar" value={fmt(calmarValue, 2)} cls={sgn(calmarValue)} />
      <Row label="Downside deviation" value={`${fmt(rm.dd * 100, 3)}%`} />
      <Row label="Semivariance" value={`${fmt(rm.semivar * 1e4, 3)}e-4`} />
      <Row label="Skewness" value={fmt(rm.sk, 3)} cls={sgn(rm.sk)} />
      <Row label="Excess kurtosis" value={fmt(rm.ku, 3)} />
      <Row label="Omega ratio" value={fmt(rm.omega, 2)} />
      <Row label="Tail ratio 95/5" value={fmt(rm.tailRatio, 2)} />
    </section>
  );
}
