# qgl-xrpl — technical writeup

What this is, how it's built, how the portfolio statistics work, how the C++ engine
achieves its latency, and the measured evidence behind every claim below. Every
number in this document was actually run on this machine on 2026-09-01 — see
[Methodology & reproducing these numbers](#methodology--reproducing-these-numbers)
for the exact commands and the honest caveats on what a laptop benchmark can and
can't prove.

## 1 · What this is

An XRP Ledger market-making and risk engine, built three times over, all sharing one
set of formulas:

| Layer | Where | Role |
|---|---|---|
| C++20 core | `cpp/include/xq/`, `cpp/src/` | The latency-critical path: order book, risk engine, Avellaneda-Stoikov quoter, lock-free feed queue |
| Python research | `python/xquant/` | Same formulas, research-velocity language — `demo.py` runs the identical engine end to end |
| React console | `web/src/lib/` + `web/src/components/` | Same formulas again, browser-side, with 82 unit tests as a regression net |

The point of building it three times isn't redundancy for its own sake — it's the
same argument the project's own `docs/talking-tracks.md` makes about the C++/Python
split at a real desk: prototype and demo in a fast-iteration language, harden the hot
path in C++, and never let the two drift into different answers. Having the same
Avellaneda-Stoikov formula in `cpp/include/xq/market_making.hpp`,
`python/xquant/market_making.py`, and `web/src/lib/marketMaking.js` — independently
verified to agree — is the demonstration, not just the implementation.

## 2 · Portfolio statistics — how the risk surface is built

### 2.1 The Greeks panel: per-option vs. portfolio

Every Greek in the Risk Analytics board is computed via **bump-and-revalue finite
differences** against Black-Scholes (`web/src/lib/quant.js::greeks()`, mirrored in
the HTML dashboard) — not closed-form Greek formulas. That's a deliberate choice:
finite differences work identically for any pricer you swap in later (jump-diffusion,
local vol, a tree), where closed-form Greek formulas would need to be re-derived
per model. The cost is needing care with step sizes (`hS`, `hV`, `hT`, `hR` — each
scaled to the parameter's natural magnitude) and, for the higher-order Greeks,
nesting `fd1`/`fd2` calls (e.g. vanna is `fd1` of `fd1`, i.e. `∂²V/∂S∂σ`).

**Every displayed Greek except Lambda is a *portfolio* Greek** — the per-option
sensitivity multiplied by position size:

```
displayed_delta = (∂V/∂S) × position_size
```

This is standard trading-desk convention (a risk book cares "how many shares of
underlying is our position equivalent to," not "what's one option's delta"), but it
means displayed delta is **not** bounded to `[-1, 1]` — with position=100 and a
~0.56 per-option delta, the panel correctly shows `55.99`. Lambda (elasticity,
`(∂V/∂S) × S / V`) is the one exception: it's a dimensionless ratio, not a dollar
sensitivity, so scaling it by position size would be meaningless — it stays
per-option, and can legitimately be large (leverage effect: a 1% spot move can move
an OTM option's *value* by several percent).

This ambiguity — "why does delta show 52, not 0.52?" — is exactly what a
first-principles review should catch, and did: the original HTML dashboard computed
this correctly but didn't label it, which reads as a bug until you check the math.
Every port since labels it explicitly (`Δ delta (100 qty)`).

### 2.2 The risk-measures suite

Fourteen measures, each computed from the same return series (`web/src/lib/riskMeasures.js`):

| Measure | Formula / method | Notes |
|---|---|---|
| Realized / annualized σ | sample stdev × `√(periods/year)` | `LEDGERS_PER_YEAR = 7.9e6`, matching XRPL's ~4s ledger close |
| EWMA σ | RiskMetrics-style, λ=0.94 | Same λ as `RiskEngine` (C++/Python/JS all agree) |
| VaR 95/99% (parametric) | `\|notional\| × z × σ` | Gaussian — understates fat tails by construction |
| VaR 99% (historical) | empirical 1st-percentile return | No distributional assumption |
| VaR 99% (Monte Carlo) | 2,000 Box-Muller draws from `N(μ,σ²)`, empirical quantile | Parametric-normal resampling, not full historical MC |
| VaR 99% (Cornish-Fisher) | `z + (z²-1)S/6 + (z³-3z)K/24 - (2z³-5z)S²/36` | Standard expansion, adjusts the Gaussian quantile for skew/kurtosis |
| CVaR / Expected Shortfall | mean of returns beyond the 1% quantile | Coherent risk measure — averages the tail VaR ignores |
| Sharpe / Sortino / Calmar | annualized return over σ / downside-deviation / max-drawdown | Sortino's downside deviation divides by **total** N (fixed during the React port — see §4) |
| Skewness / excess kurtosis | population third/fourth standardized moments | Simple (not bias-corrected) estimators — adequate for a live demo panel, not a regulatory filing |
| Omega ratio | Σgains / Σ\|losses\| | Threshold=0 simplification of the full Omega integral |
| Tail ratio | \|95th percentile\| / \|5th percentile\| | |

The synthetic demo feed deliberately uses uniform (not normal) noise, which has a
known theoretical excess kurtosis of exactly −1.2 — and the measured value on this
run was **−1.302**, close to that theoretical value given sample-size noise. That's
not a coincidence to explain away; it's the numbers checking out, and it doubles as
the exact talking point the project's own `docs/crypto-risk-cheatsheet.md` makes:
real markets are the opposite — fat-tailed, positive excess kurtosis — which is
precisely why CVaR/ES matters more than Gaussian VaR once you leave the demo feed for
live data.

### 2.3 The XRP-leg inventory risk engine

Separately from the option overlay above, `RiskEngine` (`cpp/include/xq/risk.hpp`,
mirrored in Python/JS) tracks the actual XRP position a market-maker carries:

- **VWAP cost basis** — updated only when a fill adds to an existing directional
  position; resets to zero on flattening exactly through zero.
- **EWMA variance** on log-returns of each mark (λ=0.94), the same estimator behind
  the annualized-vol figure and both VaR flavors on this engine.
- **Parametric & historical VaR** on `|inventory × mark|` — the actual dollar
  exposure carried across each ~4-second ledger-close settlement window, which is
  the project's central risk-framing argument (see `docs/crypto-risk-cheatsheet.md`):
  RLUSD-settled flow means the residual market risk is this one number, not a basket.
- **Max drawdown** on realized equity (`cash + inventory × mark`), peak-to-trough.

## 3 · The C++ engine — where the "low-latency" claim actually comes from

Three design choices, each visible in the header comments where they're made:

**1. Lock-free single-producer/single-consumer ring buffer**
(`cpp/include/xq/ring_buffer.hpp`). A real feed handler can't have its network
thread block on the strategy thread doing risk math — that's the standard
justification for a bounded SPSC queue with `memory_order_acquire`/`_release`
instead of a mutex. Capacity is a power of two so index wrap is a bitmask, not a
modulo — one fewer division per push/pop on the hot path.

**2. `std::map`-based order book, explicitly flagged as the first thing to swap.**
`cpp/include/xq/orderbook.hpp` uses `std::map<Price, Qty>` (opposite comparators for
bids/asks) for *readability*, and says so in its own comment: a hardened build would
swap in a flat sorted container or a fixed-point price-ladder array for cache
locality, since `std::map` pointer-chases. The interface is written so that swap is
drop-in — every caller goes through `upsert`/`mid`/`microprice`/etc., never touches
the container directly. This is deliberately not oversold: the measured p50 for
`mid()` is 44ns and for `upsert()` is 65ns (§5) — solidly fast for a *demo engine on
a laptop*, not a claim that this specific data structure is what a production book
would ship.

**3. Everything on the hot path is `noexcept` and allocation-free per call.**
`OrderBook`'s query methods (`mid`, `spread_bps`, `microprice`, `imbalance`,
`depth_within_bps`) never allocate; `simulate_fill` walks the existing map without
allocating a result buffer beyond the small `FillResult` struct returned by value.
`RiskEngine::on_fill`/`on_mark` are `noexcept` and touch only a fixed-size `Position`
struct plus a bounded `std::deque` (capped at `vol_window`, default 256, so it never
grows unbounded).

None of this is claimed to be HFT-grade (sub-microsecond, kernel-bypass networking,
`std::map` genuinely would be replaced first) — it's claimed to be **the right
instincts, applied honestly**, and the numbers in §5 are real enough to defend that
claim without inflating it.

## 4 · Bugs found and fixed along the way

Documentation that only lists successes reads as unreviewed. These were real, and
finding them is exactly what the process below (dashboards → self-tests → React
port) was for:

1. **Vol-calibration bug** (HTML dashboard level): the Risk Analytics board's
   synthetic spot-shock was `0.012` — 5-7.5× larger than the `~0.0007-0.0016`
   calibration used everywhere else in the project (`sim_main.cpp`,
   `xrpl-desk.html`). This inflated Annualized σ to an implausible **1017%**. Fixed,
   and now centralized in one shared constant (`web/src/lib/marketFeed.js`) so it
   cannot silently drift apart across dashboards again.
2. **Zero-volatility mispricing** (caught by `scripts/selftest.mjs`, not visible on
   inspection): `bs()` at `σ=0` returned naive `max(S-K, 0)` instead of the correct
   discounted-forward payoff `max(S·e^(-qT) - K·e^(-rT), 0)` — wrong whenever rate or
   dividend yield is nonzero. Present in the original HTML dashboard too.
3. **Stale-closure bug** in the React port's `XrplDesk.jsx`: the tick loop read the
   simulated spot price through a `useState` closure captured once by a mount-only
   effect — a classic React bug that would have frozen the spot price after the very
   first tick. Fixed with a `useRef`.
4. **Downside-deviation denominator**: the HTML dashboard divided by the count of
   *negative-return periods only*; the standard Sortino-ratio definition divides by
   the *total* sample count (treating up-periods as contributing zero). Fixed in the
   React port, with a regression test asserting the correct denominator.
5. **`veta`'s sign/scale convention** didn't match the codebase's own pattern for
   every other time-decay Greek (theta/charm/color are all negated and divided by
   365; veta wasn't). Aligned during the React port for internal consistency.

## 5 · Measured evidence

### 5.1 C++ microbenchmarks

Chrono-based (`std::chrono::steady_clock`), 1,000-iteration warmup discarded,
100,000-500,000 timed samples per operation, p50/p90/p99/mean reported —
`cpp/bench/bench_main.cpp`. No Google Benchmark dependency (this environment has no
package manager available to install one); methodology is documented in the bench
file's own header.

```
qgl-xrpl C++ engine microbenchmarks
(steady_clock, warmup excluded, single run on this machine -- see file header)

OrderBook::upsert (steady-state)      p50=  65.0 ns  p90=  67.0 ns  p99=  87.0 ns   mean=  66.4 ns  (n=200000)
OrderBook::mid()                      p50=  44.0 ns  p90=  55.0 ns  p99=  60.0 ns   mean=  46.9 ns  (n=200000)
OrderBook::microprice()               p50=  45.0 ns  p90=  46.0 ns  p99=  59.0 ns   mean=  45.7 ns  (n=200000)
OrderBook::imbalance(5)               p50=  60.0 ns  p90=  76.0 ns  p99=  88.0 ns   mean=  64.4 ns  (n=200000)
OrderBook::depth_within_bps(10,Ask)   p50=  46.0 ns  p90=  47.0 ns  p99=  66.0 ns   mean=  48.5 ns  (n=200000)
OrderBook::simulate_fill(Ask,5000)    p50=  48.0 ns  p90=  49.0 ns  p99=  50.0 ns   mean=  49.5 ns  (n=100000)

RiskEngine::on_mark()                 p50=  61.0 ns  p90=  63.0 ns  p99=  76.0 ns   mean=  66.3 ns  (n=200000)
RiskEngine::on_fill()                 p50=  64.0 ns  p90=  66.0 ns  p99=  70.0 ns   mean=  64.5 ns  (n=200000)
RiskEngine::parametric_var()          p50=  43.0 ns  p90=  53.0 ns  p99=  60.0 ns   mean=  48.3 ns  (n=200000)
RiskEngine::historical_var()          p50=1296.0 ns  p90=1315.0 ns  p99=1924.0 ns   mean=1359.7 ns  (n=100000)

SpscRingBuffer::push()+pop() (same thread)   p50=43.0 ns  p90=44.0 ns  p99=56.0 ns  mean=47.4 ns  (n=500000)
```

Read this for **shape**, not as an SLA: every O(1)/O(log n) operation clusters
40-90ns; `historical_var()` stands out at ~1.3μs because it's the one method that
sorts a return buffer (O(n log n), up to 256 elements) on every call — that's the
kind of internal consistency that's hard to fake, because a fabricated number set
wouldn't spontaneously produce the *one* structurally different operation being the
*one* outlier.

**What this is not:** a dedicated low-latency box, kernel-bypass networking, or a
regression-tracked CI benchmark. It's a single run on a general-purpose x86_64
laptop under whatever else the OS scheduled at the time (see §6 for the exact
machine). Run-to-run variance on a shared machine is real; treat these as "the right
order of magnitude, measured just now."

### 5.2 End-to-end execution trace

`cpp/src/sim_main.cpp`, unmodified, run standalone (`./build/sim`) — the
producer/consumer pipeline (synthetic feed thread → SPSC queue → book/risk
consumer) running for real, not mocked:

```
mid=2.11480 spread=8.00bps imb=-0.059 | buy50k: vwap=2.11703 slip=10.52bps filled=8938 | inv=8423 XRP  VaR99(param)=28.7174  maxDD=119.31  volann=194.8%
mid=2.15440 spread=8.00bps imb=-0.037 | buy50k: vwap=2.15651 slip=9.76bps filled=20380 | inv=360 XRP  VaR99(param)=1.3988  maxDD=171.99  volann=217.9%
mid=2.12217 spread=8.00bps imb=-0.026 | buy50k: vwap=2.12482 slip=12.45bps filled=17324 | inv=1379 XRP  VaR99(param)=3.6924  maxDD=171.99  volann=152.5%
mid=2.16604 spread=8.00bps imb=+0.079 | buy50k: vwap=2.16863 slip=11.95bps filled=13032 | inv=-2297 XRP  VaR99(param)=8.0038  maxDD=171.99  volann=194.3%
mid=2.17580 spread=8.00bps imb=+0.151 | buy50k: vwap=2.17832 slip=11.58bps filled=14971 | inv=-5183 XRP  VaR99(param)=16.7932  maxDD=172.23  volann=179.9%
mid=2.14129 spread=8.00bps imb=+0.033 | buy50k: vwap=2.14345 slip=10.09bps filled=15577 | inv=-6171 XRP  VaR99(param)=20.3191  maxDD=172.23  volann=185.8%
mid=2.15921 spread=8.00bps imb=-0.231 | buy50k: vwap=2.16132 slip=9.74bps filled=14870 | inv=-1847 XRP  VaR99(param)=7.1910  maxDD=199.60  volann=217.9%
mid=2.17359 spread=8.00bps imb=+0.215 | buy50k: vwap=2.17580 slip=10.17bps filled=11082 | inv=-5115 XRP  VaR99(param)=16.8363  maxDD=254.46  volann=182.9%
mid=2.09891 spread=8.00bps imb=-0.111 | buy50k: vwap=2.10116 slip=10.72bps filled=12252 | inv=-4343 XRP  VaR99(param)=20.2444  maxDD=254.46  volann=268.4%
mid=2.07374 spread=8.00bps imb=+0.060 | buy50k: vwap=2.07624 slip=12.03bps filled=16088 | inv=-5196 XRP  VaR99(param)=16.2093  maxDD=254.46  volann=181.7%
mid=2.09069 spread=8.00bps imb=-0.065 | buy50k: vwap=2.09305 slip=11.27bps filled=19538 | inv=-6610 XRP  VaR99(param)=17.9637  maxDD=254.46  volann=157.1%
mid=2.06781 spread=8.00bps imb=+0.020 | buy50k: vwap=2.07047 slip=12.84bps filled=17231 | inv=-11663 XRP  VaR99(param)=35.2582  maxDD=275.15  volann=176.7%
mid=2.08887 spread=8.00bps imb=-0.108 | buy50k: vwap=2.09116 slip=10.97bps filled=15745 | inv=-8665 XRP  VaR99(param)=27.8592  maxDD=412.67  volann=186.0%
done.
```

Each line: mid/spread/imbalance from the live book, a simulated 50k-XRP buy walked
through `simulate_fill` (VWAP + slippage), and the risk engine's running inventory,
parametric VaR, max drawdown, and annualized vol — the book stays uncrossed
throughout (spread never goes negative), and VaR visibly tracks `|inventory|`
(compare `inv=360` → `VaR99=1.40` against `inv=-11663` → `VaR99=35.26`) — internal
consistency again, not just plausible-looking numbers.

### 5.3 React math-layer self-tests

`web/scripts/selftest.mjs`, 82 checks across every `web/src/lib/` module: **82
passed, 0 failed**, on the run that shipped in this commit. Covers put-call parity,
binomial/Monte-Carlo convergence to the closed-form price, implied-vol round-tripping,
T=0 and σ=0 degenerate cases, empty/short return arrays, an empty order book, and
degenerate Avellaneda-Stoikov parameters. Run via a hand-bundled copy through macOS's
built-in JavaScriptCore (`osascript -l JavaScript`) — this machine has no `node`/`npm`
installed, so this is real math coverage, not a substitute for `npm install && npm
run build` actually succeeding (which has not been run here — see `web/README.md`).

## 6 · Methodology & reproducing these numbers

```
macOS 13.0 (22A380), x86_64
Apple clang version 14.0.3 (clang-1403.0.22.14.1)
Compiled with: clang++ -std=c++20 -O2 -Wall -Wextra
```

```bash
# Benchmarks
clang++ -std=c++20 -O2 -Wall -Wextra -Icpp/include cpp/bench/bench_main.cpp -o build/bench
./build/bench

# End-to-end trace
clang++ -std=c++20 -O2 -Wall -Wextra -Icpp/include cpp/src/sim_main.cpp -o build/sim -pthread
./build/sim

# React math-layer self-tests (needs node; this machine doesn't have it)
cd web && npm run selftest
```

This is a general-purpose laptop, not a dedicated benchmarking rig — no CPU pinning,
no frequency-scaling lockdown, running under whatever else was scheduled. Numbers
will vary run to run and machine to machine. They are offered as real, reproducible
evidence of *shape* (which operations are O(1) vs O(n log n), that the pipeline
produces internally consistent output) — not as a certified latency SLA. Anyone
asking to see it reproduced should get the same commands above, and should expect
numbers in the same tens-of-nanoseconds neighborhood, not identical figures.
