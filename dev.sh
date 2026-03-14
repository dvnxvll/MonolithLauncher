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

if [[ "${XDG_SESSION_TYPE:-}" == "wayland" || -n "${WAYLAND_DISPLAY:-}" ]]; then
  LINUX_BACKEND="${MONOLITH_LINUX_BACKEND:-auto}"
  export WEBKIT_DISABLE_DMABUF_RENDERER="${WEBKIT_DISABLE_DMABUF_RENDERER:-1}"
  export WEBKIT_DISABLE_COMPOSITING_MODE="${WEBKIT_DISABLE_COMPOSITING_MODE:-1}"

  echo "WEBKIT_DISABLE_DMABUF_RENDERER: ${WEBKIT_DISABLE_DMABUF_RENDERER} | WEBKIT_DISABLE_COMPOSITING_MODE: ${WEBKIT_DISABLE_COMPOSITING_MODE}"

  case "$LINUX_BACKEND" in
    x11)
      export GDK_BACKEND="${MONOLITH_GDK_BACKEND:-x11}"
      export WINIT_UNIX_BACKEND="${MONOLITH_WINIT_BACKEND:-x11}"
      echo "Wayland session detected. Forcing X11/XWayland backend."
      ;;
    wayland)
      export GDK_BACKEND="${MONOLITH_GDK_BACKEND:-wayland}"
      export WINIT_UNIX_BACKEND="${MONOLITH_WINIT_BACKEND:-wayland}"
      echo "Wayland session detected. Forcing native Wayland backend."
      ;;
    auto)
      export GDK_BACKEND="${MONOLITH_GDK_BACKEND:-wayland,x11}"
      unset WINIT_UNIX_BACKEND
      echo "Wayland session detected. Using automatic backend selection (GDK_BACKEND=${GDK_BACKEND})."
      ;;
    *)
      echo "Invalid MONOLITH_LINUX_BACKEND: ${LINUX_BACKEND}"
      echo "Supported values: auto, x11, wayland"
      exit 1
      ;;
  esac
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
