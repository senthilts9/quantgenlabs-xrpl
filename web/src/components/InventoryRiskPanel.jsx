import React from 'react';
import Row from './Row.jsx';
import { fmt0 } from '../lib/format.js';
import { sgn } from '../lib/format.js';

export default function InventoryRiskPanel({ risk, mark }) {
  const exposure = risk.exposure(mark || 0);
  const pnl = risk.unrealizedPnl(mark || 0);
  return (
    <section className="panel">
      <p className="panel-title">
        Inventory &amp; risk <span className="count">XRP leg</span>
      </p>
      <Row label="Inventory" value={`${fmt0(risk.xrp)} XRP`} cls={sgn(risk.xrp)} />
      <Row label="Exposure" value={fmt0(exposure)} />
      <Row label="Unrealized PnL" value={fmt0(pnl)} cls={sgn(pnl)} />
      <Row label="Vol (ann.)" value={`${(risk.volAnnualized() * 100).toFixed(1)}%`} />
      <Row label="VaR 99% (param)" value={fmt0(risk.parametricVar(mark || 0))} />
      <Row label="CVaR 99% (ES)" value={fmt0(risk.cvar(mark || 0))} />
      <Row label="Max drawdown" value={fmt0(risk.maxDD)} />
    </section>
  );
}
