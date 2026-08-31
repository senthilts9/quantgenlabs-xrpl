import React from 'react';
import { fmt, fmt0 } from '../lib/format.js';

// Renders a live OrderBook instance: asks descending (best ask nearest mid),
// mid row, then bids descending. Mirrors xrpl-desk.html's ladder markup.
export default function OrderBookLadder({ book, ourQuote }) {
  const asks = book.sortedAsks().slice(0, 8).reverse();
  const bids = book.sortedBids().slice(0, 8);
  const mid = book.mid();
  const micro = book.microprice();
  const spreadBps = book.spreadBps();
  const maxSz = Math.max(1, ...asks.map(([, s]) => s), ...bids.map(([, s]) => s));

  let cum = 0;
  const askRows = asks.map(([p, s]) => {
    cum += s;
    const w = ((s / maxSz) * 100).toFixed(0);
    const hit = ourQuote && mid != null && Math.abs(p - ourQuote.ask) < mid * 0.0002;
    return (
      <div className="ladder-row ask" key={`a${p}`}>
        <span className="bar" style={{ width: `${w}%` }} />
        <span className="px">
          {fmt(p)}
          {hit && <span className="gold"> ← ask</span>}
        </span>
        <span className="sz">{fmt0(s)}</span>
        <span className="cum">{fmt0(cum)}</span>
      </div>
    );
  });

  cum = 0;
  const bidRows = bids.map(([p, s]) => {
    cum += s;
    const w = ((s / maxSz) * 100).toFixed(0);
    const hit = ourQuote && mid != null && Math.abs(p - ourQuote.bid) < mid * 0.0002;
    return (
      <div className="ladder-row bid" key={`b${p}`}>
        <span className="bar" style={{ width: `${w}%` }} />
        <span className="px">
          {fmt(p)}
          {hit && <span className="gold"> ← bid</span>}
        </span>
        <span className="sz">{fmt0(s)}</span>
        <span className="cum">{fmt0(cum)}</span>
      </div>
    );
  });

  return (
    <section className="panel">
      <p className="panel-title">
        Order book <span className="count">XRP / RLUSD</span>
      </p>
      <div className="ladder">
        {askRows}
        <div className="mid-row">
          <span className="m">{fmt(mid)}</span>
          <span className="eyebrow">
            micro {fmt(micro)} · spread {mid != null ? fmt(spreadBps, 2) : '—'} bps
          </span>
        </div>
        {bidRows}
      </div>
    </section>
  );
}
