#!/usr/bin/env bash
# Production release build with full local-ai (LLM + STT + TTS).
# Never uses --debug / tauri dev.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

bash "$ROOT/scripts/setup-sherpa-onnx.sh"
export LD_LIBRARY_PATH="$ROOT/native/sherpa-onnx/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

# llama.cpp bindgen needs libclang
LLVM="$ROOT/.llvm/usr/lib/llvm-14"
if [[ -d "$LLVM/lib" ]]; then
  export LIBCLANG_PATH="$LLVM/lib"
  export BINDGEN_EXTRA_CLANG_ARGS="-isystem $LLVM/include -isystem $ROOT/.llvm/usr/include -isystem /usr/lib/gcc/x86_64-linux-gnu/11/include"
elif [[ -d /usr/lib/llvm-14/lib ]]; then
  export LIBCLANG_PATH=/usr/lib/llvm-14/lib
fi

cd "$ROOT/src-tauri"
exec cargo tauri build --features local-ai --bundles deb,appimage
