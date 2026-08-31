// xrpl_adapters.hpp
// Wires the XRPL engine into the QuantGenLabs core via its venue contracts.
//
// The interfaces below (IMarketDataFeed / IRiskModel / IStrategy / MarketTick /
// Order) are PLACEHOLDERS that mirror the shape of your core contracts. Replace
// them with your real headers and rename methods to match — the bodies reuse
// the engine unchanged:
//     #include "quantgenlabs/core/marketdata/IFeed.hpp"
//     #include "quantgenlabs/core/risk/IRiskModel.hpp"
//     #include "quantgenlabs/core/strategy/IStrategy.hpp"
#pragma once
#include "xrpl/xrpl_book.hpp"      // = xq::OrderBook, reused as the book primitive
#include "xq/risk.hpp"            // inventory VaR/CVaR kernels
#include "xq/market_making.hpp"   // (add: A-S quoter ported from the Python lib)

#include <functional>
#include <string>

namespace qgl::venues::xrpl {

// ===== placeholders for your core types — delete once real headers are in =====
struct MarketTick { std::string instrument; double bid, ask, mid; long ts_ns; };
struct Order { std::string instrument; double price, qty; bool is_buy; };
class IMarketDataFeed {
public:
    virtual ~IMarketDataFeed() = default;
    virtual void start() = 0;
    virtual void stop() = 0;
    virtual void set_tick_handler(std::function<void(const MarketTick&)>) = 0;
};
class IRiskModel {
public:
    virtual ~IRiskModel() = default;
    virtual void on_fill(double signed_qty, double price) = 0;
    virtual void on_mark(double mid) = 0;
    virtual double var(double mid, double conf) const = 0;   // your framework calls this
};
class IStrategy {
public:
    virtual ~IStrategy() = default;
    virtual void on_tick(const MarketTick&) = 0;
    virtual void set_order_handler(std::function<void(const Order&)>) = 0;
};
// ============================================================================


// 1) FEED — translate XRPL book_offers into your core tick, keep an xq::OrderBook.
class XrplFeed final : public IMarketDataFeed {
public:
    explicit XrplFeed(std::string instrument) : instrument_(std::move(instrument)) {}
    void set_tick_handler(std::function<void(const MarketTick&)> h) override { emit_ = std::move(h); }
    void start() override { /* connect Boost.Beast, subscribe books; see xrpl_feed.cpp */ }
    void stop()  override { /* disconnect */ }

    // Called by the ingestion thread each ledger with parsed offers.
    void ingest(/* offers */) {
        // ... book_.upsert(side, price, size) for each offer ...
        if (auto m = book_.mid(); m && emit_) {
            auto b = book_.best_bid(); auto a = book_.best_ask();
            emit_(MarketTick{instrument_, b ? *b : 0.0, a ? *a : 0.0, *m, now_ns()});
        }
    }
    const xq::OrderBook& book() const { return book_; }

private:
    static long now_ns();
    std::string instrument_;
    xq::OrderBook book_;
    std::function<void(const MarketTick&)> emit_;
};


// 2) RISK — the inventory VaR/CVaR kernels behind your IRiskModel contract.
class XrplInventoryRisk final : public IRiskModel {
public:
    void on_fill(double signed_qty, double price) override { eng_.on_fill(signed_qty, price); }
    void on_mark(double mid) override { eng_.on_mark(mid); }
    double var(double mid, double conf) const override { return eng_.parametric_var(mid, conf); }
    double cvar(double mid, double conf) const { return eng_.historical_var(mid, conf); }
    const xq::RiskEngine& engine() const { return eng_; }
private:
    xq::RiskEngine eng_;
};


// 3) STRATEGY — Avellaneda-Stoikov quoting behind your IStrategy contract.
class AvellanedaStoikovMM final : public IStrategy {
public:
    AvellanedaStoikovMM(double gamma, double kappa) : mm_(gamma, kappa) {}
    void set_order_handler(std::function<void(const Order&)> h) override { send_ = std::move(h); }
    void on_tick(const MarketTick& t) override {
        // sigma from your risk model / a shared vol estimator; inventory from position svc
        const double sigma = 0.0007, inventory_units = 0.0;   // <- wire to real state
        auto q = mm_.quote(t.mid, inventory_units, sigma);
        if (send_) {
            send_(Order{t.instrument, q.bid, quote_size_, /*is_buy=*/true});
            send_(Order{t.instrument, q.ask, quote_size_, /*is_buy=*/false});
        }
    }
private:
    xq::AvellanedaStoikov mm_;
    std::function<void(const Order&)> send_;
    double quote_size_ = 1000.0;
};

}  // namespace qgl::venues::xrpl
