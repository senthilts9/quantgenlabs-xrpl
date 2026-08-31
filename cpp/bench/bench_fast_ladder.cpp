// bench_fast_ladder.cpp -- does a genuinely faster order-book design reach
// 1M full-ticks/sec, where std::map (bench_decompose.cpp) measured 301,056/sec?
//
// FastBook replaces xq::OrderBook's std::map<Price,Qty> with a plain
// fixed-size std::array<Level,6> per side -- the honest structure for this
// exact workload, since sim_main.cpp/xrpl-desk.html only ever track a fixed
// top-N depth, never a full sparse book. No heap allocation, no tree
// rebalancing, no per-tick alloc/dealloc: each tick just overwrites 12
// array slots directly. This matches orderbook.hpp's own "a hardened build
// would swap in a flat sorted container... for cache locality" comment,
// scoped to what this workload actually needs.
//
// This is a standalone proof-of-concept in this benchmark file, NOT a
// replacement of the shipped xq::OrderBook -- that class supports a real
// sparse multi-level book (arbitrary price levels, not just a fixed top-N),
// which is the right general-purpose design for a venue adapter that has to
// handle a real XRPL book_offers response. Promoting this fixed-depth
// design would be the right call specifically for a top-of-book feed, not a
// blanket replacement -- a real decision to make deliberately, not smuggle
// into a benchmark file.
#include <array>
#include <chrono>
#include <cstdio>
#include <optional>
#include <random>

using Clock = std::chrono::steady_clock;

namespace {

struct Level { double price = 0.0; double qty = 0.0; };

struct FastBook {
    std::array<Level, 6> bids{};  // bids[0] = best (nearest mid)
    std::array<Level, 6> asks{};  // asks[0] = best (nearest mid)

    std::optional<double> mid() const {
        if (bids[0].qty <= 0 || asks[0].qty <= 0) return std::nullopt;
        return (bids[0].price + asks[0].price) / 2.0;
    }
    std::optional<double> microprice() const {
        if (bids[0].qty <= 0 || asks[0].qty <= 0) return std::nullopt;
        const double tot = bids[0].qty + asks[0].qty;
        if (tot <= 0) return mid();
        return (asks[0].price * bids[0].qty + bids[0].price * asks[0].qty) / tot;
    }
};

template <typename Fn>
double rate_for(std::chrono::milliseconds duration, Fn tick) {
    const auto deadline = Clock::now() + duration;
    long long count = 0;
    while (true) {
        for (int i = 0; i < 4096; ++i) { tick(); ++count; }
        if (Clock::now() >= deadline) break;
    }
    return count / std::chrono::duration<double>(duration).count();
}

}  // namespace

int main() {
    std::printf("FastBook full-tick throughput (fixed std::array<Level,6>, zero heap alloc/op)\n\n");

    FastBook book;
    double mid = 2.10;
    std::mt19937 rng(7);
    std::uniform_real_distribution<double> qty_dist(500, 5000);

    // Identical workload shape to bench_throughput.cpp's "full tick": same
    // per-tick random walk, same 6-level half-spread formula, same mid()+
    // microprice() reads -- the only thing that changed is the container.
    const auto duration = std::chrono::milliseconds(2000);
    const double rate = rate_for(duration, [&]() {
        mid *= 1.0 + 0.0001 * (static_cast<int>(rng() % 7) - 3);
        const double half = mid * 0.0004;
        for (int lvl = 0; lvl < 6; ++lvl) {
            const double off = half + lvl * mid * 0.0003;
            book.bids[lvl] = {mid - off, qty_dist(rng)};
            book.asks[lvl] = {mid + off, qty_dist(rng)};
        }
        volatile auto m = book.mid();
        volatile auto mp = book.microprice();
        (void)m; (void)mp;
    });

    std::printf("Full tick (12 array writes + mid + microprice): %.0f ticks/sec (%.1f ns/tick)\n", rate,
                1e9 / rate);
    std::printf("vs. std::map-backed OrderBook (bench_throughput.cpp): 301056 ticks/sec (3321.6 ns/tick)\n");
    std::printf("Speedup: %.1fx\n", rate / 301056.0);
}
