# Monolith Launcher

Cross-platform Minecraft Java launcher built with Tauri, Rust, Next.js, and Bun.

![Monolith Launcher Main UI](images/image-1.png)

## Features
- Multi-instance management with isolated directories and pinning
- Loader support: Vanilla, Fabric, Forge, NeoForge
- Microsoft authentication and ownership checks
- Modrinth integration for mods, resource packs, shaders, and datapacks
- Instance console with launcher and client log streams
- Runtime metrics panel (RAM, CPU, GPU)
- Discord Rich Presence integration

## Stack
- Backend: Rust + Tauri
- Frontend: Next.js + TypeScript
- Package manager/runtime: Bun

## Requirements
- Bun
- Rust toolchain (1.77.2+)
- Tauri CLI v2
- Platform-specific Tauri system dependencies

## Development
```bash
./dev.sh
```

Optional flags:
- `--tips` or `--tour`
- `--update-test`

## Production Build
```bash
cd monolith-ui
bun run build
cd ..
cargo tauri build
```

Artifacts are generated under `src-tauri/target/release/bundle/`.

## Configuration
- Main config file: platform app config directory, `config.json`
- Default roots:
  - `~/.monolith/instances`
  - `~/.monolith/instances-labs`

## Changelog
See [Changelogs.md](Changelogs.md) for release notes.

## License
MIT. See `LICENSE`.
