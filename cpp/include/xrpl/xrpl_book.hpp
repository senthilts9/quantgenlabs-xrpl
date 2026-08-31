// xrpl_book.hpp
// The XRPL venue's order book IS xq::OrderBook — no XRPL-specific book state
// is needed beyond what the shared engine already tracks. This header exists
// only so `xrpl_adapters.hpp` can `#include "xrpl/xrpl_book.hpp"` without the
// venue layer reaching into `xq/` internals directly.
#pragma once
#include "xq/orderbook.hpp"

namespace qgl::venues::xrpl {

using xq::OrderBook;

}  // namespace qgl::venues::xrpl
