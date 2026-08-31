cmake_minimum_required(VERSION 3.16)
project(qgl_xrpl CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()
add_compile_options(-O2 -Wall -Wextra)

include_directories(${CMAKE_SOURCE_DIR}/include)

# --- Offline sim: no external deps, always builds -------------------------
add_executable(sim src/sim_main.cpp)
find_package(Threads REQUIRED)
target_link_libraries(sim PRIVATE Threads::Threads)

# --- Live XRPL testnet client: only if Boost + OpenSSL + json are found ----
find_package(Boost QUIET COMPONENTS system)
find_package(OpenSSL QUIET)
find_package(nlohmann_json QUIET)
if(Boost_FOUND AND OpenSSL_FOUND AND nlohmann_json_FOUND)
  add_executable(xrpl_live src/xrpl_ws_client.cpp)
  target_link_libraries(xrpl_live PRIVATE
    Boost::system OpenSSL::SSL OpenSSL::Crypto nlohmann_json::nlohmann_json
    Threads::Threads)
  message(STATUS "xrpl_live: ENABLED")
else()
  message(STATUS "xrpl_live: SKIPPED (install libboost-all-dev libssl-dev nlohmann-json3-dev)")
endif()

# --- Python extension module: only if pybind11 is found --------------------
# bindings/xrpl_bindings.cpp defines register_xrpl(py::module_&) but no
# PYBIND11_MODULE of its own by design -- it's meant to be called from
# QuantGenLabs's existing umbrella module once merged (see its own header
# comment and docs/integration-plan.md). bindings/local_module_entry.cpp
# supplies that entry point ONLY for standalone verification here.
find_package(pybind11 QUIET)
if(pybind11_FOUND)
  pybind11_add_module(qgl_xrpl_ext
    bindings/xrpl_bindings.cpp
    bindings/local_module_entry.cpp)
  message(STATUS "qgl_xrpl_ext: ENABLED (standalone verification build)")
else()
  message(STATUS "qgl_xrpl_ext: SKIPPED (pip install pybind11 or brew install pybind11)")
endif()
