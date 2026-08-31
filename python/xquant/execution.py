"""execution.py -- institutional execution algorithms: TWAP and VWAP.

The distinction this module exists to make concrete: a retail order is "buy N
now" -- one market order, whatever the book gives you. An institutional desk
managing a parent order large enough to move the market doesn't do that; it
schedules child orders against a participation-rate cap and measures itself
against implementation shortfall (execution price vs. the price that existed
when the decision to trade was made), not just "did it fill."

TWAP (time-weighted average price): slice the parent order into equal-sized
child orders spread evenly over the execution window. The simplest schedule;
right when you have no reliable volume forecast and mainly want to avoid
signaling by dumping the whole order at once.

VWAP (volume-weighted average price): slice by a volume profile instead of
equal time buckets -- trade more in the periods expected to have more organic
volume, so each child order is a smaller fraction of that period's real flow
and market impact is lower. Needs a volume forecast; TWAP doesn't.

Both algorithms here execute each child order against a *live* OrderBook via
simulate_fill(), not a static price -- so participation-rate breaches, partial
fills, and slippage are all real consequences of book depth at execution time,
not assumed away.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .orderbook import OrderBook, Side


@dataclass
class ChildFill:
    """One child order's actual execution against the live book."""

    scheduled_qty: float
    filled_qty: float
    avg_price: float
    slippage_bps: float  # vs. this child's own arrival mid
    complete: bool  # did the book have enough depth for the full child size?


@dataclass
class ExecutionResult:
    algo: str
    total_qty: float
    arrival_price: float  # mid at the moment the PARENT order was decided
    fills: list[ChildFill] = field(default_factory=list)

    @property
    def filled_qty(self) -> float:
        return sum(f.filled_qty for f in self.fills)

    @property
    def vwap(self) -> float:
        """The volume-weighted average price actually achieved."""
        notional = sum(f.filled_qty * f.avg_price for f in self.fills if f.filled_qty > 0)
        qty = self.filled_qty
        return notional / qty if qty > 0 else 0.0

    @property
    def implementation_shortfall_bps(self) -> float:
        """Achieved VWAP vs. arrival price, in bps -- the core institutional
        execution-risk number: how much did *trading* cost, separate from
        whatever the market did on its own during the execution window."""
        if self.arrival_price <= 0 or self.filled_qty <= 0:
            return 0.0
        return (self.vwap - self.arrival_price) / self.arrival_price * 1e4

    @property
    def participation_breaches(self) -> int:
        """Count of child orders that could NOT be filled in full within the
        book depth available -- a proxy for participation-rate violations
        (the child asked for more than the book could absorb without
        walking further than intended)."""
        return sum(1 for f in self.fills if not f.complete)


def twap_schedule(total_qty: float, n_slices: int, max_participation: float = 0.10) -> list[float]:
    """Equal-sized child orders, capped by a participation-rate ceiling.

    `max_participation` bounds each child as a fraction of the PARENT size,
    not of live market volume (this module has no volume feed) -- it's the
    same guardrail in spirit: never let one child order be a size that alone
    would obviously move the book. A real production TWAP would sanity-check
    each slice against live depth (this module's callers do exactly that, via
    ChildFill.complete on the actual simulate_fill() result).
    """
    child = total_qty / n_slices
    capped = min(child, total_qty * max_participation)
    return [capped] * n_slices


def vwap_schedule(total_qty: float, volume_profile: list[float]) -> list[float]:
    """Child order sizes proportional to a volume profile (fractions summing
    to ~1.0 across the execution window, e.g. more weight in the open/close).
    Falls back to equal slicing if the profile sums to zero."""
    total_weight = sum(volume_profile)
    if total_weight <= 0:
        return [total_qty / len(volume_profile)] * len(volume_profile)
    return [total_qty * w / total_weight for w in volume_profile]


def run_execution(
    book: OrderBook,
    side: Side,
    total_qty: float,
    schedule: list[float],
    algo: str,
    price_path: list[OrderBook] | None = None,
) -> ExecutionResult:
    """Walk a schedule of child orders against the book, one at a time.

    `price_path`, if given, supplies a fresh OrderBook snapshot per child
    order (the book moves between child fills in reality); if omitted, every
    child executes against the same static `book` -- fine for a quick
    illustration, understates real slippage on a moving book.
    """
    arrival_mid = book.mid()
    result = ExecutionResult(algo=algo, total_qty=total_qty, arrival_price=arrival_mid or 0.0)

    for i, child_qty in enumerate(schedule):
        child_book = price_path[i] if price_path else book
        child_mid = child_book.mid()
        # take(), not simulate_fill(): each child order must actually consume
        # the liquidity it takes, or every later child in the same schedule
        # sees the original, undiminished book again (the exact bug this
        # module shipped with initially -- see execution.py's own history).
        fill = child_book.take(side, child_qty)
        slippage = 0.0
        if child_mid and fill.filled > 0:
            sign = 1.0 if side is Side.ASK else -1.0
            slippage = (fill.avg_price - child_mid) / child_mid * 1e4 * sign
        result.fills.append(
            ChildFill(
                scheduled_qty=child_qty,
                filled_qty=fill.filled,
                avg_price=fill.avg_price,
                slippage_bps=slippage,
                complete=fill.complete,
            )
        )
    return result
