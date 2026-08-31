"""market_making.py — Avellaneda-Stoikov optimal quoting.

This is the formal answer to the LP tension: earn the spread, but skew quotes
against inventory so you don't accumulate a position that blows up when the
market moves. It's the model a Ripple-Prime-style desk would prototype here in
Python before hardening in C++.

Avellaneda & Stoikov (2008):

    reservation price   r = s - q * gamma * sigma^2 * (T - t)
    optimal total spread  = gamma * sigma^2 * (T - t) + (2/gamma) * ln(1 + gamma/kappa)
    bid = r - spread/2 ,  ask = r + spread/2

Intuition:
  * `s`      mid (or microprice).
  * `q`      inventory in base units (XRP). Long inventory pushes the whole
             quote DOWN (r < s) so you're keener to SELL and lighten up — that
             skew is the model managing inventory risk for you.
  * `gamma`  risk aversion. Higher gamma => wider spread, sharper skew.
  * `sigma`  volatility (feed it the RiskEngine's EWMA vol).
  * `T - t`  time to your risk horizon, normalized to [0, 1]. On XRPL you
             re-quote roughly every ledger (~4s), so a natural horizon is the
             session or a fixed lookahead.
  * `kappa`  order-flow liquidity: how fast fill probability decays with
             distance from mid. Higher kappa (deeper book) => tighter spread.
"""
from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass
class Quote:
    bid: float
    ask: float
    reservation_price: float
    half_spread: float
    inventory_skew: float   # r - s : how far inventory pushed the quote


@dataclass
class AvellanedaStoikov:
    gamma: float = 0.1      # inventory risk aversion
    kappa: float = 1.5      # order-book liquidity / fill-intensity decay

    def quote(
        self,
        mid: float,
        inventory: float,
        sigma: float,
        time_to_horizon: float = 1.0,
    ) -> Quote:
        """Return optimal bid/ask around `mid` given current inventory."""
        var_term = self.gamma * sigma * sigma * time_to_horizon
        reservation = mid - inventory * var_term          # skew from inventory
        total_spread = var_term + (2.0 / self.gamma) * math.log1p(self.gamma / self.kappa)
        half = total_spread / 2.0
        return Quote(
            bid=reservation - half,
            ask=reservation + half,
            reservation_price=reservation,
            half_spread=half,
            inventory_skew=reservation - mid,
        )

    def spread_bps(self, mid: float, sigma: float, time_to_horizon: float = 1.0) -> float:
        """The model's total spread expressed in basis points of mid."""
        var_term = self.gamma * sigma * sigma * time_to_horizon
        total = var_term + (2.0 / self.gamma) * math.log1p(self.gamma / self.kappa)
        return total / mid * 1e4
