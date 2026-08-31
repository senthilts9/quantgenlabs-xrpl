"""finmath.py — a BA II Plus in Python.

Everything the TI BA II Plus does, as clean functions you can run in an interview
instead of a calculator: time-value-of-money, NPV, IRR, MIRR, rate conversion,
bond pricing/yield, and duration/convexity.

Sign convention (same as the BA II): money you RECEIVE is positive, money you PAY
is negative. So a loan you take out has a positive PV and negative PMT.

Pure standard library — `python finmath.py` runs the self-tests at the bottom.
"""
from __future__ import annotations

import math
from typing import Sequence


# ---------------------------------------------------------------------------
# Time value of money  (BA II Plus: N, I/Y, PV, PMT, FV)
# ---------------------------------------------------------------------------
def _annuity_pv_factor(i: float, n: float, when: float) -> float:
    """PV of a $1 annuity. when=0 ordinary (END), when=1 due (BGN)."""
    if i == 0:
        return n
    return (1 - (1 + i) ** -n) / i * (1 + i * when)


def fv(i: float, n: float, pv: float, pmt: float = 0.0, when: float = 0) -> float:
    """Future value. `i` is the PER-PERIOD rate (e.g. 0.06/12 for monthly)."""
    if i == 0:
        return -(pv + pmt * n)
    return -(pv * (1 + i) ** n + pmt * (1 + i * when) * ((1 + i) ** n - 1) / i)


def pv(i: float, n: float, pmt: float = 0.0, fv_: float = 0.0, when: float = 0) -> float:
    """Present value."""
    if i == 0:
        return -(fv_ + pmt * n)
    return -(fv_ + pmt * (1 + i * when) * ((1 + i) ** n - 1) / i) / (1 + i) ** n


def pmt(i: float, n: float, pv_: float, fv_: float = 0.0, when: float = 0) -> float:
    """Level payment."""
    if i == 0:
        return -(pv_ + fv_) / n
    return -(pv_ * (1 + i) ** n + fv_) / ((1 + i * when) * ((1 + i) ** n - 1) / i)


def nper(i: float, pmt_: float, pv_: float, fv_: float = 0.0, when: float = 0) -> float:
    """Number of periods."""
    if i == 0:
        return -(pv_ + fv_) / pmt_
    z = pmt_ * (1 + i * when) / i
    return math.log((z - fv_) / (z + pv_)) / math.log(1 + i)


def rate(n: float, pmt_: float, pv_: float, fv_: float = 0.0, when: float = 0,
         guess: float = 0.05) -> float:
    """Per-period interest rate (I/Y), solved numerically."""
    def f(i: float) -> float:
        return pv(i, n, pmt_, fv_, when) - pv_
    return _solve(f, guess)


# ---------------------------------------------------------------------------
# Cash-flow worksheet  (NPV / IRR / MIRR)
# CF[0] is the time-0 flow (undiscounted), like the BA II CF worksheet.
# ---------------------------------------------------------------------------
def npv(rate_: float, cashflows: Sequence[float]) -> float:
    return sum(cf / (1 + rate_) ** t for t, cf in enumerate(cashflows))


def irr(cashflows: Sequence[float], guess: float = 0.1) -> float:
    """Internal rate of return: the rate where NPV = 0."""
    f = lambda r: npv(r, cashflows)
    try:
        return _solve(f, guess)
    except ValueError:
        return _bisect_irr(cashflows)


def mirr(cashflows: Sequence[float], finance_rate: float, reinvest_rate: float) -> float:
    """Modified IRR: negatives financed at `finance_rate`, positives reinvested
    at `reinvest_rate`."""
    n = len(cashflows) - 1
    pv_neg = sum(cf / (1 + finance_rate) ** t
                 for t, cf in enumerate(cashflows) if cf < 0)
    fv_pos = sum(cf * (1 + reinvest_rate) ** (n - t)
                 for t, cf in enumerate(cashflows) if cf > 0)
    return (fv_pos / -pv_neg) ** (1 / n) - 1


# ---------------------------------------------------------------------------
# Interest-rate conversion  (BA II Plus: ICONV — NOM / EFF)
# ---------------------------------------------------------------------------
def nominal_to_effective(nominal: float, m: int) -> float:
    """Nominal annual rate compounded m times -> effective annual rate."""
    return (1 + nominal / m) ** m - 1


def effective_to_nominal(effective: float, m: int) -> float:
    """Effective annual rate -> nominal annual rate compounded m times."""
    return m * ((1 + effective) ** (1 / m) - 1)


# ---------------------------------------------------------------------------
# Bond worksheet  (price, yield, duration, convexity)
# ---------------------------------------------------------------------------
def bond_price(face: float, coupon_rate: float, ytm: float,
               n_periods: int, freq: int = 2) -> float:
    """Price of a plain vanilla bond. coupon_rate & ytm are ANNUAL."""
    c = face * coupon_rate / freq
    y = ytm / freq
    price = sum(c / (1 + y) ** t for t in range(1, n_periods + 1))
    price += face / (1 + y) ** n_periods
    return price


