"""xrpl_feed.py — async XRPL testnet book ingester (research twin of the C++
live client). Polls `book_offers` for both orientations of a pair each ledger
close and feeds an OrderBook.

Run:
    pip install websockets sortedcontainers
    python -m xquant.xrpl_feed <quote_currency_hex> <issuer_address>

Endpoint verified Aug 2026: wss://s.altnet.rippletest.net:51233
Faucet: https://faucet.altnet.rippletest.net/accounts  (testnet resets ~90d)

Caveat carried over from the C++ side: this is a CLOB snapshot per ledger. It
ignores native AMM (XLS-30) liquidity and XRP auto-bridging, and the `quality`
-> quote-per-XRP normalization (x1e6 when the 'gets' leg is XRP) should be
sanity-checked against live numbers.
"""
from __future__ import annotations

import asyncio
import json
import sys

from .orderbook import OrderBook, Side

WS_URL = "wss://s.altnet.rippletest.net:51233"


def _amount_size(amt) -> tuple[float, bool]:
    """Return (size_in_base_units, is_xrp)."""
    if isinstance(amt, str):                 # XRP drops
        return float(amt) / 1_000_000.0, True
    return float(amt["value"]), False        # IOU value


def _load_side(book: OrderBook, side: Side, offers: list) -> None:
    for o in offers:
        gets_size, gets_xrp = _amount_size(o["TakerGets"])
        price = float(o["quality"])
        if gets_xrp:
            price *= 1_000_000.0             # quality -> quote-per-XRP
        if gets_size > 0 and price > 0:
            book.upsert(side, price, gets_size)


async def stream(quote_currency: str, quote_issuer: str) -> None:
    import websockets  # pip install websockets

    bids_req = {
        "id": "bids", "command": "book_offers",
        "taker_gets": {"currency": quote_currency, "issuer": quote_issuer},
        "taker_pays": {"currency": "XRP"}, "limit": 50,
    }
    asks_req = {
        "id": "asks", "command": "book_offers",
        "taker_gets": {"currency": "XRP"},
        "taker_pays": {"currency": quote_currency, "issuer": quote_issuer},
        "limit": 50,
    }
    book = OrderBook()

    async with websockets.connect(WS_URL, ping_interval=20) as ws:
        await ws.send(json.dumps({"id": "sub", "command": "subscribe",
                                  "streams": ["ledger"]}))

        async def refresh():
            book.clear()
            await ws.send(json.dumps(bids_req))
            br = json.loads(await ws.recv())
            _load_side(book, Side.BID, br.get("result", {}).get("offers", []))
            await ws.send(json.dumps(asks_req))
            ar = json.loads(await ws.recv())
            _load_side(book, Side.ASK, ar.get("result", {}).get("offers", []))
            m = book.microprice()
            if m:
                print(f"mid={book.mid():.6f} micro={m:.6f} "
                      f"spread={book.spread_bps():.2f}bps "
                      f"imb={book.imbalance():+.3f}")
            else:
                print("book empty (no test liquidity on this pair yet)")

        await refresh()
        async for raw in ws:
            msg = json.loads(raw)
            if msg.get("type") == "ledgerClosed":
                await refresh()


if __name__ == "__main__":
    ccy = sys.argv[1] if len(sys.argv) > 1 else \
        "524C555344000000000000000000000000000000"  # "RLUSD" in 40-hex
    issuer = sys.argv[2] if len(sys.argv) > 2 else "rISSUERADDRESSGOESHERE"
    asyncio.run(stream(ccy, issuer))
