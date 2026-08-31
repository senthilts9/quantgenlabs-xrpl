// marketFeed.js -- the synthetic XRP/RLUSD spot path shared by both boards.
//
// SPOT_SHOCK_RANGE is calibrated to match sim_main.cpp's 0.0007 stdev and
// xrpl-desk.html's 0.0016 range (both intended as "one XRPL ledger close").
// This is the single source of truth for that constant now -- previously
// risk-analytics-board.html independently hardcoded 0.012 (~5-7.5x larger),
// which is what inflated its Annualized sigma to ~1000%+. Keeping it here,
// imported everywhere it's used, is what prevents that drift from recurring.
export const SPOT_SHOCK_RANGE = 0.0016;

export function stepSpot(mid) {
  return mid * Math.exp((Math.random() - 0.5) * SPOT_SHOCK_RANGE);
}

// A few synthetic price levels around mid, refreshed each tick -- used by
// both the order-book ladder and the Greeks board's microstructure panel.
export function syntheticBook(mid, levels = 6) {
  const bids = [];
  const asks = [];
  for (let i = 0; i < levels; i++) {
    const off = mid * (0.0004 + i * 0.0003);
    bids.push([mid - off, 500 + Math.random() * 4000]);
    asks.push([mid + off, 500 + Math.random() * 4000]);
  }
  return { bids, asks };
}
