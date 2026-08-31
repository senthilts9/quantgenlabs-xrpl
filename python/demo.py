"""demo.py — offline walkthrough of the xquant research library.

Runs a synthetic XRP/RLUSD market, maintains the book, tracks inventory risk,
and prints Avellaneda-Stoikov optimal quotes that skew as inventory builds.
No network required.

    pip install numpy scipy sortedcontainers
    python demo.py
"""
from __future__ import annotations

import numpy as np

from xquant import OrderBook, RiskEngine, AvellanedaStoikov, Side


def main() -> None:
    rng = np.random.default_rng(7)
    book = OrderBook()
    risk = RiskEngine(vol_window=512)
    mm = AvellanedaStoikov(gamma=0.15, kappa=1.5)

    mid = 2.10          # RLUSD per XRP
    inventory = 0.0     # XRP held by the desk

    print(f"{'step':>4} {'mid':>8} {'sigma%':>7} {'inv(XRP)':>9} "
          f"{'resv':>8} {'bid':>8} {'ask':>8} {'skew(bps)':>9} "
          f"{'VaR99':>8} {'CVaR99':>8}")

    for i in range(1, 601):
        # random-walk mid + refresh a few book levels each side
        mid *= float(np.exp(rng.normal(0, 0.0007)))
        half = mid * 0.0004
        book.clear()
        for lvl in range(6):
            off = half + lvl * mid * 0.0003
            book.upsert(Side.BID, mid - off, float(rng.uniform(500, 5000)))
            book.upsert(Side.ASK, mid + off, float(rng.uniform(500, 5000)))

        m = book.microprice() or mid
        risk.on_mark(m)

        # Occasionally we get filled providing liquidity -> inventory moves.
        if i % 25 == 0:
            signed = float(rng.choice([-1, 1]) * rng.uniform(2000, 8000))
            risk.on_fill(signed, m)
            inventory = risk.pos.xrp

        sigma = np.sqrt(risk._ewma_var) if risk._ewma_var > 0 else 0.0007
        q = mm.quote(mid=m, inventory=inventory / 10000.0, sigma=sigma,
                     time_to_horizon=1.0)

        if i % 50 == 0:
            print(f"{i:>4} {m:>8.4f} {sigma*100:>7.3f} {inventory:>9.0f} "
                  f"{q.reservation_price:>8.4f} {q.bid:>8.4f} {q.ask:>8.4f} "
                  f"{q.inventory_skew/m*1e4:>9.2f} "
                  f"{risk.parametric_var(m):>8.2f} {risk.cvar(m):>8.2f}")

    print("\nNote how the reservation price (resv) and quotes skew AWAY from "
          "mid as inventory builds — that skew is the model lightening the "
          "desk's position instead of doubling down.")


if __name__ == "__main__":
    main()
