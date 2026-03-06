# Changelogs

## v0.2.1 - 2026-03-06

### Fixed
- Loader enum compatibility for NeoForge requests (`neoforge` and `neo_forge` accepted).
- Create Instance loader version behavior:
  - defaults now follow recommended loader version
  - re-applies recommended loader version when MC version context changes.
- Instance Settings loader version dropdown regression after confirming loader version.
- Download retry robustness for transient network I/O failures (including connection reset cases).
- NeoForge installer flow:
  - corrected version-channel filtering for Minecraft compatibility (e.g. `1.21.1` -> `21.1.x`)
  - installer now targets instance directory explicitly
  - auto-creates `launcher_profiles.json` when missing
  - clearer error when NeoForge metadata is not generated.
- Launch argument handling for NeoForge:
  - added token replacement for `${library_directory}` and `${path}`
  - preserved module-path argument generation
  - merged active jar name into `-DignoreList` to prevent module-layer conflicts.
- Docker Windows builder artifact naming:
  - output executable now uses versioned platform format: `monolith-launcher-v<version>-windows-<arch>.exe`
  - source executable detection handles both expected and fallback binary names.
- Docker Linux/Windows artifact consistency:
  - Linux output now uses matching format: `monolith-launcher-v<version>-linux-<arch>`
  - Linux and Windows builder scripts now clear platform output directories before copying artifacts, removing stale old-version files.
- Docker builder bundle generation:
  - removed forced `--no-bundle` behavior from Linux/Windows/macOS scripts
  - bundle output is now built by default; optional skip via `TAURI_NO_BUNDLE=1`.
- Linux Docker AppImage bundling:
  - enabled `APPIMAGE_EXTRACT_AND_RUN=1` in Linux builder script for container compatibility
  - added `libfuse2t64`, `file`, and `makeself` to Linux builder image.
  - added optional `TAURI_BUNDLES` override in Linux builder script for targeted bundle builds (for example `deb,rpm`).
  - normalized Linux bundle output filenames (`.deb`, `.rpm`, `.AppImage`) to the release format in `output/linux/bundle/`.
  - added Linux `.run` artifact generation (`monolith-launcher-v<version>-linux-<arch>.run`).
- Docker output ownership:
  - Linux, Windows, and macOS builder scripts now attempt to re-own generated artifacts to the mounted `output/` owner.
  - optional explicit ownership override via `HOST_UID` and `HOST_GID`.
- Windows Docker cross-build packaging:
  - builder now outputs raw `exe` by default (`--no-bundle`) to avoid NSIS/MSI cross-host failures.
  - bundle generation is opt-in with `TAURI_WINDOWS_BUNDLE=1`.

### Changed
- Project version bumped to `0.2.1` across backend and UI metadata.

## v0.2.0 - 2026-03-06

### Added
- Stable release update notifier with:
  - top-right update card
  - manual check button in the sidebar footer
  - "never show this version again" behavior persisted per release tag
- Release-check command in Tauri backend (`check_latest_release`) that ignores nightly/prerelease tags.
- Dev update test mode:
  - `./dev.sh --update-test`
  - backend override via `MONOLITH_UPDATE_TEST`.
- New user tips flow refinements and replay support from UI.
- Builder improvements and CI groundwork for repeatable Linux/Windows outputs.

### Improved
- Console and launcher logs:
  - broader instance log ingestion (launcher + client log files + process streams)
  - improved readability, wrapping, and color highlighting in log panel.
- Resource graph:
  - RAM/CPU/GPU series colors and hover details
  - line thickness and interaction tuning.
- Modrinth flow:
  - installed projects with available updates now show update state in UI.
- Instance compatibility and loader controls:
  - NeoForge handling updates
  - recommended loader visibility and loader version controls in instance settings.
- Sync settings:
  - `options.txt` sync support in pack sync configuration.

### Fixed
- RAM unit formatting issues in UI.
- CPU usage reporting path and related runtime metrics consistency.
- Windows Docker builder missing `cargo tauri` tooling.

### Changed
- Project version bumped to `0.2.0` across Tauri and UI metadata.
- Main README rewritten and updated with current stack and setup.
