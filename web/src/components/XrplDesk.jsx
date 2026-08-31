import React, { useEffect, useMemo, useRef, useState } from 'react';
import OrderBookLadder from './OrderBookLadder.jsx';
import MicrostructurePanel from './MicrostructurePanel.jsx';
import InventoryRiskPanel from './InventoryRiskPanel.jsx';
import MarketMakingPanel from './MarketMakingPanel.jsx';
import MidInventoryChart from './MidInventoryChart.jsx';
import { OrderBook, Side } from '../lib/orderbook.js';
import { RiskEngine } from '../lib/riskEngine.js';
import { quote } from '../lib/marketMaking.js';
import { stepSpot } from '../lib/marketFeed.js';

const TICK_MS = 900;
const HISTORY_LEN = 120;
const LEVELS = 8;

// A fresh OrderBook/RiskEngine each mount; these are mutable engines wrapped
// in refs so React doesn't fight their internal state, with a render-trigger
// counter to re-render after each tick (same pattern the class-based engines
// elsewhere in this repo use -- see cpp/src/sim_main.cpp's consumer loop).
export default function XrplDesk() {
  const bookRef = useRef(new OrderBook());
  const riskRef = useRef(new RiskEngine());
  // Plain ref, not state: tick() is captured once by the mount-only useEffect
  // below, so reading simMid through a state closure would always see the
  // *initial* render's value (a classic stale-closure bug) -- a ref always
  // reads the current value regardless of when the closure was created.
  const simMidRef = useRef(2.1);
  const [, forceRender] = useState(0);
  const [gamma, setGamma] = useState(0.15);
  const [kappa, setKappa] = useState(1.5);
  const [horizon, setHorizon] = useState(1.0);
  const [history, setHistory] = useState([]);

  function tick() {
    const nextMid = stepSpot(simMidRef.current);
    simMidRef.current = nextMid;
    const book = bookRef.current;
    const half = nextMid * 0.0004;
    book.clear();
    for (let lvl = 0; lvl < LEVELS; lvl++) {
      const off = half + lvl * nextMid * 0.0003;
      book.upsert(Side.BID, +(nextMid - off).toFixed(6), 500 + Math.random() * 4500);
      book.upsert(Side.ASK, +(nextMid + off).toFixed(6), 500 + Math.random() * 4500);
    }
    if (Math.random() < 0.12) {
      const size = (Math.random() < 0.5 ? -1 : 1) * (1500 + Math.random() * 5000);
      const m = book.mid();
      if (m != null) riskRef.current.onFill(size, m);
    }
    const m = book.mid();
    const mp = book.microprice();
    if (m != null) riskRef.current.onMark(mp ?? m);
    setHistory((prev) => {
      const next = [...prev, { i: prev.length, mid: m, inventory: riskRef.current.xrp }];
      return next.length > HISTORY_LEN ? next.slice(next.length - HISTORY_LEN) : next;
    });
    forceRender((n) => n + 1);
  }

  useEffect(() => {
    const id = setInterval(tick, TICK_MS);
    tick(); // paint immediately instead of waiting one interval
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const book = bookRef.current;
  const risk = riskRef.current;
  const mid = book.mid();
  const mp = book.microprice();

  const mmQuote = useMemo(() => {
    if (mid == null) return { bid: null, ask: null, reservationPrice: null, inventorySkew: 0 };
    const sigma = Math.sqrt(risk.ewmaVar) || 0.0007;
    return quote(mp ?? mid, risk.xrp / 10000, sigma, gamma, kappa, horizon);
  }, [mid, mp, risk.xrp, risk.ewmaVar, gamma, kappa, horizon]);

  function fillAt(size) {
    if (mid == null) return;
    riskRef.current.onFill(size, mid);
    forceRender((n) => n + 1);
  }

  return (
    <>
      <div className="masthead">
        <div>
          <span className="eyebrow">Market-making terminal</span>
          <h1>XRPL Desk</h1>
        </div>
        <div className="status">
          <span className="dot live" />
          <span>simulated feed</span>
        </div>
      </div>

      <div className="banner">
        <b>Simulated</b> XRP/RLUSD book — this view always runs on a synthetic feed so it works
        offline and reproducibly. The live testnet ingester (<code>cpp/src/xrpl_ws_client.cpp</code>)
        is the C++/CLI counterpart to this UI, not wired into this browser view.
      </div>

      <div className="grid cols-2">
        <OrderBookLadder book={book} ourQuote={mmQuote} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <MicrostructurePanel book={book} />
          <InventoryRiskPanel risk={risk} mark={mp ?? mid} />
        </div>
      </div>

      <MarketMakingPanel
        gamma={gamma}
        kappa={kappa}
        horizon={horizon}
        onGamma={setGamma}
        onKappa={setKappa}
        onHorizon={setHorizon}
        mmQuote={mmQuote}
        mid={mid}
        onBuy={() => fillAt(8000)}
        onSell={() => fillAt(-8000)}
        onFlatten={() => fillAt(-risk.xrp)}
      />

      <MidInventoryChart history={history} />
    </>
  );
}
