// risk.hpp
// Risk measures for an XRPL-native liquidity provider / prime desk.
//
// FRAMING FOR RIPPLE PRIME (interview point): most institutional flow settles
// in RLUSD, so the desk's dominant market risk is not stablecoin price -- it's
//   (1) XRP inventory carried as a bridge asset,
//   (2) exposure held across the ~3-4s ledger-close settlement window, and
//   (3) RLUSD peg/basis risk (small but non-zero, and a compliance concern).
// So the risk terms that matter are inventory delta, VaR on the XRP leg,
// realized vol, and drawdown -- modelled below. Cross-margining (a Ripple
// Prime feature) means these are netted across a client's positions.
#pragma once
#include <algorithm>
#include <cmath>
#include <cstddef>
#include <deque>
#include <numeric>
#include <vector>

namespace xq {

// Net position, split by leg so we can mark each independently.
struct Position {
    double xrp   = 0.0;   // bridge-asset inventory (the risky leg)
    double rlusd = 0.0;   // stablecoin leg (~peg, treated near-flat)
    double avg_cost_xrp = 0.0;  // VWAP of the XRP inventory, in RLUSD/XRP
};

class RiskEngine {
public:
    explicit RiskEngine(std::size_t vol_window = 256, double ewma_lambda = 0.94)
        : window_(vol_window), lambda_(ewma_lambda) {}

    // Record a fill on the XRP/RLUSD leg. signed_qty > 0 = we bought XRP.
    void on_fill(double signed_qty, double price_rlusd_per_xrp) noexcept {
        // Update VWAP cost when adding to the position in the same direction.
        const double new_xrp = pos_.xrp + signed_qty;
        if ((pos_.xrp >= 0) == (signed_qty >= 0) && new_xrp != 0.0) {
            pos_.avg_cost_xrp =
                (pos_.avg_cost_xrp * pos_.xrp + price_rlusd_per_xrp * signed_qty)
                / new_xrp;
        } else if (new_xrp == 0.0) {
            pos_.avg_cost_xrp = 0.0;  // flat
        }
        pos_.xrp = new_xrp;
        pos_.rlusd -= signed_qty * price_rlusd_per_xrp;  // cash leg moves opposite
    }

    // Feed each new mark (mid or microprice). Drives vol + PnL curve.
    void on_mark(double price_rlusd_per_xrp) noexcept {
        if (last_mark_ > 0.0) {
            const double ret = std::log(price_rlusd_per_xrp / last_mark_);
            returns_.push_back(ret);
            if (returns_.size() > window_) returns_.pop_front();
            // EWMA variance (RiskMetrics-style).
            ewma_var_ = lambda_ * ewma_var_ + (1.0 - lambda_) * ret * ret;
        }
        last_mark_ = price_rlusd_per_xrp;

        const double eq = equity(price_rlusd_per_xrp);
        peak_equity_ = std::max(peak_equity_, eq);
        max_dd_ = std::max(max_dd_, peak_equity_ - eq);
    }

    // Mark-to-market total equity in RLUSD.
    double equity(double mark) const noexcept {
        return pos_.rlusd + pos_.xrp * mark;
    }

    // Unrealized PnL on the XRP inventory vs its VWAP cost.
    double unrealized_pnl(double mark) const noexcept {
        return pos_.xrp * (mark - pos_.avg_cost_xrp);
    }

    // Net directional exposure in RLUSD terms (the number a risk limit caps).
    double inventory_exposure(double mark) const noexcept {
        return pos_.xrp * mark;
    }

    // Annualized realized vol from the EWMA estimator.
    // scale = sqrt(marks-per-year). XRPL closes ~4s -> ~7.9M ledgers/yr.
    double ewma_vol_annualized(double marks_per_year = 7.9e6) const noexcept {
        return std::sqrt(ewma_var_ * marks_per_year);
    }

    // Parametric (Gaussian) 1-step VaR on current inventory, at `conf`.
    // Uses the EWMA sigma; z(0.99)=2.326, z(0.95)=1.645.
    double parametric_var(double mark, double conf = 0.99) const noexcept {
        const double z = z_score(conf);
        const double sigma_step = std::sqrt(ewma_var_);      // per-mark sigma
        return std::abs(inventory_exposure(mark)) * z * sigma_step;
    }

    // Historical VaR: empirical quantile of the return distribution applied
    // to current inventory. More honest for fat-tailed crypto returns.
    double historical_var(double mark, double conf = 0.99) const noexcept {
        if (returns_.size() < 20) return 0.0;
        std::vector<double> s(returns_.begin(), returns_.end());
        std::sort(s.begin(), s.end());                       // losses at front
        const std::size_t idx =
            static_cast<std::size_t>((1.0 - conf) * s.size());
        const double q = s[std::min(idx, s.size() - 1)];     // negative tail
        return std::abs(inventory_exposure(mark)) * std::abs(q);
    }

    double max_drawdown() const noexcept { return max_dd_; }
    const Position& position() const noexcept { return pos_; }

private:
    static double z_score(double conf) noexcept {
        if (conf >= 0.99) return 2.326;
        if (conf >= 0.975) return 1.960;
        return 1.645;  // 95%
    }

    Position pos_{};
    std::size_t window_;
    double lambda_;
    std::deque<double> returns_;
    double ewma_var_ = 0.0;
    double last_mark_ = 0.0;
    double peak_equity_ = 0.0;
    double max_dd_ = 0.0;
};

}  // namespace xq
