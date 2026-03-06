# Builder

This directory contains Docker-based build environments for Monolith Launcher.

## Targets
- `Dockerfile.linux`: native Linux desktop build.
- `Dockerfile.windows`: Windows (GNU target) cross-build.
- `Dockerfile.macos`: macOS cross-build scaffold (requires external Apple SDK toolchain).

All build scripts copy artifacts into root `output/`:
- `output/linux`
- `output/windows`
- `output/macos`

## Usage
Run from repository root.

### Linux
```bash
mkdir -p output
docker build -f builder/Dockerfile.linux -t monolith-builder-linux .
docker run --rm -v "$(pwd)/output:/workspace/output" monolith-builder-linux
```

### Windows
```bash
mkdir -p output
docker build -f builder/Dockerfile.windows -t monolith-builder-windows .
docker run --rm -v "$(pwd)/output:/workspace/output" monolith-builder-windows
```

### macOS
```bash
mkdir -p output
docker build -f builder/Dockerfile.macos -t monolith-builder-macos .
docker run --rm -v "$(pwd)/output:/workspace/output" monolith-builder-macos
```

## Notes
- Linux and Windows images install Bun and build the Next.js UI before running Tauri build.
- macOS builds are toolchain-dependent. You must provide an Apple SDK/osxcross-compatible setup to produce signed/usable binaries.
- Bundle builds are enabled by default. Set `TAURI_NO_BUNDLE=1` to skip bundle generation.
- Linux builder enables `APPIMAGE_EXTRACT_AND_RUN=1` by default for Docker compatibility during AppImage bundling.
- Linux builder accepts `TAURI_BUNDLES` (for example `deb,rpm`) to limit bundle targets.
- Windows Docker builder is `exe`-only by default to avoid cross-NSIS/MSI failures.
- Set `TAURI_WINDOWS_BUNDLE=1` to opt into Windows bundle generation.
- Binary names are normalized to:
  - Linux: `monolith-launcher-v<version>-linux-<arch>`
  - Windows: `monolith-launcher-v<version>-windows-<arch>.exe`
  - macOS: `monolith-launcher-v<version>-macos-<arch>`
- Linux also outputs a self-extracting launcher:
  - `monolith-launcher-v<version>-linux-<arch>.run`
- Linux bundle files in `output/linux/bundle/` are also normalized:
  - `*.deb` -> `monolith-launcher-v<version>-linux-<arch>.deb`
  - `*.rpm` -> `monolith-launcher-v<version>-linux-<arch>.rpm`
  - `*.AppImage` -> `monolith-launcher-v<version>-linux-<arch>.AppImage`
- Linux, Windows, and macOS scripts clear their platform output directory before copying artifacts, so stale files from older versions are removed.
- Builder scripts try to keep output ownership aligned to the mounted `output/` directory owner.
- You can explicitly set ownership with `-e HOST_UID=$(id -u) -e HOST_GID=$(id -g)` in `docker run`.
