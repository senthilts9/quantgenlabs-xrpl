// market_making.hpp
// Avellaneda-Stoikov optimal quoting — C++ port of python/xquant/market_making.py.
// Kept numerically identical to the Python reference so research and production
// never drift; see that file for the full derivation and intuition per term.
//
//   reservation price   r = s - q * gamma * sigma^2 * (T - t)
//   optimal total spread  = gamma * sigma^2 * (T - t) + (2/gamma) * ln(1 + gamma/kappa)
//   bid = r - spread/2 ,  ask = r + spread/2
#pragma once
#include <cmath>

namespace xq {

struct Quote {
    double bid{};
    double ask{};
    double reservation_price{};
    double half_spread{};
    double inventory_skew{};  // r - s : how far inventory pushed the quote
};

class AvellanedaStoikov {
public:
    AvellanedaStoikov(double gamma = 0.1, double kappa = 1.5) noexcept
        : gamma_(gamma), kappa_(kappa) {}

    // Optimal bid/ask around `mid` given current inventory (in base units).
    Quote quote(double mid, double inventory, double sigma,
                double time_to_horizon = 1.0) const noexcept {
        const double var_term = gamma_ * sigma * sigma * time_to_horizon;
        const double reservation = mid - inventory * var_term;  // skew from inventory
        const double total_spread =
            var_term + (2.0 / gamma_) * std::log1p(gamma_ / kappa_);
        const double half = total_spread / 2.0;
        return Quote{
            .bid = reservation - half,
            .ask = reservation + half,
            .reservation_price = reservation,
            .half_spread = half,
            .inventory_skew = reservation - mid,
        };
    }

    // The model's total spread expressed in basis points of mid.
    double spread_bps(double mid, double sigma, double time_to_horizon = 1.0) const noexcept {
        const double var_term = gamma_ * sigma * sigma * time_to_horizon;
        const double total = var_term + (2.0 / gamma_) * std::log1p(gamma_ / kappa_);
        return total / mid * 1e4;
    }

private:
    double gamma_;  // inventory risk aversion
    double kappa_;  // order-book liquidity / fill-intensity decay
};

}  // namespace xq
