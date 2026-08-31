# Crypto risk & quant — one-page cheat sheet
*Morning-of review. You hold the PRM; this is the crypto translation layer, not the basics.*

## Open with this
> "I hold the PRM, so the risk framework is second nature — what I've done is map it
> onto crypto's specific microstructure and settlement physics."

---

## The three translations to deliver with conviction
1. **Fat tails → jump-diffusion + Expected Shortfall.** Crypto returns are fat-tailed and
   skewed; Gaussian VaR understates the tail. Use **CVaR/ES** (averages losses *beyond* VaR,
   coherent, the FRTB direction) and **Merton jump-diffusion** to price the gaps BS misses.
2. **Settlement latency → inventory risk across ledger close.** XRPL settles on-chain in
   ~3–4s and it's final. Inventory held across that window is un-hedgeable → a first-class
   risk term that changes how you quote (Avellaneda-Stoikov skew).
3. **Fragmented liquidity → no NBBO, cross-venue basis.** No consolidated tape; the same
   pair prices differently across venues → best execution and cross-exchange basis are live
   problems, not anomalies.

---

## Market structure with no TradFi equivalent
| Crypto reality | Consequence |
|---|---|
| No consolidated tape / no NBBO | "Best price" is unsolved; basis risk across venues |
| 24/7 markets, no session close | No clean daily mark; fix a sampling grid for VaR |
| On-chain final settlement (~4s on XRPL) | No T+2, no clearing house to unwind a fat-finger |

## Crypto-native risk terms (beyond the PRM syllabus)
- **Perp funding rate** — payment tethering perps to spot; a carry cost *and* a positioning signal.
- **Impermanent / divergence loss** — the AMM LP's core risk; passive LPs can lag simply holding.
- **Stablecoin peg / de-peg risk** — for an RLUSD book this is the dominant credit-like exposure
  (USDC broke peg in 2023 — not theoretical).
- **Oracle / bridge / smart-contract risk** — operational-risk categories with no TradFi analog.
- **MEV** — block-level front-running / sandwiching; execution risk unique to on-chain venues.

---

## Risk measures → the decision each drives (never name one without its use)
| Measure | Used for |
|---|---|
| Volatility / EWMA / GARCH | Position sizing, quote width, vol-targeting (clustering → adaptive) |
| VaR | Limits, capital — but understates tails |
| **CVaR / Expected Shortfall** | Tail capital, stress, FRTB — the upgrade over VaR |
| Skewness | Which tail to hedge; drives option-skew pricing |
| Excess kurtosis | Jump/gap risk; justifies bigger margin buffers |
| Max drawdown / Calmar | Strategy survivability, capital allocation |
| Sortino > Sharpe | When returns are skewed, penalize only downside |

## Pricing models → when you reach for each
| Model | When |
|---|---|
| Black-Scholes | Fast baseline, quoting, Greeks; breaks on the smile |
| Binomial tree | American / early exercise |
| Monte Carlo | Path-dependent exotics, XVA exposure paths |
| Local vol (Dupire) / Heston | Fit the smile; Heston adds vol-of-vol + fatter tails |
| **Merton jump-diffusion** | The crypto one — prices gaps and jumps |
| Avellaneda-Stoikov | Market-making quotes with inventory skew (your demo) |
| AMM constant-product (x·y=k) | On-chain / DeFi liquidity + impermanent loss |

---

## The Ripple-specific closer
> "Most institutional flow settles in **RLUSD, not XRP**, precisely to remove volatility from
> settlement — so the desk's residual market risk collapses onto the **XRP bridge leg and the
> peg**. That's the PRM lens applied to their actual book."

## Discipline note
Depth over breadth. Go deep on **ES, kurtosis, skew, vol clustering** and the **three
translations** above. Tie every measure to a decision. Don't name a model you can't calibrate —
volunteering "that calibration is stubbed" is strength; getting caught is not.
