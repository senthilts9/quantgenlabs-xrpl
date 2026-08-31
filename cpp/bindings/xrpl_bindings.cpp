// xrpl_bindings.cpp
// Exposes the XRPL venue to the QuantGenLabs Python research layer, so it shows
// up as quantgenlabs.venues.xrpl next to your other venues. Uses your existing
// pybind11 setup — add this .cpp to the module that builds the Python extension.
#include <pybind11/pybind11.h>
#include <pybind11/functional.h>
#include <pybind11/stl.h>

#include "xrpl/xrpl_adapters.hpp"

namespace py = pybind11;
using namespace qgl::venues::xrpl;

// If QuantGenLabs already defines PYBIND11_MODULE for the umbrella package,
// call this from there instead of declaring a second module:
//     void register_xrpl(py::module_& m);  // and invoke in the root binding.
void register_xrpl(py::module_& venues) {
    auto m = venues.def_submodule("xrpl", "XRP Ledger DEX venue");

    py::class_<XrplFeed>(m, "XrplFeed")
        .def(py::init<std::string>(), py::arg("instrument"))
        .def("start", &XrplFeed::start)
        .def("stop", &XrplFeed::stop)
        .def("set_tick_handler", &XrplFeed::set_tick_handler);

    py::class_<XrplInventoryRisk>(m, "XrplInventoryRisk")
        .def(py::init<>())
        .def("on_fill", &XrplInventoryRisk::on_fill)
        .def("on_mark", &XrplInventoryRisk::on_mark)
        .def("var", &XrplInventoryRisk::var, py::arg("mid"), py::arg("conf") = 0.99)
        .def("cvar", &XrplInventoryRisk::cvar, py::arg("mid"), py::arg("conf") = 0.99);

    py::class_<AvellanedaStoikovMM>(m, "AvellanedaStoikovMM")
        .def(py::init<double, double>(), py::arg("gamma") = 0.15, py::arg("kappa") = 1.5)
        .def("on_tick", &AvellanedaStoikovMM::on_tick)
        .def("set_order_handler", &AvellanedaStoikovMM::set_order_handler);
}
