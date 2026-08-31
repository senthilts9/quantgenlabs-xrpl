# Integrating the XRPL engine into QuantGenLabs

*Structure: C++ core + pybind11 monorepo, venues plug in via defined
interfaces/adapters. So XRPL enters as a **venue module** implementing existing
contracts — no core edits, no risk-framework fork.*

## Where it sits (proposed layout)

```
quantgenlabs/
  core/                         # unchanged
    marketdata/IFeed.hpp        #   your existing feed contract
    risk/IRiskModel.hpp         #   your existing risk contract
    strategy/IStrategy.hpp      #   your existing strategy contract
    storage/IResultSink.hpp     #   your DataBank/Capsion DAO
  venues/
    xrpl/                       # NEW — self-contained module
      include/xrpl/
        xrpl_book.hpp           #   = xq::OrderBook (reused as-is)
        xrpl_adapters.hpp       #   Feed + Risk + Strategy adapters
      src/
        xrpl_feed.cpp           #   Boost.Beast ingestion
      bindings/
        xrpl_bindings.cpp       #   pybind11 registration
      python/quantgenlabs/venues/xrpl/
        __init__.py             #   registers strategy in the Python layer
      tests/
      CMakeLists.txt            #   add_subdirectory'd from the root
```

## Adapter checklist (the actual work)

1. **Feed.** `XrplFeed : public core::IMarketDataFeed`. Map the XRPL
   `book_offers` / `l2` payload onto your core tick/book-event type; emit through
   the core's callback. Reuse `xq::OrderBook` as the internal book.
2. **Risk.** `XrplInventoryRisk : public core::IRiskModel`. Wrap the inventory
   VaR/CVaR/vol from `risk.hpp`; expose the same `evaluate()` your framework
   calls so limits and dashboards work unchanged.
3. **Strategy.** `AvellanedaStoikovMM : public core::IStrategy`. Wrap the quoter;
   consume ticks, emit quotes/orders in your core's order type.
4. **Storage.** Write results through your existing `IResultSink` so XRPL lands
   in DataBank and replicates to Capsion DB like every other venue.
5. **Bindings.** Register the venue in `xrpl_bindings.cpp` so the Python research
   layer sees `quantgenlabs.venues.xrpl` alongside the rest.
6. **Config + tests.** Add the venue to your registry/config; port the offline
   sim as a unit test (deterministic, no network) plus one live-testnet
   integration test behind a flag.

## Reuse vs. retire

- **Reuse:** `xq::OrderBook`, the risk kernels, the A-S quoter, the dashboard
  (point it at the shared data layer, not its sim feed).
- **Retire/merge:** `finmath.py` if the platform already wraps QuantLib; the
  standalone C++ `sim_main.cpp` becomes a unit test; the standalone Python
  `xquant` becomes the `venues/xrpl/python` package.

## The interview line

> "QuantGenLabs is a C++-core monorepo where venues plug in through defined
> interfaces. Adding XRPL was a venue adapter against the existing `IFeed`,
> `IRiskModel`, and `IStrategy` contracts — no core changes and no fork of the
> risk framework. That's the test of good infrastructure: a new crypto venue is
> a module, not a project."

That answers the unspoken question a Head of Quant is really asking — *can this
person extend a platform without breaking it* — with a concrete yes.
