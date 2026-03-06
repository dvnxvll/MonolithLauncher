#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/workspace}"
OUTPUT_DIR="$ROOT_DIR/output/macos"
OUTPUT_ROOT="$ROOT_DIR/output"
TARGETS=("x86_64-apple-darwin" "aarch64-apple-darwin")
APP_NAME="monolith-launcher"
TARGET_OS="macos"
APP_VERSION="$(awk -F'\"' '/^version[[:space:]]*=/{print $2; exit}' "$ROOT_DIR/src-tauri/Cargo.toml")"
NO_BUNDLE="${TAURI_NO_BUNDLE:-0}"
HOST_UID="${HOST_UID:-}"
HOST_GID="${HOST_GID:-}"
OUTPUT_OWNER=""

if [ -n "$HOST_UID" ] && [ -n "$HOST_GID" ]; then
  OUTPUT_OWNER="${HOST_UID}:${HOST_GID}"
elif [ -d "$OUTPUT_ROOT" ]; then
  OUTPUT_OWNER="$(stat -c '%u:%g' "$OUTPUT_ROOT" 2>/dev/null || true)"
fi

rm -rf "$OUTPUT_DIR"
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
  BUILD_ARGS=(--target "$target")
  if [ "$NO_BUNDLE" = "1" ]; then
    BUILD_ARGS+=(--no-bundle)
    echo "Bundle build disabled via TAURI_NO_BUNDLE=1"
  fi
  NO_STRIP=1 cargo tauri build "${BUILD_ARGS[@]}"
  arch="${target%%-*}"
  output_basename="${APP_NAME}-v${APP_VERSION}-${TARGET_OS}-${arch}"

  if [ -f "$ROOT_DIR/src-tauri/target/$target/release/app" ]; then
    cp "$ROOT_DIR/src-tauri/target/$target/release/app" "$OUTPUT_DIR/$output_basename"
  fi

  if [ -d "$ROOT_DIR/src-tauri/target/$target/release/bundle" ]; then
    mkdir -p "$OUTPUT_DIR/bundle-$target"
    cp -r "$ROOT_DIR/src-tauri/target/$target/release/bundle/." "$OUTPUT_DIR/bundle-$target/"
  fi
done

if [ -n "$OUTPUT_OWNER" ]; then
  chown -R "$OUTPUT_OWNER" "$OUTPUT_DIR" 2>/dev/null || true
fi

echo "macOS artifacts copied to $OUTPUT_DIR"
