#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/workspace}"
OUTPUT_DIR="$ROOT_DIR/output/linux"

mkdir -p "$OUTPUT_DIR"

cd "$ROOT_DIR/monolith-ui"
if command -v bun >/dev/null 2>&1; then
  bun install --frozen-lockfile || bun install
  bun run build
else
  echo "bun is required inside the builder image"
  exit 1
fi

cd "$ROOT_DIR"
NO_STRIP=1 cargo tauri build --no-bundle

if [ -f "$ROOT_DIR/src-tauri/target/release/app" ]; then
  cp "$ROOT_DIR/src-tauri/target/release/app" "$OUTPUT_DIR/monolith-launcher"
fi

if [ -d "$ROOT_DIR/src-tauri/target/release/bundle" ]; then
  mkdir -p "$OUTPUT_DIR/bundle"
  cp -r "$ROOT_DIR/src-tauri/target/release/bundle/." "$OUTPUT_DIR/bundle/"
fi

echo "Linux artifacts copied to $OUTPUT_DIR"
