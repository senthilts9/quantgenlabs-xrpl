// orderbook.js -- aggregated price-level book + microstructure metrics.
// Ported from orderbook.py / orderbook.hpp / xrpl-desk.html's inline Map
// version; behavior kept identical across all three, this is just the one
// canonical JS copy.

export const Side = { BID: 'bid', ASK: 'ask' };

export class OrderBook {
  constructor() {
    this.bids = new Map(); // price -> qty
    this.asks = new Map();
  }

  upsert(side, price, qty) {
    const book = side === Side.BID ? this.bids : this.asks;
    if (qty <= 0) book.delete(price);
    else book.set(price, qty);
  }

  clear() {
    this.bids.clear();
    this.asks.clear();
  }

  sortedBids() {
    return [...this.bids.entries()].sort((a, b) => b[0] - a[0]); // highest first
  }

  sortedAsks() {
    return [...this.asks.entries()].sort((a, b) => a[0] - b[0]); // lowest first
  }

  bestBid() {
    const b = this.sortedBids();
    return b.length ? b[0] : null;
  }

  bestAsk() {
    const a = this.sortedAsks();
    return a.length ? a[0] : null;
  }

  mid() {
    const b = this.bestBid();
    const a = this.bestAsk();
    return b && a ? (b[0] + a[0]) / 2 : null;
  }

  spreadBps() {
    const b = this.bestBid();
    const a = this.bestAsk();
    if (!b || !a) return null;
    return ((a[0] - b[0]) / ((a[0] + b[0]) / 2)) * 1e4;
  }

  // Size-weighted fair value, leaning toward the thin side (Stoikov).
  microprice() {
    const b = this.bestBid();
    const a = this.bestAsk();
    if (!b || !a) return null;
    const [bp, bq] = b;
    const [ap, aq] = a;
    const tot = bq + aq;
    if (tot <= 0) return (ap + bp) / 2;
    return (ap * bq + bp * aq) / tot;
  }

  // Top-N order-book imbalance in [-1, 1]; >0 = bid-heavy.
  imbalance(levels = 5) {
    const b = this.sortedBids().slice(0, levels);
    const a = this.sortedAsks().slice(0, levels);
    if (!b.length || !a.length) return null;
    const vb = b.reduce((s, [, q]) => s + q, 0);
    const va = a.reduce((s, [, q]) => s + q, 0);
    const tot = vb + va;
    return tot > 0 ? (vb - va) / tot : null;
  }

  depthWithinBps(bps, side) {
    const m = this.mid();
    if (m == null) return null;
    let acc = 0;
    if (side === Side.ASK) {
      const lim = m * (1 + bps / 1e4);
      for (const [p, q] of this.sortedAsks()) {
        if (p > lim) break;
        acc += q;
      }
    } else {
      const lim = m * (1 - bps / 1e4);
      for (const [p, q] of this.sortedBids()) {
        if (p < lim) break;
        acc += q;
      }
    }
    return acc;
  }

  // Walk the book to fill `qty` on `takeSide` (ASK = we buy, lifting offers).
  // Returns VWAP + slippage vs arrival mid -- a real market-impact model.
  simulateFill(takeSide, qty) {
    const m = this.mid();
    const book = takeSide === Side.ASK ? this.sortedAsks() : this.sortedBids();
    let remaining = qty;
    let notional = 0;
    for (const [px, avail] of book) {
      const take = Math.min(remaining, avail);
      notional += take * px;
      remaining -= take;
      if (remaining <= 1e-12) break;
    }
    const filled = qty - remaining;
    const complete = remaining <= 1e-12;
    let avgPrice = 0;
    let slippageBps = 0;
    if (filled > 0) {
      avgPrice = notional / filled;
      if (m != null) {
        const sgn = takeSide === Side.ASK ? 1 : -1;
        slippageBps = ((avgPrice - m) / m) * 1e4 * sgn;
      }
    }
    return { filled, avgPrice, slippageBps, complete };
  }
}
