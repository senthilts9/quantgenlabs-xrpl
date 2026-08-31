import React, { useEffect, useMemo, useRef, useState } from 'react';
import OptionControls from './OptionControls.jsx';
import GreeksPanel from './GreeksPanel.jsx';
import RiskMeasuresPanel from './RiskMeasuresPanel.jsx';
import QuantMethodsPanel from './QuantMethodsPanel.jsx';
import { greeks } from '../lib/quant.js';
import { riskMeasures, calmar } from '../lib/riskMeasures.js';
import { stepSpot, syntheticBook } from '../lib/marketFeed.js';

const DEFAULT_PARAMS = { K: 2.1, sig: 0.65, r: 0.04, q: 0.0, T: 0.25, typ: 'call', pos: 100, S: 2.1 };
const MAX_HISTORY = 250;
const TICK_MS = 750;
const SEED_TICKS = 40;

export default function RiskAnalyticsBoard() {
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [autoOn, setAutoOn] = useState(true);
  const [returns, setReturns] = useState([]);
  const [book, setBook] = useState(() => syntheticBook(DEFAULT_PARAMS.S));

  const prevSRef = useRef(null);
  const startSRef = useRef(null);
  const peakRef = useRef(0);
  const maxDDRef = useRef(0); // fractional, peak-to-trough of spot
  const [maxDDFraction, setMaxDDFraction] = useState(0);

  const numeric = useMemo(
    () => ({
      K: +params.K,
      sig: +params.sig,
      r: +params.r,
      q: +params.q,
      T: +params.T,
      typ: params.typ,
      pos: +params.pos,
      S: +params.S,
    }),
    [params]
  );

  function pushReturn(s) {
    if (startSRef.current == null) {
      startSRef.current = s;
      peakRef.current = s;
    }
    if (prevSRef.current != null && prevSRef.current !== s) {
      setReturns((prev) => {
        const next = [...prev, Math.log(s / prevSRef.current)];
        return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
      });
    }
    prevSRef.current = s;
    peakRef.current = Math.max(peakRef.current, s);
    maxDDRef.current = Math.max(maxDDRef.current, (peakRef.current - s) / peakRef.current);
    setMaxDDFraction(maxDDRef.current);
  }

  function applySpot(newS) {
    const rounded = Math.round(newS * 1e4) / 1e4;
    pushReturn(rounded);
    setBook(syntheticBook(rounded));
    setParams((p) => ({ ...p, S: rounded }));
  }

  // Seed a little history on mount so risk stats aren't all-zero on first paint.
  useEffect(() => {
    let s = DEFAULT_PARAMS.S;
    for (let i = 0; i < SEED_TICKS; i++) {
      s = stepSpot(s);
      pushReturn(Math.round(s * 1e4) / 1e4);
    }
    setParams((p) => ({ ...p, S: Math.round(s * 1e4) / 1e4 }));
    setBook(syntheticBook(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!autoOn) return undefined;
    const id = setInterval(() => {
      applySpot(stepSpot(+params.S));
    }, TICK_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOn, params.S]);

  const g = useMemo(
    () => greeks(numeric.S, numeric.K, numeric.r, numeric.q, numeric.sig, numeric.T, numeric.typ),
    [numeric]
  );
  const notional = numeric.pos * numeric.S * g.delta;
  const rm = useMemo(() => riskMeasures(returns, notional), [returns, notional]);
  const calmarValue = useMemo(() => calmar(returns, maxDDFraction), [returns, maxDDFraction]);
  const maxDDDollar = maxDDFraction * Math.abs(notional || 1);

  const spotChangePct = ((numeric.S / (startSRef.current || numeric.S) - 1) * 100).toFixed(2);

  return (
    <>
      <div className="masthead">
        <div>
          <span className="eyebrow">Live risk analytics — option overlay on XRP spot</span>
          <h1>XRPL Desk · Risk Analytics</h1>
        </div>
        <div className="spot-readout">
          <div className="eyebrow">XRP spot (RLUSD)</div>
          <div className="v">{numeric.S.toFixed(4)}</div>
          <div className={spotChangePct >= 0 ? 'pos' : 'neg'} style={{ fontSize: 12 }}>
            {spotChangePct >= 0 ? '+' : ''}
            {spotChangePct}% since open
          </div>
        </div>
      </div>

      <div className="banner">
        <b>Why an option overlay?</b> Greeks are sensitivities of an <b>option&apos;s</b> price —
        spot alone has none. So the board prices an option on XRP; a spot move cascades through
        ~18 Greeks (bump-and-revalue off Black-Scholes), ~19 risk measures, and 18 quant methods.
      </div>

      <OptionControls
        params={params}
        onChange={(next) => {
          if (+next.S !== numeric.S) {
            if (autoOn) setAutoOn(false);
            applySpot(+next.S);
          } else {
            setParams(next);
          }
        }}
        onShock={() => applySpot(numeric.S * 0.95)}
        autoOn={autoOn}
        onToggleAuto={() => setAutoOn((v) => !v)}
      />

      <div className="grid">
        <GreeksPanel g={g} position={numeric.pos} price={g.price} />
        <RiskMeasuresPanel rm={rm} maxDDDollar={maxDDDollar} calmarValue={calmarValue} />
        <QuantMethodsPanel
          S={numeric.S}
          K={numeric.K}
          r={numeric.r}
          q={numeric.q}
          sig={numeric.sig}
          T={numeric.T}
          typ={numeric.typ}
          book={book}
          returns={returns}
          startS={startSRef.current}
        />
      </div>
    </>
  );
}
