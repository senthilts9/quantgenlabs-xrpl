"""risk.py — market-maker risk measures for an XRPL / Ripple Prime desk.

Mirrors include/xq/risk.hpp and adds CVaR (expected shortfall), which is the
coherent risk measure a modern desk prefers over VaR because it averages the
tail beyond the quantile instead of ignoring it.

Dominant risk on an RLUSD-settled book = XRP inventory carried across the
~4s settlement window. All measures below sit on that XRP leg.
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field

import numpy as np


@dataclass
class Position:
    xrp: float = 0.0            # bridge-asset inventory (the risky leg)
    rlusd: float = 0.0          # stablecoin/cash leg (~peg)
    avg_cost_xrp: float = 0.0   # VWAP cost in RLUSD/XRP


@dataclass
class RiskEngine:
    vol_window: int = 512
    ewma_lambda: float = 0.94   # RiskMetrics decay
    pos: Position = field(default_factory=Position)

    def __post_init__(self):
        self._returns: deque[float] = deque(maxlen=self.vol_window)
        self._ewma_var = 0.0
        self._last_mark = 0.0
        self._peak_equity = 0.0
        self._max_dd = 0.0

    # --- flow ---------------------------------------------------------------
    def on_fill(self, signed_qty: float, price: float) -> None:
        """signed_qty > 0 = we bought XRP at `price` RLUSD/XRP."""
        new_xrp = self.pos.xrp + signed_qty
        if (self.pos.xrp >= 0) == (signed_qty >= 0) and new_xrp != 0:
            self.pos.avg_cost_xrp = (
                self.pos.avg_cost_xrp * self.pos.xrp + price * signed_qty
            ) / new_xrp
        elif new_xrp == 0:
            self.pos.avg_cost_xrp = 0.0
        self.pos.xrp = new_xrp
        self.pos.rlusd -= signed_qty * price   # cash moves opposite

    def on_mark(self, price: float) -> None:
        if self._last_mark > 0:
            ret = np.log(price / self._last_mark)
            self._returns.append(ret)
            self._ewma_var = (
                self.ewma_lambda * self._ewma_var
                + (1 - self.ewma_lambda) * ret * ret
            )
        self._last_mark = price
        eq = self.equity(price)
        self._peak_equity = max(self._peak_equity, eq)
        self._max_dd = max(self._max_dd, self._peak_equity - eq)

    # --- marks --------------------------------------------------------------
    def equity(self, mark: float) -> float:
        return self.pos.rlusd + self.pos.xrp * mark

    def unrealized_pnl(self, mark: float) -> float:
        return self.pos.xrp * (mark - self.pos.avg_cost_xrp)

    def inventory_exposure(self, mark: float) -> float:
        return self.pos.xrp * mark

    def ewma_vol_annualized(self, marks_per_year: float = 7.9e6) -> float:
        # ~7.9M ledgers/yr at a ~4s close.
        return float(np.sqrt(self._ewma_var * marks_per_year))

    # --- tail risk ----------------------------------------------------------
    def parametric_var(self, mark: float, conf: float = 0.99) -> float:
        from scipy.stats import norm  # local import keeps base deps light
        z = norm.ppf(conf)
        sigma_step = np.sqrt(self._ewma_var)
        return abs(self.inventory_exposure(mark)) * z * sigma_step

    def historical_var(self, mark: float, conf: float = 0.99) -> float:
        if len(self._returns) < 20:
            return 0.0
        q = np.quantile(np.array(self._returns), 1 - conf)  # negative tail
        return abs(self.inventory_exposure(mark)) * abs(q)

    def cvar(self, mark: float, conf: float = 0.99) -> float:
        """Expected shortfall: mean loss BEYOND the VaR quantile. Coherent
        risk measure; captures fat-tail severity VaR alone hides."""
        if len(self._returns) < 20:
            return 0.0
        r = np.array(self._returns)
        thresh = np.quantile(r, 1 - conf)
        tail = r[r <= thresh]
        if tail.size == 0:
            return 0.0
        return abs(self.inventory_exposure(mark)) * abs(tail.mean())
