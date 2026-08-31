// bench_main.cpp -- dependency-free microbenchmarks for xq::OrderBook,
// xq::RiskEngine, and xq::SpscRingBuffer.
//
// No Google Benchmark here (this environment has no network/brew to install
// it, and pulling in a real benchmark harness for one bench file wasn't
// worth the dependency). This is a straightforward warmup + N-sample
// chrono::steady_clock harness reporting median/p90/p99, which is enough to
// support a real latency claim honestly -- it is not a substitute for a
// proper regression-tracked benchmark suite in CI, and single-run numbers on
// a laptop under whatever else is scheduled will vary run to run. Treat the
// numbers this prints as "the right order of magnitude, measured just now,"
// not a certified SLA.
#include "xq/orderbook.hpp"
#include "xq/risk.hpp"
#include "xq/ring_buffer.hpp"

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <random>
#include <string>
#include <vector>

using Clock = std::chrono::steady_clock;

namespace {

struct Stats {
    double p50, p90, p99, mean;
};

Stats summarize(std::vector<double>& samples_ns) {
    std::sort(samples_ns.begin(), samples_ns.end());
    const auto at = [&](double q) {
        std::size_t idx = static_cast<std::size_t>(q * (samples_ns.size() - 1));
        return samples_ns[idx];
    };
    double sum = 0;
    for (double v : samples_ns) sum += v;
    return {at(0.50), at(0.90), at(0.99), sum / samples_ns.size()};
}

// Runs `body` `n` times, timing each call individually (so p99 reflects real
// per-call tail latency, not just total-time-divided-by-n).
template <typename Fn>
Stats bench(const std::string& name, int warmup, int n, Fn body) {
    for (int i = 0; i < warmup; ++i) body(i);
    std::vector<double> samples;
    samples.reserve(n);
    for (int i = 0; i < n; ++i) {
        const auto t0 = Clock::now();
        body(i);
        const auto t1 = Clock::now();
        samples.push_back(std::chrono::duration<double, std::nano>(t1 - t0).count());
    }
    const Stats s = summarize(samples);
    std::printf("%-32s  p50=%8.1f ns  p90=%8.1f ns  p99=%8.1f ns  mean=%8.1f ns  (n=%d)\n",
                name.c_str(), s.p50, s.p90, s.p99, s.mean, n);
    return s;
}

}  // namespace

int main() {
    std::mt19937 rng(7);
    std::uniform_real_distribution<double> qty_dist(100, 5000);

    std::printf("qgl-xrpl C++ engine microbenchmarks\n");
    std::printf("(steady_clock, warmup excluded, single run on this machine -- see file header)\n\n");

    // ---- OrderBook -----------------------------------------------------
    {
        xq::OrderBook book;
        const double mid = 2.10;
        constexpr int kLevels = 20;
        for (int i = 0; i < kLevels; ++i) {
            book.upsert(xq::Side::Bid, mid - 0.001 * (i + 1), 500 + i * 10);
            book.upsert(xq::Side::Ask, mid + 0.001 * (i + 1), 500 + i * 10);
        }

        // Steady-state upsert: real book traffic re-quotes a BOUNDED set of
        // price levels (here, the same kLevels ticks each side), not an
        // ever-growing set of distinct prices. Rounding to the existing tick
        // grid keeps this realistic -- unbounded continuous jitter would
        // insert a brand-new map node almost every call (a first version of
        // this benchmark did exactly that, and the resulting multi-hundred-
        // thousand-node book made every later scan-based benchmark
        // pathologically slow against a book no real market ever produces).
        bench("OrderBook::upsert (steady-state)", 1000, 200000, [&](int i) {
            const int level = i % kLevels;
            const double px =
                i % 2 == 0 ? mid - 0.001 * (level + 1) : mid + 0.001 * (level + 1);
            book.upsert(i % 2 == 0 ? xq::Side::Bid : xq::Side::Ask, px, qty_dist(rng));
        });
        bench("OrderBook::mid()", 1000, 200000, [&](int) {
            volatile auto m = book.mid();
            (void)m;
        });
        bench("OrderBook::microprice()", 1000, 200000, [&](int) {
            volatile auto m = book.microprice();
            (void)m;
        });
        bench("OrderBook::imbalance(5)", 1000, 200000, [&](int) {
            volatile auto v = book.imbalance(5);
            (void)v;
        });
        bench("OrderBook::depth_within_bps(10,Ask)", 1000, 200000, [&](int) {
            volatile auto v = book.depth_within_bps(10, xq::Side::Ask);
            (void)v;
        });
        bench("OrderBook::simulate_fill(Ask,5000)", 1000, 100000, [&](int) {
            volatile auto r = book.simulate_fill(xq::Side::Ask, 5000).filled;
            (void)r;
        });
    }

    std::printf("\n");

    // ---- RiskEngine ------------------------------------------------------
    {
        xq::RiskEngine risk;
        double mid = 2.10;
        bench("RiskEngine::on_mark()", 1000, 200000, [&](int i) {
            mid *= 1.0 + 0.0001 * ((i % 7) - 3);
            risk.on_mark(mid);
        });
        bench("RiskEngine::on_fill()", 1000, 200000, [&](int i) {
            risk.on_fill((i % 2 == 0 ? 1.0 : -1.0) * qty_dist(rng), mid);
        });
        bench("RiskEngine::parametric_var()", 1000, 200000, [&](int) {
            volatile double v = risk.parametric_var(mid, 0.99);
            (void)v;
        });
        bench("RiskEngine::historical_var()", 1000, 100000, [&](int) {
            volatile double v = risk.historical_var(mid, 0.99);
            (void)v;
        });
    }

    std::printf("\n");

    // ---- SpscRingBuffer ----------------------------------------------------
    {
        struct Msg { double a, b, c; };
        xq::SpscRingBuffer<Msg> q(1u << 14);
        bench("SpscRingBuffer::push()+pop() (same thread)", 1000, 500000, [&](int i) {
            q.push({static_cast<double>(i), 0.0, 0.0});
            volatile auto v = q.pop().has_value();
            (void)v;
        });
    }

    std::printf("\nDone.\n");
}
