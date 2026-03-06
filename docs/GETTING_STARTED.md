# Getting Started

## Download Channels
- Latest stable release: https://github.com/dvnxvll/MonolithLauncher/releases/latest
- Nightly prerelease: https://github.com/dvnxvll/MonolithLauncher/releases/tag/nightly

## Install Prebuilt Artifacts

### Linux
Preferred options:
1. `.AppImage` (portable)
2. `.deb` (Debian/Ubuntu)
3. `.rpm` (Fedora/RHEL/openSUSE)
4. `.run` (self-extracting launcher)

AppImage:
```bash
chmod +x monolith-launcher-v<version>-linux-<arch>.AppImage
./monolith-launcher-v<version>-linux-<arch>.AppImage
```

DEB:
```bash
sudo dpkg -i monolith-launcher-v<version>-linux-<arch>.deb
sudo apt-get -f install -y
```

RPM:
```bash
sudo rpm -i monolith-launcher-v<version>-linux-<arch>.rpm
```

RUN:
```bash
chmod +x monolith-launcher-v<version>-linux-<arch>.run
./monolith-launcher-v<version>-linux-<arch>.run
```

Raw executable (advanced):
```bash
chmod +x monolith-launcher-v<version>-linux-<arch>
./monolith-launcher-v<version>-linux-<arch>
```
This option requires system runtime dependencies to already exist on the machine.

### Windows
Use the latest stable or nightly Windows installer artifact from GitHub Releases.
If both installer and portable executable are available, installer is the recommended default.

### macOS
Use the macOS bundle artifact from GitHub Releases for the matching architecture (`x86_64` or `aarch64`).
If Gatekeeper blocks first launch, use Security & Privacy to allow the app.

## Build From Source
Requirements:
- Bun
- Rust toolchain (`1.77.2+`)
- Tauri CLI v2
- Platform-specific Tauri dependencies

Development run:
```bash
./dev.sh
```

Production build:
```bash
cd monolith-ui
bun run build
cd ..
cargo tauri build
```

Docker builders:
```bash
mkdir -p output
docker build -f builder/Dockerfile.linux -t monolith-builder-linux .
docker run --rm -v "$PWD/output:/workspace/output" monolith-builder-linux
```

On `fish`, use `(pwd)` instead of `$(pwd)` in bind mounts.
If ownership still needs adjustment, pass host IDs explicitly:
```bash
docker run --rm -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" -v "$PWD/output:/workspace/output" monolith-builder-linux
```
Or use chown:
```bash
sudo chown -R $USER:$USER output
```
