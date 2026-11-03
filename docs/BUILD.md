# Building Skald

Skald ships five package formats across two platforms. `scripts/build.mjs` is the
single entry point: it decides which Tauri invocation is needed, stages the
portable layout when asked, and reports exactly where every artifact landed.

```bash
pnpm package                 # interactive checklist
pnpm package:win             # portable + NSIS + MSI
pnpm package:linux           # AppImage + deb + rpm
pnpm package:portable        # Windows green build only
pnpm package:all             # every target the current host supports
```

Everything the script does can also be invoked directly:

```bash
node scripts/build.mjs --targets portable,nsis
node scripts/build.mjs --targets deb,rpm --ci      # CI: no prompts, hard failures
node scripts/build.mjs --help
```

## Target reference

| Target | Platform | Output | Notes |
|---|---|---|---|
| `portable` | Windows | `dist/Skald_<version>_portable_win-x64.zip` | Green build: unzip anywhere writable and run `Skald.exe`. No registry, no uninstaller. Do **not** unpack into `Program Files` — the app writes next to itself on first launch (VLC `plugins.dat`). |
| `nsis` | Windows | `src-tauri/target/release/bundle/nsis/` | Recommended installer for end users. Per-machine install, custom hooks in `src-tauri/windows/hooks.nsh`. |
| `msi` | Windows | `src-tauri/target/release/bundle/msi/` | For GPO / Intune / enterprise deployment. WiX toolchain downloads on first build. |
| `appimage` | Linux | `src-tauri/target/release/bundle/appimage/` | Single executable file, no install. Requires FUSE 2 on the target. |
| `deb` | Linux | `src-tauri/target/release/bundle/deb/` | Debian, Ubuntu, Mint, Pop!_OS. Declares WebKitGTK 4.1, GTK 3, LibVLC and libsecret as dependencies. |
| `rpm` | Linux | `src-tauri/target/release/bundle/rpm/` | Fedora, RHEL, openSUSE. |

A target whose platform does not match the build host is skipped with a warning
interactively, and is a hard error under `--ci`. Cross-compiling is deliberately
not attempted: the Windows build needs the MSVC toolchain plus a staged VLC
runtime, and the Linux build needs the host's WebKitGTK.

## Prerequisites

Common to both platforms:

- Node.js 20+ and pnpm 9
- Rust stable (MSVC toolchain on Windows)

### Windows

- Visual Studio Build Tools with the C++ workload
- WebView2 runtime (preinstalled on Windows 11)
- Two git-ignored runtime folders, populated by `pnpm stage:windows` or by hand:

| Path | Contents |
|---|---|
| `src-tauri/vlc-dist/` | `libvlc.dll`, `libvlccore.dll`, `vlc-cache-gen.exe`, `plugins/` |
| `src-tauri/bin/` | `ffprobe.exe` (metadata + chapters), `tone.exe` (metadata writes) |

`build.rs` copies both trees next to the binary, which is what makes the portable
zip self-contained. Building while Skald is running fails with an OS "file in
use" error — close the app first.

### Linux (Arch / CachyOS reference host)

```bash
sudo pacman -S --needed base-devel rust nodejs pnpm webkit2gtk-4.1 \
  libappindicator-gtk3 librsvg vlc libsecret
```

- Debian/Ubuntu equivalent: `libwebkit2gtk-4.1-dev libgtk-3-dev libvlc-dev libsecret-1-dev librsvg2-dev`
- `pnpm build:linux` runs `scripts/stage-linux-vlc.mjs` before the Vite build, so
  the system LibVLC plugins are staged into `src-tauri/linux-runtime/`.
- `ffprobe` and `tone` are resolved from `PATH` on Linux; the Windows runtime
  folders are not required.

## Build pipeline, step by step

1. **Frontend** — `pnpm build` runs `tsc && vite build` into `dist/`.
2. **Rust** — Cargo builds `skald` in release mode.
3. **Runtime staging** — `build.rs` copies VLC DLLs and the helper binaries next
   to the binary (Windows) or the plugins tree is bundled as a resource (Linux).
4. **Bundling** — Tauri produces the requested installers.
5. **Portable packaging** — `scripts/package-portable.ps1` copies exactly the
   files that must travel together into `Skald_portable/` and zips it.

Steps 1–4 are one `tauri build` invocation; step 5 is Windows-only and runs after.

## Continuous integration

Three workflows exist under `.github/workflows/`. All are on-demand
(`workflow_dispatch`) and also fire on a `v*` tag for releases:

| Workflow | Produces | Notes |
|---|---|---|
| `build-windows.yml` | NSIS, MSI, portable zip | Checkbox选择产物；运行时暂存脚本会自行下载 LibVLC / ffprobe / tone，无需预装 |
| `linux-appimage.yml` | AppImage | Runs `pnpm verify` before building |
| `linux-packages.yml` | deb, rpm | Installs `rpm` and `dpkg-dev`; calls `scripts/build.mjs --targets … --ci` |

`linux-packages.yml` is the reference for how CI should invoke the bundler:
`node scripts/build.mjs --targets deb,rpm --ci`. In `--ci` mode an unsupported
target fails the job instead of being skipped, so a green run always means every
requested artifact exists.

Note that `src-tauri/tauri.linux.conf.json` keeps `targets: ["appimage"]` so a
bare `pnpm tauri build` on Linux behaves exactly as before. The `--bundles` flag
that `build.mjs` passes overrides it, and the `linux.deb` / `linux.rpm`
dependency declarations in the same file apply whenever those targets are built.

## Verifying before you package

```bash
pnpm verify     # typecheck + frontend tests + command/console gates + clippy + cargo tests
```

`pnpm verify` is the same gate CI uses. Packaging an unverified tree is how
regressions reach users.

## Signing

Windows signing is configured in `src-tauri/tauri.windows.conf.json`
(`digestAlgorithm`, `timestampUrl`). Without a code-signing certificate the
installers still build; Windows SmartScreen will warn on first run. Nothing in
this repository contains signing credentials — supply them through the
environment Tauri expects before a production release.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `file in use` during `build.rs` | Skald is running and the DLLs are locked | Close the app, rebuild |
| MSI build fails on a fresh machine | WiX toolset not yet cached | Run once with network access; Tauri downloads it |
| `libwebkit2gtk-4.1` not found | Wrong WebKitGTK major version | Install the 4.1 package, not 4.0 |
| AppImage refuses to start | FUSE 2 missing | Install `libfuse2`, or run with `--appimage-extract-and-run` |
| Portable build plays no audio | `plugins/` missing from the zip | Confirm `pnpm stage:windows` ran before building |