def bond_ytm(price: float, face: float, coupon_rate: float,
             n_periods: int, freq: int = 2, guess: float = 0.05) -> float:
    """Yield to maturity (annual) given a market price."""
    f = lambda y: bond_price(face, coupon_rate, y, n_periods, freq) - price
    return _solve(f, guess)


def bond_durations(face: float, coupon_rate: float, ytm: float,
                   n_periods: int, freq: int = 2) -> dict:
    """Macaulay & modified duration (years) and convexity."""
    c = face * coupon_rate / freq
    y = ytm / freq
    price = bond_price(face, coupon_rate, ytm, n_periods, freq)
    mac = 0.0
    conv = 0.0
    for t in range(1, n_periods + 1):
        cf = c + (face if t == n_periods else 0.0)
        pv_cf = cf / (1 + y) ** t
        mac += t * pv_cf
        conv += t * (t + 1) * cf / (1 + y) ** (t + 2)
    mac_years = (mac / price) / freq
    mod_years = mac_years / (1 + y)
    convexity = (conv / price) / (freq ** 2)
    return {"macaulay": mac_years, "modified": mod_years, "convexity": convexity}


# ---------------------------------------------------------------------------
# Amortization schedule
# ---------------------------------------------------------------------------
def amortization(principal: float, annual_rate: float, n_periods: int,
                 freq: int = 12) -> list[dict]:
    """Row per period: payment, interest, principal, remaining balance."""
    i = annual_rate / freq
    p = pmt(i, n_periods, principal)          # negative (money out)
    bal, rows = principal, []
    for k in range(1, n_periods + 1):
        interest = bal * i
        principal_paid = -p - interest
        bal -= principal_paid
        rows.append({"period": k, "payment": -p, "interest": interest,
                     "principal": principal_paid, "balance": max(bal, 0.0)})
    return rows


# ---------------------------------------------------------------------------
# Root-finding helpers (Newton with bisection fallback)
# ---------------------------------------------------------------------------
def _solve(f, guess: float, tol: float = 1e-10, itmax: int = 100) -> float:
    x = guess
    for _ in range(itmax):
        fx = f(x)
        if abs(fx) < tol:
            return x
        h = 1e-6
        dfx = (f(x + h) - f(x - h)) / (2 * h)
        if dfx == 0:
            break
        x_new = x - fx / dfx
        if abs(x_new - x) < tol:
            return x_new
        x = x_new
    raise ValueError("Newton did not converge; try bisection")


def _bisect_irr(cashflows, lo=-0.9999, hi=10.0, tol=1e-10, itmax=200):
    f = lambda r: npv(r, cashflows)
    flo, fhi = f(lo), f(hi)
    if flo * fhi > 0:
        raise ValueError("No sign change in bracket; IRR may not exist / be unique")
    for _ in range(itmax):
        mid = (lo + hi) / 2
        fm = f(mid)
        if abs(fm) < tol:
            return mid
        if flo * fm < 0:
            hi, fhi = mid, fm
        else:
            lo, flo = mid, fm
    return (lo + hi) / 2


# ---------------------------------------------------------------------------
# Self-tests / worked examples
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    def approx(a, b, t=1e-2):
        return abs(a - b) < t

    # 1) $1,000 invested 10y at 5% annual -> ~$1,628.89
    v = fv(0.05, 10, pv=-1000)
    print(f"FV of 1000 @5% x10y = {v:,.2f}")
    assert approx(v, 1628.89)

    # 2) 200k mortgage, 6% annual / monthly, 30y -> payment ~ -1,199.10
    p = pmt(0.06 / 12, 360, 200_000)
    print(f"Mortgage payment      = {p:,.2f}")
    assert approx(p, -1199.10)

    # 3) IRR of [-1000, 300, 420, 680] -> ~16.34%
    r = irr([-1000, 300, 420, 680])
    print(f"IRR                   = {r*100:.2f}%")
    assert approx(r, 0.1634, 1e-3)

    # 4) 6% nominal, monthly compounding -> effective ~6.1678%
    eff = nominal_to_effective(0.06, 12)
    print(f"Effective annual rate = {eff*100:.4f}%")
    assert approx(eff, 0.061678, 1e-4)

    # 5) 5y 5% semi-annual coupon bond, 6% YTM, face 100 -> price ~95.73
    pr = bond_price(100, 0.05, 0.06, 10, 2)
    print(f"Bond price            = {pr:,.2f}")
    assert approx(pr, 95.73, 5e-2)

    # round-trip: price -> ytm -> should recover 6%
    y = bond_ytm(pr, 100, 0.05, 10, 2)
    print(f"Recovered YTM         = {y*100:.4f}%")
    assert approx(y, 0.06, 1e-4)

    d = bond_durations(100, 0.05, 0.06, 10, 2)
    print(f"Macaulay / modified   = {d['macaulay']:.3f} / {d['modified']:.3f} yrs, "
          f"convexity {d['convexity']:.3f}")

    print("\nAll self-tests passed.")
