#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

FORCE_TIPS=0
FORCE_UPDATE_TEST=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tips|--tour)
      FORCE_TIPS=1
      ;;
    --update-test)
      FORCE_UPDATE_TEST=1
      ;;
    *)
      echo "Unknown argument: $1"
      echo "Usage: ./dev.sh [--tips|--tour] [--update-test]"
      exit 1
      ;;
  esac
  shift
done

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required for the Next UI build. Install bun and retry."
  exit 1
fi

cd monolith-ui
if [[ "$FORCE_TIPS" -eq 1 ]]; then
  echo "Tips mode enabled (NEXT_PUBLIC_FORCE_TIPS=1)."
  NEXT_PUBLIC_FORCE_TIPS=1 bun run build
else
  bun run build
fi
cd ..

if [[ "$FORCE_TIPS" -eq 1 && "$FORCE_UPDATE_TEST" -eq 1 ]]; then
  echo "Update test mode enabled (MONOLITH_UPDATE_TEST=1)."
  NEXT_PUBLIC_FORCE_TIPS=1 MONOLITH_UPDATE_TEST=1 cargo tauri dev
elif [[ "$FORCE_TIPS" -eq 1 ]]; then
  NEXT_PUBLIC_FORCE_TIPS=1 cargo tauri dev
elif [[ "$FORCE_UPDATE_TEST" -eq 1 ]]; then
  echo "Update test mode enabled (MONOLITH_UPDATE_TEST=1)."
  MONOLITH_UPDATE_TEST=1 cargo tauri dev
else
  cargo tauri dev
fi
