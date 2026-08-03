#!/usr/bin/env bash
# Scaffold react-native-windows into this repo (run on Windows with VS 2022).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "$(uname -s 2>/dev/null || echo Windows)" != MINGW* && "$(uname -s 2>/dev/null || echo Windows)" != CYGWIN* && "${OS:-}" != "Windows_NT" ]]; then
  echo "This script must be run on Windows (PowerShell or Git Bash)."
  echo "Prereqs: Visual Studio 2022 (Desktop C++ + WinUI), Node 22+, JDK not required."
  exit 1
fi

npm ci
npx --yes react-native-windows-init --overwrite --version latest
echo "Done. Next: npm run windows"
