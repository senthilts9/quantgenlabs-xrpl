import React from 'react';
import Row, { SubHeading } from './Row.jsx';
import { fmt, fmt0 } from '../lib/format.js';
import { Side } from '../lib/orderbook.js';

export default function MicrostructurePanel({ book }) {
  const mid = book.mid();
  const micro = book.microprice();
  const spreadBps = book.spreadBps();
  const depth10 = book.depthWithinBps(10, Side.ASK);
  const imb = book.imbalance();

  return (
    <section className="panel">
      <p className="panel-title">Microstructure</p>
      <Row label="Mid" value={fmt(mid)} />
      <Row label="Microprice" value={fmt(micro)} />
      <Row label="Spread" value={mid != null ? `${fmt(spreadBps, 2)} bps` : '—'} />
      <Row label="Depth ±10bps" value={depth10 != null ? `${fmt0(depth10)} XRP` : '—'} />
      <SubHeading>order-book imbalance (top 5)</SubHeading>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="eyebrow">−1 ask-heavy · +1 bid-heavy</span>
        <span className={imb >= 0 ? 'pos' : 'neg'} style={{ fontFamily: 'var(--font-data)' }}>
          {imb != null ? `${imb >= 0 ? '+' : ''}${fmt(imb, 3)}` : '—'}
        </span>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: 'rgba(255,255,255,0.05)',
          marginTop: 8,
          overflow: 'hidden',
          border: '1px solid var(--panel-border)',
        }}
      >
        <div
          style={{
            width: `${(((imb ?? 0) + 1) / 2) * 100}%`,
            height: '100%',
            background: 'linear-gradient(90deg,var(--crit),var(--dim),var(--safe))',
          }}
        />
      </div>
    </section>
  );
}
