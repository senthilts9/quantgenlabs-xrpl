// marketMaking.js -- Avellaneda-Stoikov (2008) optimal quoting.
// Ported from python/xquant/market_making.py and cpp/include/xq/market_making.hpp;
// numerically identical to both -- research, production, and this UI all quote
// the same formula.
//
//   reservation price  r = s - q * gamma * sigma^2 * (T - t)
//   optimal spread     = gamma * sigma^2 * (T - t) + (2/gamma) * ln(1 + gamma/kappa)
//   bid = r - spread/2 ,  ask = r + spread/2

export function quote(mid, inventory, sigma, gamma, kappa, timeToHorizon = 1.0) {
  // Both sliders in the UI floor at >0 (gamma >= 0.02, kappa >= 0.3), but this
  // is a library function -- gamma=0 or kappa=0 would otherwise divide by
  // zero and return an Infinity spread. Floor defensively.
  gamma = Math.max(gamma, 1e-6);
  kappa = Math.max(kappa, 1e-6);
  const varTerm = gamma * sigma * sigma * timeToHorizon;
  const reservation = mid - inventory * varTerm;
  const totalSpread = varTerm + (2 / gamma) * Math.log1p(gamma / kappa);
  const half = totalSpread / 2;
  return {
    bid: reservation - half,
    ask: reservation + half,
    reservationPrice: reservation,
    halfSpread: half,
    inventorySkew: reservation - mid,
  };
}
