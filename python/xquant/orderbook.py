"""orderbook.py — XRPL DEX order book with microstructure metrics.

Mirrors include/xq/orderbook.hpp. Same XRPL caveats apply: the book is a CLOB
of Offers priced by 'quality' (TakerPays/TakerGets), XRP is integer drops,
offers settle at ledger close (~3-4s), and the native AMM (XLS-30) adds
liquidity a pure CLOB view misses.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from sortedcontainers import SortedDict  # pip install sortedcontainers


class Side(Enum):
    BID = "bid"
    ASK = "ask"


@dataclass
class FillResult:
    filled: float = 0.0
    avg_price: float = 0.0
    slippage_bps: float = 0.0
    complete: bool = False


class OrderBook:
    """Aggregated price-level book. Bids descending, asks ascending."""

    def __init__(self) -> None:
        # SortedDict keeps levels ordered for O(log n) top-of-book access,
        # the Python analogue of the C++ std::map choice (readability over
        # raw speed; the C++ side is the hot path).
        self._bids: SortedDict = SortedDict(lambda p: -p)  # highest first
        self._asks: SortedDict = SortedDict()              # lowest first

    def upsert(self, side: Side, price: float, qty: float) -> None:
        book = self._bids if side is Side.BID else self._asks
        if qty <= 0:
            book.pop(price, None)      # level cleared (offer removed)
        else:
            book[price] = qty

    def clear(self) -> None:
        self._bids.clear()
        self._asks.clear()

    # --- top of book --------------------------------------------------------
    def best_bid(self):
        return self._bids.peekitem(0) if self._bids else None   # (price, qty)

    def best_ask(self):
        return self._asks.peekitem(0) if self._asks else None

    def mid(self):
        if not self._bids or not self._asks:
            return None
        return (self._bids.peekitem(0)[0] + self._asks.peekitem(0)[0]) / 2

    def spread_bps(self):
        if not self._bids or not self._asks:
            return None
        b = self._bids.peekitem(0)[0]
        a = self._asks.peekitem(0)[0]
        return (a - b) / ((a + b) / 2) * 1e4

    def microprice(self):
        """Size-weighted fair value; leans toward the thin side (Stoikov)."""
        if not self._bids or not self._asks:
            return None
        b, qb = self._bids.peekitem(0)
        a, qa = self._asks.peekitem(0)
        tot = qb + qa
        if tot <= 0:
            return (a + b) / 2
        return (a * qb + b * qa) / tot   # weight each price by opposite size

    def imbalance(self, levels: int = 5):
        """Top-N order-book imbalance in [-1, 1]; >0 = bid-heavy."""
        if not self._bids or not self._asks:
            return None
        vb = sum(q for _, q in list(self._bids.items())[:levels])
        va = sum(q for _, q in list(self._asks.items())[:levels])
        tot = vb + va
        return (vb - va) / tot if tot > 0 else None

    def depth_within_bps(self, bps: float, side: Side):
        """Resting size within `bps` of mid = liquidity a taker can absorb."""
        m = self.mid()
        if m is None:
            return None
        acc = 0.0
        if side is Side.ASK:
            lim = m * (1 + bps / 1e4)
            for p, q in self._asks.items():
                if p > lim:
                    break
                acc += q
        else:
            lim = m * (1 - bps / 1e4)
            for p, q in self._bids.items():
                if p < lim:
                    break
                acc += q
        return acc

    def simulate_fill(self, take_side: Side, qty: float) -> FillResult:
        """Walk the book to fill `qty`; return VWAP + slippage vs arrival mid.
        take_side=ASK means we BUY (lift offers). A real market-impact model."""
        m = self.mid()
        book = self._asks if take_side is Side.ASK else self._bids
        remaining, notional = qty, 0.0
        for px, avail in book.items():
            take = min(remaining, avail)
            notional += take * px
            remaining -= take
            if remaining <= 1e-12:
                break
        r = FillResult()
        r.filled = qty - remaining
        r.complete = remaining <= 1e-12
        if r.filled > 0:
            r.avg_price = notional / r.filled
            if m:
                sgn = 1.0 if take_side is Side.ASK else -1.0
                r.slippage_bps = (r.avg_price - m) / m * 1e4 * sgn
        return r

    def take(self, take_side: Side, qty: float) -> FillResult:
        """Same walk as simulate_fill(), but actually CONSUMES the liquidity
        taken -- upserts each touched level down to its remaining size (or
        removes it if fully consumed). Needed for anything that fills more
        than once against the same book (e.g. a multi-child TWAP/VWAP
        execution -- see xquant/execution.py): calling simulate_fill()
        repeatedly against an unmutated book lets each call see the full
        original depth again, double-counting the same resting liquidity
        across child orders. simulate_fill() stays read-only on purpose (for
        "what would happen right now" queries that shouldn't have side
        effects); this is the one that actually happened."""
        m = self.mid()
        book = self._asks if take_side is Side.ASK else self._bids
        remaining, notional = qty, 0.0
        touched: list[tuple[float, float]] = []  # (price, remaining_qty_at_level)
        for px, avail in book.items():
            take = min(remaining, avail)
            notional += take * px
            remaining -= take
            touched.append((px, avail - take))
            if remaining <= 1e-12:
                break
        for px, remaining_qty in touched:
            self.upsert(take_side, px, remaining_qty)

        r = FillResult()
        r.filled = qty - remaining
        r.complete = remaining <= 1e-12
        if r.filled > 0:
            r.avg_price = notional / r.filled
            if m:
                sgn = 1.0 if take_side is Side.ASK else -1.0
                r.slippage_bps = (r.avg_price - m) / m * 1e4 * sgn
        return r
