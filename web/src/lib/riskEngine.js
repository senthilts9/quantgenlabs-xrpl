// riskEngine.js -- XRP-leg inventory risk (position, EWMA vol, VaR/CVaR,
// drawdown). Ported from risk.py / risk.hpp / xrpl-desk.html's inline `risk`
// object; identical formulas, wrapped as a class so component state stays
// explicit (no module-level mutable globals, unlike the original HTML).
import { LEDGERS_PER_YEAR } from './riskMeasures.js';

export class RiskEngine {
  constructor(lambda = 0.94) {
    this.xrp = 0;
    this.rlusd = 0;
    this.avgCost = 0;
    this.lambda = lambda;
    this.returns = [];
    this.ewmaVar = 0;
    this.lastMark = 0;
    this.peakEquity = 0;
    this.maxDD = 0;
  }

  // signed_qty > 0 = bought XRP at `price` RLUSD/XRP.
  onFill(signedQty, price) {
    const newXrp = this.xrp + signedQty;
    if (this.xrp >= 0 === signedQty >= 0 && newXrp !== 0) {
      this.avgCost = (this.avgCost * this.xrp + price * signedQty) / newXrp;
    } else if (newXrp === 0) {
      this.avgCost = 0;
    }
    this.xrp = newXrp;
    this.rlusd -= signedQty * price;
  }

  onMark(price) {
    if (this.lastMark > 0) {
      const ret = Math.log(price / this.lastMark);
      this.returns.push(ret);
      if (this.returns.length > 512) this.returns.shift();
      this.ewmaVar = this.lambda * this.ewmaVar + (1 - this.lambda) * ret * ret;
    }
    this.lastMark = price;
    const eq = this.equity(price);
    this.peakEquity = Math.max(this.peakEquity, eq);
    this.maxDD = Math.max(this.maxDD, this.peakEquity - eq);
  }

  equity(mark) {
    return this.rlusd + this.xrp * mark;
  }

  unrealizedPnl(mark) {
    return this.xrp * (mark - this.avgCost);
  }

  exposure(mark) {
    return this.xrp * mark;
  }

  volAnnualized() {
    return Math.sqrt(this.ewmaVar * LEDGERS_PER_YEAR);
  }

  parametricVar(mark, z = 2.326) {
    return Math.abs(this.exposure(mark)) * z * Math.sqrt(this.ewmaVar);
  }

  historicalVar(mark, conf = 0.99) {
    if (this.returns.length < 20) return 0;
    return Math.abs(this.exposure(mark)) * Math.abs(quantileOf(this.returns, 1 - conf));
  }

  cvar(mark, conf = 0.99) {
    if (this.returns.length < 20) return 0;
    const th = quantileOf(this.returns, 1 - conf);
    const tail = this.returns.filter((r) => r <= th);
    if (!tail.length) return 0;
    const m = tail.reduce((a, b) => a + b, 0) / tail.length;
    return Math.abs(this.exposure(mark)) * Math.abs(m);
  }
}

function quantileOf(arr, q) {
  const s = [...arr].sort((a, b) => a - b);
  if (!s.length) return 0;
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}
