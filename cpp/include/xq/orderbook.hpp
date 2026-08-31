// orderbook.hpp
// A limit order book modelled on the XRP Ledger's native on-chain DEX.
//
// XRPL SPECIFICS you should be able to explain (this maps the code to the
// ledger's real mechanics):
//   * The XRPL DEX is a central limit order book of "Offers". An OfferCreate
//     carries TakerGets and TakerPays; its price is the "quality" =
//     TakerPays / TakerGets (an exchange rate), NOT a scalar price field.
//   * A book is directional and defined by the (TakerGets, TakerPays) asset
//     pair, e.g. one book is XRP -> RLUSD.issuer, the reverse is another.
//   * XRP amounts are integers in "drops" (1 XRP = 1,000,000 drops), so XRP
//     prices are exact; IOU amounts (RLUSD, etc.) are decimal + issuer.
//   * Offers rest ON-LEDGER and settle at ledger close (~3-4s), so this book
//     updates on ledger validation, not sub-millisecond. Since 2024 the DEX
//     also auto-bridges through XRP and can consume native AMM (XLS-30)
//     liquidity alongside CLOB offers.
//
// DESIGN / LATENCY NOTES (interview point):
//   * std::map gives ordered iteration but pointer-chases (cache-unfriendly).
//     In production you'd swap in a flat sorted container (boost flat_map) or
//     a preallocated price-ladder array keyed by fixed-point ticks for cache
//     locality. The interface below is written so that swap is a drop-in.
//   * Prices are double here for readability; a hardened build would use
//     integer fixed-point (drops / issued-currency scaled ints) to avoid FP
//     rounding on the quality calculation.
#pragma once
#include <algorithm>
#include <cstdint>
#include <limits>
#include <map>
#include <optional>

namespace xq {

enum class Side { Bid, Ask };

using Price = double;   // TakerPays/TakerGets quality; fixed-point in prod
using Qty   = double;   // base-asset size (e.g. XRP), drops in prod

struct TopOfBook {
    Price bid{}, ask{};
    Qty   bid_qty{}, ask_qty{};
    bool  valid{false};
};

// Result of simulating a marketable order against resting liquidity.
struct FillResult {
    Qty   filled{};        // how much of the request we could fill
    Price avg_price{};     // volume-weighted average execution price
    Price slippage_bps{};  // avg vs. arrival mid, in basis points
    bool  complete{false}; // did the book have enough depth?
};

class OrderBook {
public:
    // Aggregate resting size at a price level (replace semantics: qty==0 clears
    // the level, matching how XRPL offer removal is reported).
    void upsert(Side side, Price px, Qty qty) noexcept {
        // bids_ and asks_ are different types (opposite comparators), so we
        // branch rather than select one with a ternary.
        if (side == Side::Bid) {
            if (qty <= 0.0) bids_.erase(px); else bids_[px] = qty;
        } else {
            if (qty <= 0.0) asks_.erase(px); else asks_[px] = qty;
        }
    }

    void clear() noexcept { bids_.clear(); asks_.clear(); }

    std::optional<Price> best_bid() const noexcept {
        return bids_.empty() ? std::nullopt : std::optional{bids_.begin()->first};
    }
    std::optional<Price> best_ask() const noexcept {
        return asks_.empty() ? std::nullopt : std::optional{asks_.begin()->first};
    }

    std::optional<Price> mid() const noexcept {
        if (bids_.empty() || asks_.empty()) return std::nullopt;
        return (bids_.begin()->first + asks_.begin()->first) * 0.5;
    }

    // Spread in basis points of mid.
    std::optional<Price> spread_bps() const noexcept {
        if (bids_.empty() || asks_.empty()) return std::nullopt;
        const Price b = bids_.begin()->first, a = asks_.begin()->first;
        return (a - b) / ((a + b) * 0.5) * 1e4;
    }

    // Size-weighted fair value: leans toward the THIN side, which is where
    // price is likelier to move. Better short-horizon fair value than mid.
    std::optional<Price> microprice() const noexcept {
        if (bids_.empty() || asks_.empty()) return std::nullopt;
        const auto [b, qb] = *bids_.begin();
        const auto [a, qa] = *asks_.begin();
        const Qty tot = qb + qa;
        if (tot <= 0.0) return (a + b) * 0.5;
        return (a * qb + b * qa) / tot;  // weight each price by opposite size
    }

    // Order-book imbalance over top N levels, in [-1, 1]; >0 = bid-heavy.
    // Classic short-horizon directional signal.
    std::optional<double> imbalance(int levels = 5) const noexcept {
        if (bids_.empty() || asks_.empty()) return std::nullopt;
        Qty vb = 0, va = 0;
        int n = 0;
        for (auto it = bids_.begin(); it != bids_.end() && n < levels; ++it, ++n)
            vb += it->second;
        n = 0;
        for (auto it = asks_.begin(); it != asks_.end() && n < levels; ++it, ++n)
            va += it->second;
        const Qty tot = vb + va;
        return tot > 0 ? std::optional{(vb - va) / tot} : std::nullopt;
    }

    // Resting size within `bps` of mid on one side = liquidity a taker can hit
    // before walking the book that far. Concrete meaning of "market depth".
    std::optional<Qty> depth_within_bps(double bps, Side side) const noexcept {
        auto m = mid();
        if (!m) return std::nullopt;
        Qty acc = 0;
        if (side == Side::Ask) {
            const Price lim = *m * (1.0 + bps / 1e4);
            for (const auto& [p, q] : asks_) { if (p > lim) break; acc += q; }
        } else {
            const Price lim = *m * (1.0 - bps / 1e4);
            for (const auto& [p, q] : bids_) { if (p < lim) break; acc += q; }
        }
        return acc;
    }

    // Walk the book to fill `qty` on `side` (Ask = we BUY, lifting offers).
    // Returns VWAP and slippage vs arrival mid -> a real market-impact model.
    FillResult simulate_fill(Side take_side, Qty qty) const noexcept {
        // Dispatch to the correctly-typed book; helper returns FillResult so the
        // ternary unifies cleanly.
        return (take_side == Side::Ask) ? fill_impl(asks_, take_side, qty)
                                        : fill_impl(bids_, take_side, qty);
    }

    TopOfBook top() const noexcept {
        TopOfBook t{};
        if (!bids_.empty() && !asks_.empty()) {
            t.bid = bids_.begin()->first;  t.bid_qty = bids_.begin()->second;
            t.ask = asks_.begin()->first;  t.ask_qty = asks_.begin()->second;
            t.valid = true;
        }
        return t;
    }

private:
    template <class Book>
    FillResult fill_impl(const Book& book, Side take_side, Qty qty) const noexcept {
        FillResult r{};
        auto m = mid();
        Qty remaining = qty;
        double notional = 0.0;
        for (const auto& [px, avail] : book) {
            const Qty take = std::min(remaining, avail);
            notional  += take * px;
            remaining -= take;
            if (remaining <= 1e-12) break;
        }
        r.filled   = qty - remaining;
        r.complete = remaining <= 1e-12;
        if (r.filled > 0) {
            r.avg_price = notional / r.filled;
            if (m) r.slippage_bps = (r.avg_price - *m) / *m * 1e4
                                    * (take_side == Side::Ask ? 1.0 : -1.0);
        }
        return r;
    }

    // Bids: highest price first. Asks: lowest price first.
    std::map<Price, Qty, std::greater<Price>> bids_;
    std::map<Price, Qty, std::less<Price>>    asks_;
};

}  // namespace xq
