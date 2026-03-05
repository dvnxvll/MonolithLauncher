#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/workspace}"
OUTPUT_DIR="$ROOT_DIR/output/windows"
TARGET="x86_64-pc-windows-gnu"

mkdir -p "$OUTPUT_DIR"

rustup target add "$TARGET"

if ! cargo tauri --version >/dev/null 2>&1; then
  echo "tauri-cli is not installed in this builder image."
  echo "Rebuild image: docker build -f builder/Dockerfile.windows -t monolith-builder-windows ."
  exit 1
fi

cd "$ROOT_DIR/monolith-ui"
if command -v bun >/dev/null 2>&1; then
  bun install --frozen-lockfile || bun install
  bun run build
else
  echo "bun is required inside the builder image"
  exit 1
fi

cd "$ROOT_DIR"
NO_STRIP=1 cargo tauri build --target "$TARGET" --no-bundle

if [ -f "$ROOT_DIR/src-tauri/target/$TARGET/release/app.exe" ]; then
  cp "$ROOT_DIR/src-tauri/target/$TARGET/release/app.exe" "$OUTPUT_DIR/monolith-launcher.exe"
fi

if [ -d "$ROOT_DIR/src-tauri/target/$TARGET/release/bundle" ]; then
  mkdir -p "$OUTPUT_DIR/bundle"
  cp -r "$ROOT_DIR/src-tauri/target/$TARGET/release/bundle/." "$OUTPUT_DIR/bundle/"
fi

echo "Windows artifacts copied to $OUTPUT_DIR"
