#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/workspace}"
OUTPUT_DIR="$ROOT_DIR/output/windows"
OUTPUT_ROOT="$ROOT_DIR/output"
TARGET="x86_64-pc-windows-gnu"
APP_NAME="monolith-launcher"
TARGET_OS="windows"
ARCH="${TARGET%%-*}"
APP_VERSION="$(awk -F'\"' '/^version[[:space:]]*=/{print $2; exit}' "$ROOT_DIR/src-tauri/Cargo.toml")"
OUTPUT_BASENAME="${APP_NAME}-v${APP_VERSION}-${TARGET_OS}-${ARCH}"
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
BUILD_ARGS=(--target "$TARGET")
if [ "$NO_BUNDLE" = "1" ]; then
  BUILD_ARGS+=(--no-bundle)
  echo "Bundle build disabled via TAURI_NO_BUNDLE=1"
fi
NO_STRIP=1 cargo tauri build "${BUILD_ARGS[@]}"

BIN_DIR="$ROOT_DIR/src-tauri/target/$TARGET/release"
SOURCE_EXE=""

if [ -f "$BIN_DIR/$APP_NAME.exe" ]; then
  SOURCE_EXE="$BIN_DIR/$APP_NAME.exe"
elif [ -f "$BIN_DIR/app.exe" ]; then
  SOURCE_EXE="$BIN_DIR/app.exe"
else
  SOURCE_EXE="$(find "$BIN_DIR" -maxdepth 1 -type f -name '*.exe' ! -name '*-setup.exe' ! -name 'uninstall.exe' | head -n 1 || true)"
fi

if [ -n "$SOURCE_EXE" ] && [ -f "$SOURCE_EXE" ]; then
  cp "$SOURCE_EXE" "$OUTPUT_DIR/$OUTPUT_BASENAME.exe"
fi

if [ -d "$ROOT_DIR/src-tauri/target/$TARGET/release/bundle" ]; then
  mkdir -p "$OUTPUT_DIR/bundle"
  cp -r "$ROOT_DIR/src-tauri/target/$TARGET/release/bundle/." "$OUTPUT_DIR/bundle/"
fi

if [ -n "$OUTPUT_OWNER" ]; then
  chown -R "$OUTPUT_OWNER" "$OUTPUT_DIR" 2>/dev/null || true
fi

echo "Windows artifacts copied to $OUTPUT_DIR"
