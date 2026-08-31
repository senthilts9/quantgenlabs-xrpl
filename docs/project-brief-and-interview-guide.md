# Quant Risk Analytics Platform — project brief & interview guide

*A structured way to explain your current project to a Head of Quant, plus the
model catalog to draw on when probed, and the bridge to the XRPL/crypto demo.*

> **Ground this in what you actually did.** Use this as a scaffold and replace
> the generic parts with your real numbers, instruments, and responsibilities.
> A Head of Quant will probe, so every claim you make should be one you can
> defend from experience. Cut anything you can't speak to.

---

## 1 · The 60-second version (say this first)

> "I work on a quant data-analytics and research platform for risk and pricing.
> The heavy compute — valuation and risk kernels — is a **low-latency C++**
> library; the **research and orchestration layer is Python**, in **Jupyter**
> and **Databricks**, with the C++ core exposed to Python through bindings so
> researchers use the same models the production engine uses. Market data,
> trades, and reference data are ingested through Databricks pipelines, priced
> and risked by the C++ engine, and the results are written to a **local
> application database (DataBank)**, with a **replicated copy pushed to our
> central referential database, Capsion DB**, which is the firm's golden
> source. On top of that sit **dashboards monitoring credit, operational, and
> liquidity risk**, and **scheduled batch jobs** for end-of-day PnL, overnight
> VaR, and stress runs. Part of my role is **leading and mentoring the team** —
> code review on the C++ side and bringing analysts up to speed in Python."

That paragraph maps 1:1 to the five stages in `platform-architecture.mermaid`.

---

## 2 · Architecture & data flow

Five stages (see the diagram):

1. **Sources** — market data (prices, curves, vol surfaces, ratings), trades &
   positions, and reference data (instruments, counterparties).
2. **Ingestion & research (Python)** — Databricks/Spark ETL pipelines land and
   clean data; Jupyter notebooks are where research, calibration, and
   backtesting happen.
3. **Compute core** — the **C++ low-latency engine** runs the valuation and
   risk kernels; **pybind11 bindings** make those same kernels callable from
   Python, so research and production share one codebase. Pricing models and
   risk models are modules on top of the core.
4. **Storage** — results write first to **DataBank**, the local application DB
   (fast operational store for the app and dashboards); a **replicated copy
   goes to Capsion DB**, the central referential / golden-source database the
   rest of the firm reconciles and reports against.
5. **Monitoring & reporting** — risk dashboards (credit / operational /
   liquidity), scheduled batch jobs (EOD, overnight VaR, stress), and
   regulatory / management reporting read from those databases.

**Why two databases?** The local DB is optimised for the app's own reads and
low-latency dashboard refresh; the central referential DB is the authoritative,
firm-wide copy — one golden source everyone reconciles to, which is what keeps
risk numbers consistent across desks and reports.

---

## 3 · Day-to-day tasks (the deep-level detail)

**Engineering / low-latency C++**
- Build and maintain the pricing & risk kernels: valuation, Greeks/sensitivities,
  curve and surface construction, Monte Carlo engines.
- Profile and optimise hot paths: cache-friendly data layout, avoiding
  allocation on the critical path, vectorisation, lock-free hand-offs between
  ingestion and compute threads.
- Own the `pybind11` layer so the research team calls the exact production code.

**Research / Python**
- Prototype new models in Python/Jupyter, calibrate to market data, then
  productionise the validated version in C++.
- Backtest risk models (VaR exception testing) and pricing models (P&L
  attribution, model-vs-market).
- Run analyses on Databricks/Spark when the data is too big for a single node.

**Batch / operations**
- Own the scheduled batch jobs: end-of-day revaluation and PnL, overnight VaR
  and Expected Shortfall, weekend stress and scenario runs.
- Reconcile DataBank against Capsion DB; investigate breaks.

**Risk monitoring**
- Maintain the credit / operational / liquidity dashboards; wire up limit
  breaches and alerts.

**Leadership**
- Code review, mentoring on C++ low-latency patterns and Python best practice,
  onboarding, and knowledge transfer across the team.

---

## 4 · Risk model catalog (draw on these when probed)

