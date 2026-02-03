#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required for the UI build. Install bun and retry."
  exit 1
fi

cd monolith-ui
bun run build
cd ..

NO_STRIP=1 cargo tauri build

echo "Build finished. Locate the binary under src-tauri/target/release."