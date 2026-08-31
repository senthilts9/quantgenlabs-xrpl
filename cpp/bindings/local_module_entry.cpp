// local_module_entry.cpp
// Standalone entry point used ONLY for local/CI verification that
// xrpl_bindings.cpp actually compiles and imports cleanly. It is not part of
// the deployable venue module: once copied into QuantGenLabs (see
// docs/integration-plan.md), the real umbrella PYBIND11_MODULE calls
// register_xrpl(py::module_&) directly and this file is left behind.
#include <pybind11/pybind11.h>

// xrpl_bindings.cpp defines this at GLOBAL scope (it only pulls in
// qgl::venues::xrpl via `using namespace`, it doesn't nest inside it) --
// match that here rather than the namespace-qualified name.
void register_xrpl(pybind11::module_& venues);

PYBIND11_MODULE(qgl_xrpl_ext, m) {
    register_xrpl(m);
}
