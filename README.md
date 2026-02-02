# Monolith Launcher

Minimal, stable launcher for multi-instance Minecraft. Built with Tauri (Rust) and a lightweight Bun-built frontend.

## Features
- Multi-instance library with isolated folders and quick switching.
- Vanilla, Fabric, and Forge support with version discovery.
- Microsoft account login with ownership checks.
- Configurable Java settings and pack sync toggles (resourcepacks, shaders, textures, server list).
- Unified launcher + game log viewer.

## Project Layout
- `app/` Frontend (TypeScript, bundled with Bun to `app/dist/app.js`).
- `src-tauri/` Backend (Rust + Tauri).

## Requirements
- Rust toolchain 1.77.2+ and Tauri CLI.
- Bun (frontend builds).
- Tauri system dependencies for your OS.

## Development
Use the helper script (recommended):

```bash
./dev.sh
```

Or run the steps manually:

```bash
bun run dev:ui
cargo tauri dev
```

## Build + Run
Use the helper script:

```bash
./start.sh
```

Or run the steps manually:

```bash
bun run build:ui
cargo tauri build
```

The release binary is placed under `src-tauri/target/release/`.

## Data + Config
- Config is stored in the platform app config directory as `config.json`.
- Default instance roots: `~/.monolith/instances` and `~/.monolith/instances-labs`.

## Environment Overrides
These are used mainly for Linux Wayland sessions and Microsoft auth:

- `MONOLITH_GDK_BACKEND` (defaults to `wayland,x11` when Wayland is detected).
- `MONOLITH_DISABLE_DMABUF` (maps to `WEBKIT_DISABLE_DMABUF_RENDERER`).
- `MONOLITH_DISABLE_COMPOSITING` (maps to `WEBKIT_DISABLE_COMPOSITING_MODE`).
- `MONOLITH_MS_CLIENT_ID` (override the Microsoft OAuth client id).

## License
MIT License. See `LICENSE`.
