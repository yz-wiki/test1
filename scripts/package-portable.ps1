# package-portable.ps1
#
# Produces a portable (green / no-install) Windows ZIP of ADSplayer from a
# finished release build. Tauri has no built-in "zip" bundle target, but
# build.rs copies the whole runnable runtime (LibVLC + helpers) next to the exe
# in src-tauri\target\release, so that directory is already self-contained.
# This script picks exactly the files that must travel together and zips them.
#
# Two flavours:
#   default  full package: playback + local-library metadata helpers
#   -Core    playback only: drops ffprobe.exe and tone.exe (~150 MB uncompressed).
#            The app already degrades gracefully when those helpers are absent;
#            local-library chapter reading and "Embed Metadata" write-back are
#            unavailable until the two binaries are placed next to the exe.
#
# Run AFTER a release build, e.g.:
#   pnpm tauri build --no-bundle
#   powershell -File scripts/package-portable.ps1
#   powershell -File scripts/package-portable.ps1 -Core
#
# Output (dist\ is git-ignored):
#   dist\ADSplayer_<version>_portable_win-x64.zip
#   dist\ADSplayer_<version>_portable_core_win-x64.zip

[CmdletBinding()]
param(
    # Directory that contains the main exe and the runtime copied by build.rs.
    [string]$ReleaseDir = '',
    # Where to write the finished zip (inside the repo; dist\ is git-ignored).
    [string]$OutRoot = '',
    # Playback-only package: omit the ffprobe/tone metadata helpers.
    [switch]$Core
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

# tauri.conf.json sets mainBinaryName = ADSplayer, so a `tauri build` may have
# renamed the cargo output. Older / plain `cargo build` trees still have
# skald.exe. Accept both and always ship the user-facing name.
$exeCandidates = @('ADSplayer.exe', 'skald.exe')
$mainExe = $exeCandidates | Where-Object { Test-Path (Join-Path $ReleaseDir $_) } | Select-Object -First 1
if (-not $mainExe) {
    Die ("main executable not found in '$ReleaseDir' (looked for: " + ($exeCandidates -join ', ') + ')')
}

# Build the list explicitly: `$x = if (...) { @() }` yields $null in PowerShell,
# and adding $null to an array would create a bogus entry for Join-Path later.
$required = @('libvlc.dll', 'libvlccore.dll')
if (-not $Core) { $required += @('ffprobe.exe', 'tone.exe') }
$missing = @($required | Where-Object { -not (Test-Path (Join-Path $ReleaseDir $_)) })
if ($missing.Count -gt 0) {
    Die ("release dir '$ReleaseDir' is missing: " + ($missing -join ', '))
}
if (-not (Test-Path (Join-Path $ReleaseDir 'plugins'))) {
    Die 'release dir is missing the plugins\ tree (LibVLC modules).'
}

$stageName = if ($Core) { 'ADSplayer_core' } else { 'ADSplayer_portable' }
$stage = Join-Path $OutRoot $stageName
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }

New-Item -ItemType Directory -Force -Path $stage | Out-Null

Write-Host ("Copying runnable layout into staging folder ({0})..." -f $stageName) -ForegroundColor Cyan
Copy-Item (Join-Path $ReleaseDir $mainExe) (Join-Path $stage 'ADSplayer.exe') -Force
foreach ($f in $required) {
    Copy-Item (Join-Path $ReleaseDir $f) (Join-Path $stage $f) -Force
}
# vlc-cache-gen.exe is optional at runtime (lib.rs only uses it when present) but
# harmless to ship: it lets the portable folder build plugins.dat on first launch.
$cacheGen = Join-Path $ReleaseDir 'vlc-cache-gen.exe'
if (Test-Path $cacheGen) { Copy-Item $cacheGen (Join-Path $stage 'vlc-cache-gen.exe') -Force }

Copy-Item (Join-Path $ReleaseDir 'plugins') (Join-Path $stage 'plugins') -Recurse -Force

