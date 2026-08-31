"""demo_execution.py -- institutional execution (TWAP) vs. a retail market
order, against the same starting book and the same total size, run twice:
once against a single static snapshot (what a retail market order actually
faces -- it fills now, it doesn't get to wait for the book to refill), and
once against a book that replenishes between child orders (what an
institutional TWAP schedule actually relies on -- see xquant/execution.py's
own module docstring for why slicing alone, against an unmoving book, does
NOT help: this demo's own numbers made exactly that mistake on the first
draft and are the reason the comparison below is done both ways).

No network required.

    pip install sortedcontainers
    python demo_execution.py
"""
from __future__ import annotations

import random

from xquant.orderbook import OrderBook, Side
from xquant.execution import ExecutionResult, run_execution, twap_schedule


def fresh_book(mid: float = 2.10, seed_offset: int = 0) -> OrderBook:
    rng = random.Random(7 + seed_offset)
    book = OrderBook()
    for lvl in range(6):
        off = 0.0004 * mid + lvl * 0.0003 * mid
        book.upsert(Side.BID, mid - off, 500 + rng.random() * 2500)
        book.upsert(Side.ASK, mid + off, 500 + rng.random() * 2500)
    return book


def report(label: str, result: ExecutionResult) -> None:
    print(f"{label}")
    print(
        f"  filled={result.filled_qty:>7.0f} / {result.total_qty:.0f} XRP   "
        f"vwap={result.vwap:.5f}   "
        f"implementation shortfall={result.implementation_shortfall_bps:+.2f} bps   "
        f"participation breaches={result.participation_breaches}"
    )


def main() -> None:
    total_qty = 40_000.0  # a size large enough to walk this book's depth
    n_slices = 10

    print("=== Buying 40,000 XRP: retail market order vs. institutional TWAP ===\n")

    # Retail: the whole size against ONE static book snapshot. A market
    # order fills against whatever's resting right now -- it doesn't get to
    # wait for the book to refill mid-fill.
    retail_book = fresh_book()
    retail_fill = retail_book.take(Side.ASK, total_qty)
    retail_result = ExecutionResult(algo="retail (single market order)", total_qty=total_qty, arrival_price=2.10)
    from xquant.execution import ChildFill

    retail_result.fills.append(
        ChildFill(
            scheduled_qty=total_qty,
            filled_qty=retail_fill.filled,
            avg_price=retail_fill.avg_price,
            slippage_bps=retail_fill.slippage_bps,
            complete=retail_fill.complete,
        )
    )
    report("Retail -- one market order, one snapshot:", retail_result)

    print()
    print(
        "First comparison point: TWAP against a book that never refills between\n"
        "child orders (the mistake this demo caught on its own first draft --\n"
        "see xquant/execution.py's module docstring). Slicing alone changes\n"
        "NOTHING if the book can't replenish: same levels, same order, same VWAP."
    )
    static_book = fresh_book()
    static_path = [static_book] * n_slices  # deliberately the SAME book object
    static_result = run_execution(
        static_book, Side.ASK, total_qty, twap_schedule(total_qty, n_slices), algo="TWAP (static book)",
        price_path=static_path,
    )
    report("TWAP -- same static book reused every child order:", static_result)

    print()
    print(
        "Second comparison point: TWAP against a book that replenishes between\n"
        "child orders -- the actual mechanism institutional execution relies on."
    )
    replenishing_path = [fresh_book(seed_offset=i + 1) for i in range(n_slices)]
    replenishing_result = run_execution(
        fresh_book(), Side.ASK, total_qty, twap_schedule(total_qty, n_slices), algo="TWAP (replenishing book)",
        price_path=replenishing_path,
    )
    report("TWAP -- book replenishes between child orders:", replenishing_result)

    print()
    print(
        "Takeaway: the institutional edge isn't the slicing by itself -- it's spreading\n"
        "execution over TIME so the book can refill. A retail-style single order and a\n"
        "TWAP against a frozen book both walk the same static depth and land on the same\n"
        "price. The realistic TWAP fills completely, at better average price, with zero\n"
        "participation-rate breaches, because time was actually spent."
    )


if __name__ == "__main__":
    main()
