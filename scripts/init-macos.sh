#!/usr/bin/env bash
# Scaffold react-native-macos into this repo (run on macOS with Xcode).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script must be run on macOS with Xcode installed."
  exit 1
fi

npm ci
npx --yes react-native-macos-init
cd macos && pod install && cd ..
echo "Done. Next: npm run macos"
