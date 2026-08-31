import React from 'react';
import { fmt } from '../lib/format.js';

export default function MarketMakingPanel({ gamma, kappa, horizon, onGamma, onKappa, onHorizon, mmQuote, mid, onBuy, onSell, onFlatten }) {
  const denom = mmQuote.reservationPrice || mid || 1;
  return (
    <section className="panel" style={{ marginTop: 16 }}>
      <p className="panel-title">
        Optimal quoting — Avellaneda-Stoikov <span className="count" style={{ color: 'var(--muted)' }}>reservation skews with inventory</span>
      </p>
      <div className="grid cols-2" style={{ marginTop: 0, alignItems: 'center' }}>
        <div>
          <label style={{ display: 'block', color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>
            Risk aversion γ <span style={{ float: 'right', fontWeight: 600, color: 'var(--text)' }}>{gamma.toFixed(2)}</span>
          </label>
          <input type="range" min="0.02" max="0.6" step="0.01" value={gamma} onChange={(e) => onGamma(+e.target.value)} style={{ width: '100%', marginBottom: 14 }} />
          <label style={{ display: 'block', color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>
            Book liquidity κ <span style={{ float: 'right', fontWeight: 600, color: 'var(--text)' }}>{kappa.toFixed(1)}</span>
          </label>
          <input type="range" min="0.3" max="4" step="0.1" value={kappa} onChange={(e) => onKappa(+e.target.value)} style={{ width: '100%', marginBottom: 14 }} />
          <label style={{ display: 'block', color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>
            Horizon (T−t) <span style={{ float: 'right', fontWeight: 600, color: 'var(--text)' }}>{horizon.toFixed(2)}</span>
          </label>
          <input type="range" min="0.1" max="1" step="0.05" value={horizon} onChange={(e) => onHorizon(+e.target.value)} style={{ width: '100%' }} />
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={onBuy}>Get lifted (+8k XRP)</button>
            <button className="btn" onClick={onSell}>Get hit (−8k XRP)</button>
            <button className="btn" onClick={onFlatten}>Flatten</button>
          </div>
        </div>
        <div>
          <div className="quote-box">
            <div className="q bid">
              <div className="lab">Our bid</div>
              <div className="p">{fmt(mmQuote.bid)}</div>
            </div>
            <div className="q ask">
              <div className="lab">Our ask</div>
              <div className="p">{fmt(mmQuote.ask)}</div>
            </div>
          </div>
          <div className="eyebrow" style={{ marginTop: 10, textAlign: 'center' }}>
            reservation <span className="gold">{fmt(mmQuote.reservationPrice)}</span> · skew{' '}
            <span className="gold">{fmt((mmQuote.inventorySkew / denom) * 1e4, 1)} bps</span> vs mid · model spread{' '}
            <span className="gold">{fmt(((mmQuote.ask - mmQuote.bid) / denom) * 1e4, 1)} bps</span>
          </div>
        </div>
      </div>
    </section>
  );
}
