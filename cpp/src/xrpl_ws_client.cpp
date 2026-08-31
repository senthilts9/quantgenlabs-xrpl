// xrpl_ws_client.cpp   [OPTIONAL / LIVE]
// Connects to the XRPL *testnet* over TLS WebSocket, pulls the DEX order book
// for a chosen asset pair each ledger close, and feeds the same OrderBook +
// RiskEngine used by the offline sim.
//
// Endpoint (verified Aug 2026):  wss://s.altnet.rippletest.net:51233
// Faucet for test credentials:   https://faucet.altnet.rippletest.net/accounts
// (Testnet resets ~every 90 days; don't reuse testnet keys on mainnet.)
//
// Deps:  Boost (system, beast), OpenSSL, nlohmann/json.
//   Ubuntu:  sudo apt install libboost-all-dev libssl-dev nlohmann-json3-dev
//
// APPROACH: request `book_offers` for both orientations of the pair once per
// ledger close (we subscribe to the `ledger` stream to know when to re-poll).
// `book_offers` responses already include a per-offer `quality` (= TakerPays /
// TakerGets), so we don't recompute the exchange rate ourselves -- we only
// NORMALIZE it to IOU-per-XRP when the "gets" leg is XRP (drops). Verify that
// normalization against live numbers before trusting it in anger.
//
// NOTE: this snapshot-per-ledger design is deliberately simple and correct.
// A production feed would instead apply incremental offer changes from
// transaction metadata on the `transactions` stream, and account for native
// AMM (XLS-30) liquidity and XRP auto-bridging, which a pure CLOB poll ignores.

#include "xq/orderbook.hpp"
#include "xq/risk.hpp"

#include <boost/asio/connect.hpp>
#include <boost/asio/ip/tcp.hpp>
#include <boost/asio/ssl.hpp>
#include <boost/beast/core.hpp>
#include <boost/beast/ssl.hpp>
#include <boost/beast/websocket.hpp>
#include <boost/beast/websocket/ssl.hpp>
#include <nlohmann/json.hpp>

#include <cstdio>
#include <string>

namespace beast     = boost::beast;
namespace websocket = beast::websocket;
namespace net       = boost::asio;
namespace ssl       = net::ssl;
using tcp           = net::ip::tcp;
using json          = nlohmann::json;
using namespace xq;

// ---- amount parsing --------------------------------------------------------
// XRPL amounts are EITHER a string of XRP drops OR an object {currency, value,
// issuer}. Return the size expressed in the base unit we track.
static double amount_size(const json& amt, bool& is_xrp) {
    if (amt.is_string()) {                       // XRP in drops
        is_xrp = true;
        return std::stod(amt.get<std::string>()) / 1'000'000.0;  // -> XRP
    }
    is_xrp = false;
    return std::stod(amt.at("value").get<std::string>());        // IOU value
}

// Populate one side of the book from a book_offers result.
// Orientation: taker_gets = base (e.g. XRP), taker_pays = quote (e.g. RLUSD).
static void load_side(OrderBook& book, Side side, const json& offers) {
    for (const auto& o : offers) {
        bool gets_xrp = false, pays_xrp = false;
        const double gets = amount_size(o.at("TakerGets"), gets_xrp);  // base sz
        (void)amount_size(o.at("TakerPays"), pays_xrp);
        // `quality` = TakerPays/TakerGets in raw units. If gets is XRP (drops),
        // multiply by 1e6 to express quote-per-XRP. Otherwise use as-is.
        double px = std::stod(o.at("quality").get<std::string>());
        if (gets_xrp) px *= 1'000'000.0;
        if (gets > 0.0 && px > 0.0) book.upsert(side, px, gets);
    }
}

int main(int argc, char** argv) {
    // Pair defaults: XRP vs a test-issued IOU. Replace issuer/currency with a
    // testnet RLUSD-style token you control (currency codes > 3 chars are the
    // 40-hex form, e.g. "524C555344000000000000000000000000000000" = "RLUSD").
    const std::string host = "s.altnet.rippletest.net";
    const std::string port = "51233";
    const std::string quote_currency = argc > 1 ? argv[1]
        : "524C555344000000000000000000000000000000";
    const std::string quote_issuer = argc > 2 ? argv[2]
        : "rISSUERADDRESSGOESHERE";   // <-- set to your testnet issuer

    try {
        net::io_context ioc;
        ssl::context ctx(ssl::context::tlsv12_client);
        ctx.set_default_verify_paths();

        tcp::resolver resolver(ioc);
        websocket::stream<beast::ssl_stream<tcp::socket>> ws(ioc, ctx);

        auto const results = resolver.resolve(host, port);
        net::connect(beast::get_lowest_layer(ws), results);
        if (!SSL_set_tlsext_host_name(ws.next_layer().native_handle(),
                                      host.c_str()))
            throw beast::system_error{beast::error_code{
                static_cast<int>(::ERR_get_error()),
                net::error::get_ssl_category()}};
        ws.next_layer().handshake(ssl::stream_base::client);
        ws.handshake(host, "/");

        OrderBook book;
        RiskEngine risk;

        auto send = [&](const json& j) { ws.write(net::buffer(j.dump())); };
        auto recv = [&]() -> json {
            beast::flat_buffer b;
            ws.read(b);
            return json::parse(beast::buffers_to_string(b.data()));
        };

        // Two book_offers requests: bids (buy XRP) and asks (sell XRP).
        const json bids_req = {
            {"id", "bids"}, {"command", "book_offers"},
            {"taker_gets", {{"currency", quote_currency}, {"issuer", quote_issuer}}},
            {"taker_pays", {{"currency", "XRP"}}}, {"limit", 50}};
        const json asks_req = {
            {"id", "asks"}, {"command", "book_offers"},
            {"taker_gets", {{"currency", "XRP"}}},
            {"taker_pays", {{"currency", quote_currency}, {"issuer", quote_issuer}}},
            {"limit", 50}};

        // Ledger stream tells us when a new ledger validated -> re-poll.
        send({{"id", "sub"}, {"command", "subscribe"}, {"streams", {"ledger"}}});

        auto refresh = [&]() {
            book.clear();
            send(bids_req);
            const json br = recv();
            if (br.contains("result"))
                load_side(book, Side::Bid, br["result"].value("offers", json::array()));
            send(asks_req);
            const json ar = recv();
            if (ar.contains("result"))
                load_side(book, Side::Ask, ar["result"].value("offers", json::array()));

            if (auto m = book.microprice()) {
                risk.on_mark(*m);
                std::printf("XRP book: mid=%.6f micro=%.6f spread=%.2fbps "
                            "imb=%+.3f VaR99=%.2f\n",
                            book.mid().value_or(0.0), *m,
                            book.spread_bps().value_or(0.0),
                            book.imbalance().value_or(0.0),
                            risk.parametric_var(*m, 0.99));
            } else {
                std::puts("book empty (no test liquidity on this pair yet)");
            }
        };

        refresh();
        for (;;) {
            const json msg = recv();
            if (msg.value("type", "") == "ledgerClosed") refresh();
        }
    } catch (const std::exception& e) {
        std::fprintf(stderr, "error: %s\n", e.what());
        return 1;
    }
}
