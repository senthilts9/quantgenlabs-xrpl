// bench_decompose.cpp -- attributes bench_throughput.cpp's full-tick cost to
// its components, since "std::map is slow" isn't good enough evidence on its
// own for what to fix first.
#include "xq/orderbook.hpp"
#include "xq/risk.hpp"

#include <chrono>
#include <cstdio>
#include <random>

using Clock = std::chrono::steady_clock;

namespace {
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
    std::mt19937 rng(7);
    std::uniform_real_distribution<double> qty_dist(500, 5000);
    const auto dur = std::chrono::milliseconds(1000);
    double mid = 2.10;

    // No isolated "clear() alone" test: after the first call the map is
    // already empty, so a repeated-call loop wouldn't measure the thing we
    // actually care about (deallocating a populated book each tick).
    // clear()'s cost is backed out below instead, as the difference between
    // "upsert on existing levels" and "clear() + upsert" -- the same 12
    // upserts, with and without the deallocation in front of them.
    {
        xq::OrderBook book;
        const double r = rate_for(dur, [&]() {
            for (int lvl = 0; lvl < 6; ++lvl) {
                book.upsert(xq::Side::Bid, mid - 0.001 * (lvl + 1), qty_dist(rng));
                book.upsert(xq::Side::Ask, mid + 0.001 * (lvl + 1), qty_dist(rng));
            }
        });
        std::printf("12x upsert() alone (existing levels)      : %.0f/sec  (%.1f ns)\n", r, 1e9 / r);
    }
    {
        xq::OrderBook book;
        const double r = rate_for(dur, [&]() {
            book.clear();
            for (int lvl = 0; lvl < 6; ++lvl) {
                book.upsert(xq::Side::Bid, mid - 0.001 * (lvl + 1), qty_dist(rng));
                book.upsert(xq::Side::Ask, mid + 0.001 * (lvl + 1), qty_dist(rng));
            }
        });
        std::printf("clear() + 12x upsert() together           : %.0f/sec  (%.1f ns)\n", r, 1e9 / r);
    }
    {
        xq::OrderBook book;
        for (int lvl = 0; lvl < 6; ++lvl) {
            book.upsert(xq::Side::Bid, mid - 0.001 * (lvl + 1), 1000);
            book.upsert(xq::Side::Ask, mid + 0.001 * (lvl + 1), 1000);
        }
        const double r = rate_for(dur, [&]() {
            volatile auto a = book.mid();
            volatile auto b = book.microprice();
            (void)a; (void)b;
        });
        std::printf("mid()+microprice() alone                  : %.0f/sec  (%.1f ns)\n", r, 1e9 / r);
    }
    {
        xq::RiskEngine risk;
        const double r = rate_for(dur, [&]() {
            mid *= 1.0 + 0.0001 * (static_cast<int>(rng() % 7) - 3);
            risk.on_mark(mid);
        });
        std::printf("risk.on_mark() alone                      : %.0f/sec  (%.1f ns)\n", r, 1e9 / r);
    }
}
