#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/workspace}"
OUTPUT_DIR="$ROOT_DIR/output/macos"
TARGETS=("x86_64-apple-darwin" "aarch64-apple-darwin")

mkdir -p "$OUTPUT_DIR"

for target in "${TARGETS[@]}"; do
  rustup target add "$target"
done

cd "$ROOT_DIR/monolith-ui"
if command -v bun >/dev/null 2>&1; then
  bun install --frozen-lockfile || bun install
  bun run build
else
  echo "bun is required inside the builder image"
  exit 1
fi

cd "$ROOT_DIR"
for target in "${TARGETS[@]}"; do
  echo "Building $target"
  NO_STRIP=1 cargo tauri build --target "$target" --no-bundle

  if [ -f "$ROOT_DIR/src-tauri/target/$target/release/app" ]; then
    cp "$ROOT_DIR/src-tauri/target/$target/release/app" "$OUTPUT_DIR/monolith-launcher-$target"
  fi

  if [ -d "$ROOT_DIR/src-tauri/target/$target/release/bundle" ]; then
    mkdir -p "$OUTPUT_DIR/bundle-$target"
    cp -r "$ROOT_DIR/src-tauri/target/$target/release/bundle/." "$OUTPUT_DIR/bundle-$target/"
  fi
done

echo "macOS artifacts copied to $OUTPUT_DIR"
