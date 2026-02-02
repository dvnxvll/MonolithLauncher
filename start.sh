#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ -n "${WAYLAND_DISPLAY:-}" ]; then
  export GDK_BACKEND="${MONOLITH_GDK_BACKEND:-wayland,x11}"
  export WEBKIT_DISABLE_DMABUF_RENDERER="${MONOLITH_DISABLE_DMABUF:-1}"
  export WEBKIT_DISABLE_COMPOSITING_MODE="${MONOLITH_DISABLE_COMPOSITING:-1}"
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required for the UI build. Install bun and retry."
  exit 1
fi

bun run build:ui

cargo tauri build

if [ -x "src-tauri/target/release/app" ]; then
  "src-tauri/target/release/app"
elif [ -x "src-tauri/target/release/monolithlauncher" ]; then
  "src-tauri/target/release/monolithlauncher"
else
  echo "Build finished. Locate the binary under src-tauri/target/release."
fi
