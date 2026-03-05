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
docker build -f builder/Dockerfile.linux -t monolith-builder-linux .
docker run --rm -v "$(pwd)/output:/workspace/output" monolith-builder-linux
```

### Windows
```bash
docker build -f builder/Dockerfile.windows -t monolith-builder-windows .
docker run --rm -v "$(pwd)/output:/workspace/output" monolith-builder-windows
```

### macOS
```bash
docker build -f builder/Dockerfile.macos -t monolith-builder-macos .
docker run --rm -v "$(pwd)/output:/workspace/output" monolith-builder-macos
```

## Notes
- Linux and Windows images install Bun and build the Next.js UI before running Tauri build.
- macOS builds are toolchain-dependent. You must provide an Apple SDK/osxcross-compatible setup to produce signed/usable binaries.
- Binary names are normalized to `monolith-launcher` (`.exe` on Windows) in the output folders.
