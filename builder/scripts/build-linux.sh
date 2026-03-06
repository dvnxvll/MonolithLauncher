#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/workspace}"
OUTPUT_DIR="$ROOT_DIR/output/linux"
OUTPUT_ROOT="$ROOT_DIR/output"
APP_NAME="monolith-launcher"
TARGET_OS="linux"
ARCH="$(uname -m)"
APP_VERSION="$(awk -F'\"' '/^version[[:space:]]*=/{print $2; exit}' "$ROOT_DIR/src-tauri/Cargo.toml")"
OUTPUT_BASENAME="${APP_NAME}-v${APP_VERSION}-${TARGET_OS}-${ARCH}"
NO_BUNDLE="${TAURI_NO_BUNDLE:-0}"
BUNDLES="${TAURI_BUNDLES:-}"
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

cd "$ROOT_DIR/monolith-ui"
if command -v bun >/dev/null 2>&1; then
  bun install --frozen-lockfile || bun install
  bun run build
else
  echo "bun is required inside the builder image"
  exit 1
fi

cd "$ROOT_DIR"
BUILD_ARGS=()
if [ "$NO_BUNDLE" = "1" ]; then
  BUILD_ARGS+=(--no-bundle)
  echo "Bundle build disabled via TAURI_NO_BUNDLE=1"
else
  export APPIMAGE_EXTRACT_AND_RUN="${APPIMAGE_EXTRACT_AND_RUN:-1}"
  if [ -n "$BUNDLES" ]; then
    BUILD_ARGS+=(--bundles "$BUNDLES")
    echo "Using bundle targets: $BUNDLES"
  fi
fi
NO_STRIP=1 cargo tauri build "${BUILD_ARGS[@]}"

if [ -f "$ROOT_DIR/src-tauri/target/release/app" ]; then
  cp "$ROOT_DIR/src-tauri/target/release/app" "$OUTPUT_DIR/$OUTPUT_BASENAME"
fi

if [ -d "$ROOT_DIR/src-tauri/target/release/bundle" ]; then
  mkdir -p "$OUTPUT_DIR/bundle"
  cp -r "$ROOT_DIR/src-tauri/target/release/bundle/." "$OUTPUT_DIR/bundle/"

  # Normalize Linux bundle artifact names for consistent release outputs.
  DEB_FILE="$(find "$OUTPUT_DIR/bundle/deb" -maxdepth 1 -type f -name '*.deb' | head -n 1 || true)"
  if [ -n "$DEB_FILE" ] && [ -f "$DEB_FILE" ]; then
    mv "$DEB_FILE" "$OUTPUT_DIR/bundle/deb/${OUTPUT_BASENAME}.deb"
  fi

  RPM_FILE="$(find "$OUTPUT_DIR/bundle/rpm" -maxdepth 1 -type f -name '*.rpm' | head -n 1 || true)"
  if [ -n "$RPM_FILE" ] && [ -f "$RPM_FILE" ]; then
    mv "$RPM_FILE" "$OUTPUT_DIR/bundle/rpm/${OUTPUT_BASENAME}.rpm"
  fi

  APPIMAGE_FILE="$(find "$OUTPUT_DIR/bundle/appimage" -maxdepth 1 -type f -name '*.AppImage' | head -n 1 || true)"
  if [ -n "$APPIMAGE_FILE" ] && [ -f "$APPIMAGE_FILE" ]; then
    mv "$APPIMAGE_FILE" "$OUTPUT_DIR/bundle/appimage/${OUTPUT_BASENAME}.AppImage"
  fi
fi

if [ -f "$OUTPUT_DIR/$OUTPUT_BASENAME" ] && command -v makeself >/dev/null 2>&1; then
  RUN_PAYLOAD_DIR="$OUTPUT_DIR/.run-payload"
  rm -rf "$RUN_PAYLOAD_DIR"
  mkdir -p "$RUN_PAYLOAD_DIR"
  cp "$OUTPUT_DIR/$OUTPUT_BASENAME" "$RUN_PAYLOAD_DIR/$APP_NAME"
  cat > "$RUN_PAYLOAD_DIR/run.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_PATH="$SCRIPT_DIR/monolith-launcher"

chmod +x "$BIN_PATH"
echo "Launching Monolith Launcher..."
echo "If it fails, install required system libraries or use AppImage."
exec "$BIN_PATH" "$@"
EOF
  chmod +x "$RUN_PAYLOAD_DIR/$APP_NAME" "$RUN_PAYLOAD_DIR/run.sh"
  makeself --nox11 "$RUN_PAYLOAD_DIR" "$OUTPUT_DIR/${OUTPUT_BASENAME}.run" "Monolith Launcher ${APP_VERSION} Linux launcher" ./run.sh >/dev/null
  rm -rf "$RUN_PAYLOAD_DIR"
fi

if [ -n "$OUTPUT_OWNER" ]; then
  chown -R "$OUTPUT_OWNER" "$OUTPUT_DIR" 2>/dev/null || true
fi

echo "Linux artifacts copied to $OUTPUT_DIR"
