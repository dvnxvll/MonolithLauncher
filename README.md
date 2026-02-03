<div align="center">
  <img src="src-tauri/icons/MonolithIcon.png" width="120" height="120" alt="Monolith Launcher icon" />
  <h1>Monolith Launcher</h1>
  <p>Cross-platform Minecraft launcher focused on fast instance management.</p>
</div>

## Highlights
- Multi-instance library with isolated folders, pinning, and quick switching.
- Vanilla, Fabric, and Forge support with version discovery.
- Microsoft account login with ownership checks.
- Modrinth browser for mods, resource packs, shaders, and datapacks.
- Pack format detection for resource/texture packs.
- World management with icons, gamemode, and size stats.
- Unified launcher + game log viewer.
- Discord Rich Presence integration.

## Tech Stack
- Tauri + Rust backend
- Next.js + TypeScript frontend
- Radix UI + Tailwind

## Project Layout
- `monolith-ui/` Frontend (Next.js)
- `src-tauri/` Backend (Rust + Tauri)

## Requirements
- Rust toolchain (1.77.2+) and Tauri CLI
- Bun (UI builds)
- Tauri system dependencies for your OS

## Development
Use the helper script (recommended):

```bash
./dev.sh
```

Or run the steps manually:

```bash
cd monolith-ui
bun run build
cd ..
cargo tauri dev
```

## Build + Run
Use the helper script:

```bash
./start.sh
```

Or run the steps manually:

```bash
cd monolith-ui
bun run build
cd ..
cargo tauri build --no-bundle
```

The release binary is placed under `src-tauri/target/release/`.

## Data + Config
- Config is stored in the platform app config directory as `config.json`.
- Default instance roots:
  - `~/.monolith/instances`
  - `~/.monolith/instances-labs`

## Environment Overrides
Useful mainly for Linux Wayland sessions and Microsoft auth:

- `MONOLITH_GDK_BACKEND` (defaults to `wayland,x11` when Wayland is detected)
- `MONOLITH_DISABLE_DMABUF` (maps to `WEBKIT_DISABLE_DMABUF_RENDERER`)
- `MONOLITH_DISABLE_COMPOSITING` (maps to `WEBKIT_DISABLE_COMPOSITING_MODE`)
- `MONOLITH_MS_CLIENT_ID` (override the Microsoft OAuth client id)

## License
MIT License. See `LICENSE`.