| Domain | Models / measures |
|---|---|
| **Market risk** | Parametric (variance-covariance) VaR · Historical-simulation VaR · Monte-Carlo VaR · Expected Shortfall (CVaR) · Stressed VaR · Incremental / marginal / component VaR · Greeks & sensitivities (delta, gamma, vega, theta, rho, DV01/PV01, CS01) · VaR backtesting (Kupiec POF, Christoffersen) |
| **Credit risk** | PD (logistic scorecards, Merton structural, reduced-form / hazard-rate) · LGD · EAD · Expected Loss = PD×LGD×EAD · Credit VaR (CreditMetrics, CreditRisk+) · rating transition / migration matrices · concentration (Herfindahl) |
| **Counterparty (XVA)** | CVA · DVA · FVA · MVA · Potential Future Exposure (PFE) · Expected Positive / Negative Exposure (EPE/ENE) — Monte-Carlo exposure simulation |
| **Liquidity risk** | Liquidity Coverage Ratio (LCR) · Net Stable Funding Ratio (NSFR) · Liquidity-adjusted VaR (LVaR) · bid-ask / market-impact cost · cash-flow gap & maturity-ladder analysis · funding vs market liquidity |
| **Operational risk** | Loss Distribution Approach (frequency Poisson × severity lognormal) · Operational VaR · Key Risk Indicators (KRIs) · Risk & Control Self-Assessment (RCSA) · scenario analysis |

*You won't have built all of these — highlight the handful you actually own and
treat the rest as vocabulary you recognise.*

---

## 5 · Pricing model catalog

| Asset class | Models |
|---|---|
| **Rates / FX** | Multi-curve bootstrapping & OIS discounting · Black-76 (caps/floors, swaptions) · short-rate models (Hull-White, Vasicek, CIR, Ho-Lee) · SABR (vol smile) · term-rate / market models |
| **Equity / vol** | Black-Scholes-Merton · binomial / trinomial trees · Monte-Carlo · local vol (Dupire) · stochastic vol (Heston) · jump-diffusion (Merton) |
| **Fixed income** | Bond pricing, YTM, duration & convexity · Nelson-Siegel-Svensson curve fitting |
| **Credit derivatives** | CDS pricing via survival-curve / hazard-rate bootstrapping · Gaussian copula for baskets / tranches |
| **XVA** | CVA/DVA/FVA/MVA engines over simulated exposure paths |

---

## 6 · The dashboards (credit / operational / liquidity)

Each dashboard reads from DataBank (live) and Capsion DB (reconciled), and shows:
- **Credit** — exposure by counterparty & rating, PFE profiles, CVA, limit
  utilisation, concentration.
- **Operational** — loss events, KRIs vs thresholds, OpVaR trend, control
  breaches.
- **Liquidity** — LCR / NSFR, cash-flow ladder, LVaR, funding gaps, market-depth
  cost.

Emphasise the *monitoring* angle: real-time limit breaches and alerts, not just
end-of-day reports.

---

## 7 · The crypto bridge (how the same platform maps to XRPL)

This is where you connect your current work to Ripple. **Same architecture,
different venue:**

| Your platform | XRPL / Ripple Prime version |
|---|---|
| C++ low-latency valuation & risk kernels | C++ order-book + risk engine on the XRPL DEX (the project you built) |
| Python/Jupiter research over C++ bindings | `xrpl-py` research layer; same prototype→productionise flow |
| Market / credit / liquidity risk models | Inventory VaR/CVaR on the XRP leg, settlement-window exposure, RLUSD peg/basis, AMM liquidity |
| Pricing models | Avellaneda-Stoikov optimal quoting, AMM (constant-product) pricing, impermanent-loss |
| Dashboards | The live XRPL market-making terminal you built |
| Golden-source referential DB | On-ledger settlement as the shared source of truth |

Key line to land: *"the difference is settlement physics — XRPL settles at
ledger close (~3–4s), so inventory carried across that window becomes a first-class
risk term, which changes how you quote and hedge."*

**You validated all of this on the XRPL Testnet** — public infrastructure Ripple
runs for exactly this purpose (see §8).

---

## 8 · Legal note on the test environment (general information, not legal advice)

- XRPL **Testnet / Devnet are public test networks** run by Ripple / the XRP
  Ledger Foundation so developers can build and test **without real funds**;
  faucet test-XRP has no monetary value.
- The client libraries (`xrpl.js`, `xrpl-py`) are **open-source**.
- Using them for a demo is the **intended purpose** — and doing so for a Ripple
  interview shows initiative.
- Guardrails: don't reuse testnet keys on mainnet; don't load-test public nodes
  (run your own `rippled` if you need volume); don't present test results as real
  trading performance; review specific developer terms before any commercial use;
  testnet resets periodically, so don't rely on persistence.

---

## 9 · Likely questions & crisp answers

- *"Walk me through your architecture."* → the five stages above, one sentence each.
- *"Why C++ and Python both?"* → C++ for the latency-critical kernels, Python for
  research velocity; bindings mean one shared codebase, no model drift between
  research and production.
- *"Why two databases?"* → local operational store for speed; central referential
  DB as the firm's golden source for consistency and reporting.
- *"Which risk models do you own?"* → name your real ones; explain one end-to-end.
- *"How would this work in crypto?"* → §7, ending on settlement-window risk.
- *"Is your crypto demo real?"* → yes, validated on Ripple's public testnet.
