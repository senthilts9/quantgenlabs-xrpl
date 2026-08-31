"""xquant — research-layer quant library mirroring the C++ engine.

The narrative for the interview: quants PROTOTYPE and research in Python, then
PRODUCTIONIZE the hot path in C++. This package is the research twin of the
xrpl-quant C++ engine — same order-book microstructure, same risk measures,
plus an Avellaneda-Stoikov market-making model for optimal quoting on an
inventory-carrying desk (e.g. Ripple Prime).

Modules:
    orderbook      — DEX book + microstructure metrics
    risk           — inventory, EWMA vol, VaR, CVaR, drawdown
    market_making  — Avellaneda-Stoikov reservation price + optimal spread
    xrpl_feed      — async XRPL testnet book_offers ingester
"""
from .orderbook import OrderBook, Side, FillResult
from .risk import RiskEngine
from .market_making import AvellanedaStoikov, Quote

__all__ = [
    "OrderBook", "Side", "FillResult",
    "RiskEngine",
    "AvellanedaStoikov", "Quote",
]
