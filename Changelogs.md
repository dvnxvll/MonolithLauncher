# Changelogs

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