# VLC on Windows loads modules from the flat plugins\ folder; depending on how
# the runtime was staged the same DLLs can also sit in category subfolders.
# Both layouts resolve, so keeping both merely doubles the package.
$stagePlugins = Join-Path $stage 'plugins'
$flatNames = @{}
foreach ($f in @(Get-ChildItem -Path $stagePlugins -File -Filter '*.dll')) { $flatNames[$f.Name] = $true }
$dup = 0
foreach ($dir in @(Get-ChildItem -Path $stagePlugins -Directory)) {
    foreach ($f in @(Get-ChildItem -Path $dir.FullName -File -Filter '*.dll')) {
        if ($flatNames.ContainsKey($f.Name)) { Remove-Item $f.FullName -Force; $dup++ }
    }
}
$dirCount = @(Get-ChildItem -Path $stagePlugins -Recurse -File -Filter '*.dll').Count
Write-Host ("plugins: {0} duplicate copies dropped, {1} dlls shipped" -f $dup, $dirCount)

$pluginDlls = @(Get-ChildItem -Path $stagePlugins -Recurse -File -Filter '*.dll').Count
if ($pluginDlls -eq 0) { Die 'plugins tree staged with no DLLs' }

# Pre-build LibVLC's module index (plugins.dat) into the package.
#
# Without it, lib.rs runs vlc-cache-gen during setup, before the window exists:
# on a freshly unzipped portable folder that is a ~190 DLL scan which the user
# experiences as a blank window for several seconds and a slow first play. With
# the cache shipped, lib.rs skips the scan entirely (it only builds the cache
# when the file is missing).
#
# Generated AFTER the duplicate pass so the index describes the tree that is
# actually shipped. Failure is never fatal: the app still builds it on first
# launch, exactly as before.
$cacheGenExe = Join-Path $stage 'vlc-cache-gen.exe'
$pluginsDat = Join-Path $stagePlugins 'plugins.dat'
if (Test-Path $cacheGenExe) {
    if (Test-Path $pluginsDat) { Remove-Item $pluginsDat -Force }
    $env:VLC_PLUGIN_PATH = $stagePlugins
    try {
        $proc = Start-Process -FilePath $cacheGenExe `
            -ArgumentList @("`"$stagePlugins`"") `
            -WindowStyle Hidden -Wait -PassThru
        if ((Test-Path $pluginsDat) -and (Get-Item $pluginsDat).Length -gt 0) {
            Write-Host ("plugins.dat : {0:N0} KB pre-generated (first launch skips the scan)" -f ((Get-Item $pluginsDat).Length / 1KB))
        }
        else {
            Write-Host ("plugins.dat : not produced (vlc-cache-gen exit {0}); the app will build it on first launch" -f $proc.ExitCode) -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host ("plugins.dat : generation failed ({0}); the app will build it on first launch" -f $_.Exception.Message) -ForegroundColor Yellow
    }
}
else {
    Write-Host 'plugins.dat : vlc-cache-gen.exe absent, skipping pre-generation' -ForegroundColor Yellow
}

New-Item -ItemType Directory -Force -Path $OutRoot | Out-Null
$pattern = if ($Core) { 'ADSplayer_{0}_portable_core_win-x64.zip' } else { 'ADSplayer_{0}_portable_win-x64.zip' }
$zip = Join-Path $OutRoot ($pattern -f $version)
if (Test-Path $zip) { Remove-Item $zip -Force }

Write-Host 'Creating ZIP (Compress-Archive)...' -ForegroundColor Cyan
# Passing the folder itself keeps the top-level stage folder in the zip.
Compress-Archive -Path $stage -DestinationPath $zip -CompressionLevel Optimal -Force

$stagedFiles = @(Get-ChildItem $stage -Recurse -File)
$stagedBytes = ($stagedFiles | Measure-Object -Property Length -Sum).Sum
Remove-Item $stage -Recurse -Force

$sizeMB = (Get-Item $zip).Length / 1MB
Write-Host "`nPortable package ready: $zip" -ForegroundColor Green
Write-Host ("  uncompressed: {0:N1} MB across {1} files" -f ($stagedBytes / 1MB), $stagedFiles.Count)
Write-Host ("  zip          : {0:N1} MB" -f $sizeMB)
Write-Host ("  plugin DLLs  : {0}" -f $pluginDlls)
Write-Host '  run          : unzip anywhere writable (NOT Program Files) and start ADSplayer.exe'
if ($Core) {
    Write-Host '  note         : CORE build - ffprobe/tone are absent. Local-library chapter' -ForegroundColor Yellow
    Write-Host '                 reading and "Embed Metadata" write-back are unavailable.' -ForegroundColor Yellow
}
Write-Host '  note         : WebView2 runtime must be installed on the machine (built into Win11).'
