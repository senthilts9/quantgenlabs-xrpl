# qgl-xrpl web — React console

A React port of `dashboards/xrpl-desk.html` and `dashboards/risk-analytics-board.html`,
styled to match `genai-risk-dashboard`'s frontend (same design tokens, same Vite/React
conventions — same author's other project). Two tabs: **Risk Analytics Board**
(Black-Scholes Greeks, VaR/CVaR suite, quant-method comparisons) and **XRPL Desk**
(live order-book ladder, inventory risk, Avellaneda-Stoikov quoting).

## Why a rewrite, not just an embed

The original HTML files are self-contained and still work standalone — nothing here
replaces them. This exists because a proper component architecture makes the same
math easier to keep correct: `src/lib/` holds every formula as a plain, dependency-free
function (Black-Scholes/Greeks, the VaR/CVaR/ratio suite, the order book, the XRP-leg
risk engine, Avellaneda-Stoikov), independent of any UI framework and directly
unit-tested — see `scripts/selftest.mjs`. The React components in `src/components/`
are thin renderers over that layer, not where the math lives.

**Two real bugs were caught and fixed during this port** by that self-test battery
(neither was visible just from eyeballing the HTML dashboards):

1. `bs()` at zero volatility returned naive `max(S-K, 0)` instead of the correct
   discounted-forward payoff `max(S·e^-qT − K·e^-rT, 0)` — wrong whenever `r` or `q`
   is nonzero. Both the original HTML and the first draft of this port had this;
   `scripts/selftest.mjs` has a regression test for it now.
2. A stale-closure bug in `XrplDesk.jsx`'s tick loop would have frozen the simulated
   spot price after the very first tick (reading React state through a closure
   captured once by a mount-only effect). Fixed by using a ref instead.

Also carried forward from the earlier HTML-level review: the vol-calibration bug
(spot shock 5-7.5x too large, inflating Annualized σ to >1000%) and the Greeks
position-scaling label ambiguity are both fixed at the source here — every dashboard
now imports the same `lib/marketFeed.js` shock constant, so that drift can't recur.

## Run it

```bash
cd web
npm install
npm run dev       # http://localhost:5174
npm run selftest  # 82 edge-case checks against lib/ -- no browser needed
npm run build      # production bundle -> dist/
```

**Not verified in the environment this was built in** — that machine has no
`node`/`npm` installed at all, so `npm install`, `vite dev`, and `vite build` have
never actually run. What *was* verified there: every formula in `src/lib/` was
tested via a hand-bundled, import-stripped copy of the same test file run through
`osascript -l JavaScript` (macOS's built-in JavaScriptCore), and every file passed a
brace/paren balance check plus an import/export cross-reference. That's real
coverage of the math; it is not a substitute for `npm install && npm run build`
succeeding, which needs to happen at least once before you rely on this for a demo.

## Layout

```
web/
  src/
    lib/            # pure functions/classes -- the actual math, framework-agnostic
      quant.js        Black-Scholes, all ~18 Greeks, binomial/MC/Bachelier/Black-76/Merton
      stats.js         mean/std/quantile/skew/kurtosis/autocorr/Hurst
      riskMeasures.js  VaR/CVaR/Cornish-Fisher/Sharpe/Sortino/Calmar/Omega/tail ratio
      orderbook.js     OrderBook class (mid/microprice/imbalance/depth/simulateFill)
      riskEngine.js    RiskEngine class (XRP-leg inventory VaR/CVaR/drawdown)
      marketMaking.js  Avellaneda-Stoikov quote()
      marketFeed.js    shared synthetic spot-shock + book generator
      format.js        display formatting helpers
    components/      # thin renderers over lib/, one per panel
    App.jsx          # tab switcher between the two boards
  scripts/
    selftest.mjs     # edge-case battery: T=0, sigma=0, empty/short return arrays,
                      # deep ITM/OTM, negative rates, put-call parity, empty order
                      # book, degenerate Avellaneda-Stoikov params, etc.
```
