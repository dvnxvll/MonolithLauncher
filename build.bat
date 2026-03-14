@echo off
setlocal EnableExtensions

pushd "%~dp0" >nul

where bun >nul 2>nul
if errorlevel 1 (
  echo bun is required for the UI build. Install bun and retry.
  popd >nul
  exit /b 1
)

pushd monolith-ui >nul
bun run build
if errorlevel 1 (
  popd >nul
  popd >nul
  exit /b 1
)
popd >nul

set "NO_STRIP=1"
cargo tauri build
if errorlevel 1 (
  popd >nul
  exit /b 1
)

echo Build finished. Locate the binary under src-tauri\target\release.

popd >nul
exit /b 0
