// sim_main.cpp
// Offline demonstration -- compiles and runs with NO network and NO external
// deps (g++ -std=c++20). It drives the same OrderBook + RiskEngine you'd feed
// from the live XRPL WebSocket, using a synthetic event stream so you can demo
// and talk through the engine even without a testnet connection.
//
// The architecture mirrors production: a "feed" thread produces book events
// into a lock-free SPSC queue; a "strategy" thread consumes them, updates the
// book, refreshes risk, and prints metrics. Swap the synthetic producer for
// xrpl_ws_client.cpp to go live.
#include "xq/orderbook.hpp"
#include "xq/ring_buffer.hpp"
#include "xq/risk.hpp"

#include <atomic>
#include <cstdio>
#include <random>
#include <thread>

using namespace xq;

// One decoded book event handed across the thread boundary.
struct BookEvent {
    enum Type { Upsert, Trade, Clear } type;   // Clear = start of a new ledger
    Side  side;
    Price px;
    Qty   qty;         // Upsert: resting size. Trade: signed executed size.
};

int main() {
    SpscRingBuffer<BookEvent> queue(1u << 14);   // 16384 slots, power of two
    std::atomic<bool> done{false};

    // ---- Producer: synthetic XRP/RLUSD book around a random-walk mid -------
    std::thread feed([&] {
        std::mt19937 rng(42);
        std::normal_distribution<double> shock(0.0, 0.0007);   // ~7bps steps
        std::uniform_real_distribution<double> usz(500, 5000); // XRP sizes
        double mid = 2.10;                                     // RLUSD per XRP
        for (int i = 0; i < 4000; ++i) {
            queue.push({BookEvent::Clear, Side::Bid, 0, 0});   // new ledger: wipe old book
            mid *= std::exp(shock(rng));
            const double half = mid * 0.0004;                  // ~4bps half-spread
            // Refresh a few levels each side.
            for (int lvl = 0; lvl < 6; ++lvl) {
                const double off = half + lvl * mid * 0.0003;
                queue.push({BookEvent::Upsert, Side::Bid, mid - off, usz(rng)});
                queue.push({BookEvent::Upsert, Side::Ask, mid + off, usz(rng)});
            }
            // Occasionally the desk gets lifted / hit (a fill against us).
            if (i % 50 == 0) {
                const double sgn = (i % 100 == 0) ? +1.0 : -1.0;
                queue.push({BookEvent::Trade, Side::Ask, mid, sgn * usz(rng)});
            }
            std::this_thread::sleep_for(std::chrono::microseconds(200));
        }
        done.store(true, std::memory_order_release);
    });

    // ---- Consumer: book + risk + reporting ---------------------------------
    OrderBook book;
    RiskEngine risk(/*vol_window=*/512, /*ewma_lambda=*/0.94);
    long ledgers = 0;

    while (!done.load(std::memory_order_acquire) || true) {
        auto ev = queue.pop();
        if (!ev) {
            if (done.load(std::memory_order_acquire)) break;
            std::this_thread::yield();
            continue;
        }
        switch (ev->type) {
        case BookEvent::Upsert:
            book.upsert(ev->side, ev->px, ev->qty);
            break;
        case BookEvent::Trade:               // we provided liquidity; inventory moves
            if (auto m = book.mid()) risk.on_fill(ev->qty, *m);
            break;
        case BookEvent::Clear:
            // The book for the ledger just gone is complete here: mark & report
            // once, THEN wipe it for the next ledger. Guarantees an uncrossed book.
            if (auto m = book.microprice()) {
                risk.on_mark(*m);
                if (++ledgers % 300 == 0) {
                    auto fill = book.simulate_fill(Side::Ask, 50000);  // buy 50k XRP
                    std::printf(
                        "mid=%.5f spread=%.2fbps imb=%+.3f | "
                        "buy50k: vwap=%.5f slip=%.2fbps filled=%.0f | "
                        "inv=%.0f XRP  VaR99(param)=%.4f  maxDD=%.2f  volann=%.1f%%\n",
                        book.mid().value_or(0.0), book.spread_bps().value_or(0.0),
                        book.imbalance(5).value_or(0.0), fill.avg_price,
                        fill.slippage_bps, fill.filled, risk.position().xrp,
                        risk.parametric_var(*m, 0.99), risk.max_drawdown(),
                        risk.ewma_vol_annualized() * 100.0);
                }
            }
            book.clear();
            break;
        }
    }

    feed.join();
    std::puts("done.");
    return 0;
}
