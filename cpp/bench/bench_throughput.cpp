// bench_throughput.cpp -- sustained-throughput benchmarks, distinct from
// bench_main.cpp's per-operation latency numbers. A per-op p50 doesn't prove a
// sustained-rate claim (cache/branch-predictor state, allocator behavior, and
// cross-thread handoff cost all change under real sustained load) -- this
// measures wall-clock throughput directly instead of inferring it by summing
// isolated per-op medians.
//
// Two workloads:
//   1. Single-threaded "full tick" -- one simulated ledger close: clear the
//      book, re-quote 6 levels/side, read mid+microprice, mark the risk
//      engine. This is the actual per-ledger workload sim_main.cpp's
//      consumer performs, run back-to-back with no artificial delay.
//   2. Two-thread SPSC producer/consumer -- a real cross-thread handoff
//      (not same-thread push+pop, which hides the cache-coherency cost of
//      one core signaling another), sustained for a fixed duration.
//
// Same honesty note as bench_main.cpp: single run, general-purpose laptop,
// no CPU pinning. Report what's measured, not what's hoped for.
#include "xq/orderbook.hpp"
#include "xq/risk.hpp"
#include "xq/ring_buffer.hpp"

#include <atomic>
#include <chrono>
#include <cstdio>
#include <random>
#include <thread>

using Clock = std::chrono::steady_clock;

namespace {

// Runs `tick` back-to-back for `duration` wall-clock time, returns count.
template <typename Fn>
long long run_for(std::chrono::milliseconds duration, Fn tick) {
    const auto deadline = Clock::now() + duration;
    long long count = 0;
    // Check the clock every 4096 ticks, not every tick -- Clock::now() itself
    // costs ~20-40ns, and checking it every iteration would measurably bias
    // the throughput number downward by counting its own overhead.
    while (true) {
        for (int i = 0; i < 4096; ++i) {
            tick();
            ++count;
        }
        if (Clock::now() >= deadline) break;
    }
    return count;
}

}  // namespace

int main() {
    std::printf("qgl-xrpl throughput benchmarks\n");
    std::printf("(wall-clock sustained rate, not summed per-op medians -- see file header)\n\n");

    // ---- 1. Single-threaded full-tick throughput --------------------------
    {
        xq::OrderBook book;
        xq::RiskEngine risk;
        std::mt19937 rng(7);
        std::uniform_real_distribution<double> qty_dist(500, 5000);
        double mid = 2.10;

        const auto duration = std::chrono::milliseconds(2000);
        const long long ticks = run_for(duration, [&]() {
            mid *= 1.0 + 0.0001 * (static_cast<int>(rng() % 7) - 3);
            book.clear();
            const double half = mid * 0.0004;
            for (int lvl = 0; lvl < 6; ++lvl) {
                const double off = half + lvl * mid * 0.0003;
                book.upsert(xq::Side::Bid, mid - off, qty_dist(rng));
                book.upsert(xq::Side::Ask, mid + off, qty_dist(rng));
            }
            if (auto m = book.microprice()) risk.on_mark(*m);
        });

        const double sec = std::chrono::duration<double>(duration).count();
        const double rate = ticks / sec;
        std::printf("Full tick (clear+12 upserts+mid+microprice+on_mark):\n");
        std::printf("  %lld ticks in %.3fs = %.0f ticks/sec (%.1f ns/tick)\n\n", ticks, sec, rate,
                    1e9 / rate);
    }

    // ---- 2. Two-thread SPSC producer/consumer throughput ------------------
    {
        struct Msg { double px; double qty; int side; };
        xq::SpscRingBuffer<Msg> queue(1u << 16);
        std::atomic<bool> stop{false};
        std::atomic<long long> produced{0};
        std::atomic<long long> consumed{0};
        std::atomic<long long> dropped{0};  // push() returned false (queue full)

        std::thread producer([&] {
            Msg m{2.10, 1000.0, 0};
            while (!stop.load(std::memory_order_relaxed)) {
                if (queue.push(m)) produced.fetch_add(1, std::memory_order_relaxed);
                else dropped.fetch_add(1, std::memory_order_relaxed);
            }
        });
        std::thread consumer([&] {
            while (!stop.load(std::memory_order_relaxed)) {
                if (queue.pop()) consumed.fetch_add(1, std::memory_order_relaxed);
            }
            // Drain whatever's left after stop is signaled.
            while (queue.pop()) consumed.fetch_add(1, std::memory_order_relaxed);
        });

        std::this_thread::sleep_for(std::chrono::milliseconds(2000));
        stop.store(true, std::memory_order_relaxed);
        producer.join();
        consumer.join();

        const double sec = 2.0;
        std::printf("SpscRingBuffer, real cross-thread producer/consumer:\n");
        std::printf("  produced=%lld  consumed=%lld  dropped(queue-full)=%lld  in %.1fs\n",
                    produced.load(), consumed.load(), dropped.load(), sec);
        const double rate = consumed.load() / sec;
        std::printf("  = %.0f messages/sec consumed\n\n", rate);
    }

    std::printf("Done.\n");
}
