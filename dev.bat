@echo off
setlocal EnableExtensions

pushd "%~dp0" >nul

set "FORCE_TIPS=0"
set "FORCE_UPDATE_TEST=0"

:parse_args
if "%~1"=="" goto args_done

if /I "%~1"=="--tips" (
  set "FORCE_TIPS=1"
  shift
  goto parse_args
)

if /I "%~1"=="--tour" (
  set "FORCE_TIPS=1"
  shift
  goto parse_args
)

if /I "%~1"=="--update-test" (
  set "FORCE_UPDATE_TEST=1"
  shift
  goto parse_args
)

echo Unknown argument: %~1
echo Usage: dev.bat [--tips^|--tour] [--update-test]
popd >nul
exit /b 1

:args_done
where bun >nul 2>nul
if errorlevel 1 (
  echo bun is required for the Next UI build. Install bun and retry.
  popd >nul
  exit /b 1
)

pushd monolith-ui >nul
if "%FORCE_TIPS%"=="1" (
  echo Tips mode enabled ^(NEXT_PUBLIC_FORCE_TIPS=1^).
  set "NEXT_PUBLIC_FORCE_TIPS=1"
) else (
  set "NEXT_PUBLIC_FORCE_TIPS="
)

bun run build
if errorlevel 1 (
  popd >nul
  popd >nul
  exit /b 1
)
popd >nul

if "%FORCE_TIPS%"=="1" (
  set "NEXT_PUBLIC_FORCE_TIPS=1"
) else (
  set "NEXT_PUBLIC_FORCE_TIPS="
)

if "%FORCE_UPDATE_TEST%"=="1" (
  echo Update test mode enabled ^(MONOLITH_UPDATE_TEST=1^).
  set "MONOLITH_UPDATE_TEST=1"
) else (
  set "MONOLITH_UPDATE_TEST="
)

cargo tauri dev
set "EXIT_CODE=%ERRORLEVEL%"

popd >nul
exit /b %EXIT_CODE%
