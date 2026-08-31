#!/usr/bin/env bash
# One-shot macOS setup. Run from the module root:  bash setup-macos.sh
set -euo pipefail

echo "==> Xcode command line tools (compiler)…"
xcode-select -p >/dev/null 2>&1 || xcode-select --install || true

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew not found. Install from https://brew.sh then re-run." ; exit 1
fi

echo "==> Homebrew deps (cmake + optional live-feed/pybind libs)…"
brew install cmake boost openssl@3 nlohmann-json pybind11 || true

echo "==> Python venv + packages…"
cd "$(dirname "$0")/python"
python3 -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt xrpl-py

echo
echo "Done. Quick checks:"
echo "  python finmath.py           # verified financial calcs"
echo "  python demo.py              # Python engine demo"
echo "  (from module root) mkdir -p build && clang++ -std=c++20 -O2 -Icpp/include cpp/src/sim_main.cpp -o build/sim -pthread && ./build/sim"
