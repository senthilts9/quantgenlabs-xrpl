# qgl-xrpl — XRPL venue module for QuantGenLabs

A self-contained XRP Ledger trading/risk module: low-latency C++ engine, Python
research library, two live dashboards, and adapters that plug into the
QuantGenLabs core as a **venue** (one-way dependency, additive — see
`docs/integration-plan.md`).

```
cpp/         C++ engine (order book, risk, market-making) + live feed + bindings
python/      xquant research lib, finmath calculator, demo
dashboards/  self-contained HTML terminals (open in a browser)
web/         React port of the dashboards (Vite, matches genai-risk-dashboard's UI)
docs/        integration plan, interview brief, talking tracks, cheat sheet
.vscode/     macOS build/run/debug tasks
```

## 1 · Open in VS Code

```bash
cd quantgenlabs-xrpl
code .
```
Install the **C/C++** and **Python** extensions when prompted.

## 2 · Set up (macOS)

```bash
bash setup-macos.sh
```
Installs the compiler, `cmake`, the optional live-feed/pybind libraries via
Homebrew, and a Python venv with the packages.

## 3 · Run it (fastest path — no cmake needed)

**C++ sim** (verified: builds clean under `-Wall`, prints an uncrossed book):
```bash
mkdir -p build
clang++ -std=c++20 -O2 -Wall -Icpp/include cpp/src/sim_main.cpp -o build/sim -pthread
./build/sim
```
Or in VS Code: ⇧⌘B, then run task **“sim: run”**.

**Python** (verified financial calcs + engine demo):
```bash
cd python && source .venv/bin/activate
python finmath.py     # all self-tests pass
python demo.py        # order book + risk + Avellaneda-Stoikov quotes
```

**Dashboards** — open these in a browser (double-click or `open`):
```bash
open dashboards/xrpl-desk.html            # market-making terminal
open dashboards/risk-analytics-board.html # Greeks + 20 risk + 20 quant, live
```
Both default to a simulated feed so they work offline; live testnet mode needs
the file opened locally (not in a sandbox).

## 4 · React console (`web/`) — same two boards, QuantGenLabs-styled UI

A React/Vite port of both HTML dashboards above, purpose-built to demonstrate the
crypto market-making + risk + quant surface area on **testnet / non-prod** in a UI
that matches `genai-risk-dashboard`'s component and design-token conventions (same
author, same visual family — IBM Plex, the same `.panel`/`.grid`/`.tab-bar` system).
The HTML dashboards aren't replaced; `web/` is the polished, componentized version
for anyone who'd rather review or extend this as React than as two big inline-script
HTML files.

```bash
cd web
npm install
npm run dev        # http://localhost:5174
npm run selftest   # 82 edge-case checks against the math layer, no browser needed
```

All the actual math (Black-Scholes/Greeks, VaR/CVaR suite, order book, XRP-leg risk
engine, Avellaneda-Stoikov) lives in framework-free modules under `web/src/lib/`,
independent of the React components rendering it — and is unit-tested by
`web/scripts/selftest.mjs` against real edge cases (T=0, sigma=0, empty/short return
series, deep ITM/OTM, negative rates, put-call parity, an empty order book,
degenerate quoting params). That test battery caught two real bugs during the port
that a visual read-through of the original HTML hadn't surfaced — see `web/README.md`
for both. It also carries forward the vol-calibration and Greeks-labeling fixes
already made at the HTML-dashboard level, now centralized in one shared module so
they can't drift apart across dashboards again.

**Not yet run in this environment** — the machine this was built on has no
`node`/`npm` installed, so `npm install`/`vite build`/`vite dev` have never actually
executed here. The math layer was still genuinely verified (bundled and run through
macOS's built-in JavaScriptCore via `osascript`, all 82 checks passing), but that's
not a substitute for a real `npm install && npm run build` — do that once yourself
before treating this as demo-ready.

## 5 · Full build with cmake (adds live feed + Python extension)

```bash
cmake -S cpp -B cpp/build -DOPENSSL_ROOT_DIR=$(brew --prefix openssl@3)
cmake --build cpp/build -j
./cpp/build/sim
```
`xrpl_live` and the `qgl_xrpl_ext` Python module build only if their deps
(Boost/OpenSSL/nlohmann-json, pybind11) are found — otherwise they're skipped,
never fatal.

## 6 · Deploy into QuantGenLabs (new folder in the existing repo)

Because your platform is a C++-core monorepo with adapter interfaces, this drops
in **additively** — no core edits, existing tests stay green.

```bash
# from your QuantGenLabs repo root, on a new branch
git checkout -b feat/xrpl-venue
mkdir -p venues
cp -R /path/to/quantgenlabs-xrpl venues/xrpl
```

Then:
1. In `venues/xrpl/cpp/include/xrpl/xrpl_adapters.hpp`, delete the placeholder
   interface block and `#include` your real `IFeed` / `IRiskModel` / `IStrategy`
   headers; rename methods to match. The bodies reuse the engine unchanged.
2. Wire the two marked spots in `AvellanedaStoikovMM::on_tick` (`sigma`,
   `inventory_units`) to your vol estimator and position service.
3. Add one line to the root CMake: `add_subdirectory(venues/xrpl/cpp)`.
4. Register the venue (one additive line in your registry, or the
   self-registration pattern) — see `docs/integration-plan.md`.
5. Build, run your **existing** test suite unchanged, confirm green, open a PR.

The dependency arrow only ever points inward (xrpl → core), so the module cannot
alter existing behavior. That one-way rule is the whole safety argument.

## What's verified vs. illustrative

- **Verified here:** the C++ engine + sim compile clean and run; `finmath.py`
  self-tests pass; Black-Scholes + all Greeks matched analytic values; the
  `web/src/lib/` math layer passes 82 edge-case checks (T=0, sigma=0, deep
  ITM/OTM, negative rates, put-call parity, empty order book, degenerate
  quoting params) run via `osascript -l JavaScript`, and the pybind11
  bindings were compiled, linked, and imported into Python by hand.
- **Needs your machine:** the HTML dashboards (open once to confirm render);
  `web/` needs a real `npm install && npm run build` (never run in the
  environment this was built in — no node/npm there); the live XRPL feed
  (endpoints/auth move — check current docs); the `quality`→price
  normalization in the feed (sanity-check against a live pair).
- **Illustrative, not calibrated:** Merton/Bachelier params, Kyle's λ / Amihud
  off a synthetic book, AMM/impermanent-loss toy pool. Say so if asked.
