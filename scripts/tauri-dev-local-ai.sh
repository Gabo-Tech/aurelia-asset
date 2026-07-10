#!/usr/bin/env bash
# Dev launcher for native app with full local-ai (LLM + STT + TTS).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Sherpa-ONNX shared libs (STT/TTS)
bash "$ROOT/scripts/setup-sherpa-onnx.sh"
export LD_LIBRARY_PATH="$ROOT/native/sherpa-onnx/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

# llama.cpp bindgen (if system clang/libclang is not installed)
LLVM="$ROOT/.llvm/usr/lib/llvm-14"
if [[ -d "$LLVM/lib" ]]; then
  export LIBCLANG_PATH="$LLVM/lib"
  export BINDGEN_EXTRA_CLANG_ARGS="-isystem $LLVM/include -isystem $ROOT/.llvm/usr/include -isystem /usr/lib/gcc/x86_64-linux-gnu/11/include"
fi

cd "$ROOT/src-tauri"
exec cargo tauri dev --features local-ai
