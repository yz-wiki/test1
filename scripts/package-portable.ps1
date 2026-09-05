# package-portable.ps1
#
# Produces a portable (green / no-install) Windows ZIP of Skald from a finished
# release build. Tauri has no built-in "zip" bundle target, but build.rs copies
# the whole runnable runtime (LibVLC + helpers) next to the exe in
# src-tauri\target\release, so that directory is already self-contained. This
# script picks exactly the files that must travel together and zips them.
#
# Run AFTER a release build, e.g.:
#   pnpm tauri build --no-bundle        (exe + runtime land in target\release)
#   powershell -File scripts/package-portable.ps1
#
# Output:  dist\Skald_<version>_portable_win-x64.zip
# (dist\ is already covered by the repository .gitignore.)

[CmdletBinding()]
param(
    # Directory that contains skald.exe and the runtime copied by build.rs.
    [string]$ReleaseDir = '',
    # Where to write the finished zip (inside the repo; dist\ is git-ignored).
    [string]$OutRoot = ''
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = (Resolve-Path (Split-Path -Parent $PSScriptRoot)).Path
if (-not $ReleaseDir) { $ReleaseDir = Join-Path $root 'src-tauri\target\release' }
if (-not $OutRoot)    { $OutRoot = Join-Path $root 'dist' }
$ReleaseDir = (Resolve-Path $ReleaseDir).Path

function Die([string]$msg) {
    Write-Host "`n[package-portable] FATAL: $msg" -ForegroundColor Red
    Write-Host 'Did you run a release build first? See scripts/package-portable.ps1 header.'
    exit 1
}

# Version comes from src-tauri\tauri.conf.json (single source of truth).
$conf = Get-Content (Join-Path $root 'src-tauri\tauri.conf.json') -Raw
if ($conf -notmatch '"version"\s*:\s*"([^"]+)"') { Die 'cannot read "version" from src-tauri\tauri.conf.json' }
$version = $Matches[1]

# Files that must sit next to Skald.exe for the app to run/play.
$required = @('skald.exe', 'libvlc.dll', 'libvlccore.dll', 'ffprobe.exe', 'tone.exe')
$missing = @($required | Where-Object { -not (Test-Path (Join-Path $ReleaseDir $_)) })
if ($missing.Count -gt 0) {
    Die ("release dir '$ReleaseDir' is missing: " + ($missing -join ', '))
}
if (-not (Test-Path (Join-Path $ReleaseDir 'plugins'))) {
    Die 'release dir is missing the plugins\ tree (LibVLC modules).'
}

$stage = Join-Path $OutRoot 'Skald_portable'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }

New-Item -ItemType Directory -Force -Path $stage | Out-Null

Write-Host 'Copying runnable layout into staging folder...' -ForegroundColor Cyan
# Rename the cargo binary to the user-facing product name (installer layout parity).
Copy-Item (Join-Path $ReleaseDir 'skald.exe') (Join-Path $stage 'Skald.exe') -Force
foreach ($f in @('libvlc.dll', 'libvlccore.dll', 'ffprobe.exe', 'tone.exe')) {
    Copy-Item (Join-Path $ReleaseDir $f) (Join-Path $stage $f) -Force
}
# vlc-cache-gen.exe is optional at runtime (lib.rs only uses it when present) but
# harmless to ship: it lets the portable folder build plugins.dat on first launch.
$cacheGen = Join-Path $ReleaseDir 'vlc-cache-gen.exe'
if (Test-Path $cacheGen) { Copy-Item $cacheGen (Join-Path $stage 'vlc-cache-gen.exe') -Force }

Copy-Item (Join-Path $ReleaseDir 'plugins') (Join-Path $stage 'plugins') -Recurse -Force

$pluginDlls = @(Get-ChildItem -Path (Join-Path $stage 'plugins') -Recurse -File -Filter '*.dll').Count
if ($pluginDlls -eq 0) { Die 'plugins tree staged with no DLLs' }

New-Item -ItemType Directory -Force -Path $OutRoot | Out-Null
$zip = Join-Path $OutRoot ("Skald_{0}_portable_win-x64.zip" -f $version)
if (Test-Path $zip) { Remove-Item $zip -Force }

Write-Host 'Creating ZIP (Compress-Archive)...' -ForegroundColor Cyan
# Passing the folder itself keeps the top-level "Skald_portable" folder in the zip.
Compress-Archive -Path $stage -DestinationPath $zip -CompressionLevel Optimal -Force

Remove-Item $stage -Recurse -Force

$sizeMB = (Get-Item $zip).Length / 1MB
Write-Host "`nPortable package ready: $zip" -ForegroundColor Green
Write-Host ("  size        : {0:N1} MB" -f $sizeMB)
Write-Host ("  plugin DLLs : {0}" -f $pluginDlls)
Write-Host '  run         : unzip anywhere writable (NOT Program Files) and start Skald.exe'
Write-Host '  note        : WebView2 runtime must be installed on the machine (built into Win11).'
