# stage-windows-runtime.ps1
#
# Populates the two git-ignored runtime directories that every Windows release
# build needs but that must NOT be committed (see README "Bundled Runtime"):
#
#   src-tauri/vlc-dist/  <- libvlc.dll, libvlccore.dll, vlc-cache-gen.exe, plugins\
#   src-tauri/bin/       <- ffprobe.exe, tone.exe
#
# It is the Windows counterpart of scripts/stage-linux-vlc.mjs. It is used both
# locally and by the GitHub Actions workflow (.github/workflows/build-windows.yml)
# so a clean checkout can be built without any pre-installed VLC / FFmpeg / tone.
#
# Sources (each overridable so a flaky mirror never blocks a build):
#   * LibVLC  : official VideoLAN win64 archive of a pinned 3.0.x release
#               (https://get.videolan.org/vlc/<ver>/win64/vlc-<ver>-win64.7z),
#               or a local VLC program dir via -VlcDir (fastest for local use).
#   * ffprobe : FFmpeg "release essentials" build (https://www.gyan.dev/ffmpeg/builds/)
#   * tone    : latest (or pinned) Windows asset of github.com/sandreas/tone,
#               resolved at run time through the GitHub API so asset names never
#               need to be hard-coded.
#
# Every step prints what it is doing and exits non-zero with an actionable
# message on failure, so CI logs pinpoint exactly which runtime file is missing.

[CmdletBinding()]
param(
    # Optional path to an existing VLC installation (e.g. "C:\Program Files\VideoLAN\VLC").
    # When provided, the VLC runtime is copied from there and nothing is downloaded.
    [string]$VlcDir = '',
    # Official VideoLAN 3.0.x release used when -VlcDir is not provided.
    [string]$VlcVersion = '3.0.21',
    # FFmpeg essentials archive URL (contains bin/ffprobe.exe).
    [string]$FfmpegArchiveUrl = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
    # tone release to fetch: 'latest' or an exact tag such as 'v0.2.4'.
    [string]$ToneRelease = 'latest',
    # Re-download / re-copy even when a complete runtime is already staged.
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root   = (Resolve-Path (Split-Path -Parent $PSScriptRoot)).Path
$vlcDist = Join-Path $root 'src-tauri\vlc-dist'
$binDir  = Join-Path $root 'src-tauri\bin'
$work    = Join-Path ([System.IO.Path]::GetTempPath()) ("skald-stage-" + [guid]::NewGuid().ToString('N'))

function Step([string]$msg) { Write-Host "`n===== $msg =====" -ForegroundColor Cyan }
function Info([string]$msg) { Write-Host "  $msg" }
function Die([string]$msg) {
    Write-Host "`n[stage-windows-runtime] FATAL: $msg" -ForegroundColor Red
    Write-Host 'Fix the reported problem and re-run this script (add -Force to re-stage).'
    exit 1
}

# ---------------------------------------------------------------- requirements
$requiredVlcFiles = @('libvlc.dll', 'libvlccore.dll', 'vlc-cache-gen.exe')

function Assert-RequiredRuntime() {
    $missing = @()
    foreach ($f in $requiredVlcFiles) {
        if (-not (Test-Path (Join-Path $vlcDist $f))) { $missing += "src-tauri\vlc-dist\$f" }
    }
    if (-not (Test-Path (Join-Path $vlcDist 'plugins'))) { $missing += 'src-tauri\vlc-dist\plugins\' }
    foreach ($f in @('ffprobe.exe', 'tone.exe')) {
        if (-not (Test-Path (Join-Path $binDir $f))) { $missing += "src-tauri\bin\$f" }
    }
    if ($missing.Count -gt 0) {
        Die ("staged runtime is incomplete; missing:`n  - " + ($missing -join "`n  - "))
    }
    $pluginCount = @(Get-ChildItem -Path (Join-Path $vlcDist 'plugins') -Recurse -File -Filter '*.dll').Count
    Info ("Verified runtime: {0} VLC plugins, ffprobe {1:N1} MB, tone {2:N1} MB." -f `
        $pluginCount,
        ((Get-Item (Join-Path $binDir 'ffprobe.exe')).Length / 1MB),
        ((Get-Item (Join-Path $binDir 'tone.exe')).Length / 1MB))
}

# Skip work when a previous run already staged a valid runtime.
if (-not $Force) {
    $complete = $true
    foreach ($f in $requiredVlcFiles) {
        if (-not (Test-Path (Join-Path $vlcDist $f))) { $complete = $false }
    }
    if (-not (Test-Path (Join-Path $binDir 'ffprobe.exe'))) { $complete = $false }
    if (-not (Test-Path (Join-Path $binDir 'tone.exe')))     { $complete = $false }
    if ($complete) {
        Step 'Runtime already staged'
        Assert-RequiredRuntime
        Write-Host 'Nothing to do. Pass -Force to re-stage from scratch.'
        exit 0
    }
}

try {
    New-Item -ItemType Directory -Force -Path $work | Out-Null
    New-Item -ItemType Directory -Force -Path $vlcDist | Out-Null
    New-Item -ItemType Directory -Force -Path $binDir  | Out-Null

    # ---------------------------------------------------------------- LibVLC
    Step "Stage LibVLC runtime into src-tauri\vlc-dist"
    if ($VlcDir) {
        if (-not (Test-Path (Join-Path $VlcDir 'libvlc.dll'))) {
            Die "-VlcDir '$VlcDir' does not contain libvlc.dll. Point it at a VLC install root (e.g. 'C:\Program Files\VideoLAN\VLC')."
        }
        Info "Copying VLC runtime from: $VlcDir"
        $vlcRoot = $VlcDir
    }
    else {
        $hosts = @(
            "https://get.videolan.org/vlc/$VlcVersion/win64/vlc-$VlcVersion-win64.7z",
            "https://download.videolan.org/vlc/$VlcVersion/win64/vlc-$VlcVersion-win64.7z"
        )
        $archive = Join-Path $work 'vlc.7z'
        $ok = $false
        foreach ($url in $hosts) {
            Info "Downloading $url"
            try {
                Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing -TimeoutSec 600
                if ((Get-Item $archive).Length -lt 10MB) { throw 'archive suspiciously small' }
                $ok = $true
                break
            }
            catch {
                Write-Host "    download failed: $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
        if (-not $ok) { Die "could not download VLC $VlcVersion from any mirror. Try a different -VlcVersion or pass -VlcDir." }

        $extract = Join-Path $work 'vlc-x'
        New-Item -ItemType Directory -Force -Path $extract | Out-Null
        $sevenZip = @()
        $candidates = @((Join-Path $env:ProgramFiles '7-Zip\7z.exe'))
        if (${env:ProgramFiles(x86)}) { $candidates += (Join-Path ${env:ProgramFiles(x86)} '7-Zip\7z.exe') }
        $sevenZip = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
        $szOnPath = Get-Command '7z.exe' -ErrorAction SilentlyContinue
        if (-not $sevenZip -and $szOnPath) { $sevenZip = $szOnPath.Source }

        if ($sevenZip) {
            Info "Extracting with 7-Zip: $sevenZip"
            & $sevenZip x $archive ("-o$extract") -y | Out-Null
            if ($LASTEXITCODE -ne 0) { Die "7-Zip extraction failed (exit $LASTEXITCODE) for $archive" }
        }
        else {
            # Windows 10/11 ships bsdtar; libarchive can read 7z in recent builds.
            Info '7-Zip not found; attempting bsdtar (tar.exe) extraction...'
            & tar.exe -xf $archive -C $extract 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Die 'no 7-Zip found and bsdtar could not read the .7z archive. Install 7-Zip, or pass -VlcDir pointing at a local VLC install.'
            }
        }

        # Official archives extract to a versioned sub-folder; locate libvlc.dll anywhere.
        $libvlc = Get-ChildItem -Path $extract -Recurse -Filter 'libvlc.dll' -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $libvlc) { Die "no libvlc.dll found inside the extracted VLC $VlcVersion archive" }
        $vlcRoot = $libvlc.DirectoryName
        Info "VLC runtime root: $vlcRoot"
    }

    # Copy the files the bundler/resource mapping expects (tauri.windows.conf.json).
    foreach ($f in $requiredVlcFiles) {
        $src = Join-Path $vlcRoot $f
        if (-not (Test-Path $src)) {
            Die "VLC root '$vlcRoot' is missing '$f'. Use an official VideoLAN 3.0.x install/archive (vlc-cache-gen.exe ships in its root)."
        }
        Copy-Item $src (Join-Path $vlcDist $f) -Force
        Info ("copied {0} ({1:N1} MB)" -f $f, ((Get-Item $src).Length / 1MB))
    }
    $srcPlugins = Join-Path $vlcRoot 'plugins'
    if (-not (Test-Path $srcPlugins)) {
        $srcPlugins = Get-ChildItem -Path $vlcRoot -Directory -Recurse -Filter 'plugins' -ErrorAction SilentlyContinue |
            Where-Object { @(Get-ChildItem $_.FullName -Recurse -File -Filter '*.dll').Count -gt 10 } |
            Select-Object -First 1 -ExpandProperty FullName
    }
    if (-not $srcPlugins -or -not (Test-Path $srcPlugins)) {
        Die "no VLC plugins/ tree found under '$vlcRoot'"
    }
    $dstPlugins = Join-Path $vlcDist 'plugins'
    if (Test-Path $dstPlugins) { Remove-Item $dstPlugins -Recurse -Force }
    Copy-Item $srcPlugins $dstPlugins -Recurse -Force
    $dllCount = @(Get-ChildItem -Path $dstPlugins -Recurse -File -Filter '*.dll').Count
    if ($dllCount -eq 0) { Die 'VLC plugins tree copied but contains no DLLs' }
    Info "copied plugins\ ($dllCount plugin DLLs)"

    # ----------------------------------------------------------------- ffprobe
    Step 'Stage ffprobe.exe into src-tauri\bin'
    $ffzip = Join-Path $work 'ffmpeg.zip'
    Info "Downloading $FfmpegArchiveUrl"
    Invoke-WebRequest -Uri $FfmpegArchiveUrl -OutFile $ffzip -UseBasicParsing -TimeoutSec 600
    $ffx = Join-Path $work 'ffmpeg-x'
    New-Item -ItemType Directory -Force -Path $ffx | Out-Null
    Expand-Archive -Path $ffzip -DestinationPath $ffx -Force
    $ffprobe = Get-ChildItem -Path $ffx -Recurse -Filter 'ffprobe.exe' | Select-Object -First 1
    if (-not $ffprobe) { Die 'no ffprobe.exe inside the FFmpeg archive' }
    Copy-Item $ffprobe.FullName (Join-Path $binDir 'ffprobe.exe') -Force
    Info ("copied ffprobe.exe ({0:N1} MB)" -f ($ffprobe.Length / 1MB))

    # -------------------------------------------------------------------- tone
    Step 'Stage tone.exe into src-tauri\bin'
    $ghHeaders = @{ 'Accept' = 'application/vnd.github+json'; 'User-Agent' = 'skald-build' }
    if ($env:GITHUB_TOKEN) { $ghHeaders['Authorization'] = "Bearer $env:GITHUB_TOKEN" }
    $relUrl = if ($ToneRelease -eq 'latest') {
        'https://api.github.com/repos/sandreas/tone/releases/latest'
    } else {
        "https://api.github.com/repos/sandreas/tone/releases/tags/$ToneRelease"
    }
    Info "Querying $relUrl"
    $release = Invoke-RestMethod -Uri $relUrl -Headers $ghHeaders -TimeoutSec 60
    $assets = @($release.assets)
    # Prefer a 64-bit Windows zip; fall back to any Windows asset.
    $pick = $assets |
        Where-Object { $_.name -match '(?i)(win|windows)' -and $_.name -match '(?i)(x64|amd64|x86_64|64-bit|win64)' -and $_.name -match '\.(zip|7z|exe|tar\.gz)$' } |
        Sort-Object @{ Expression = { if ($_.name -like '*.zip') { 0 } elseif ($_.name -like '*.exe') { 1 } else { 2 } } } |
        Select-Object -First 1
    if (-not $pick) {
        $pick = $assets | Where-Object { $_.name -match '(?i)(win|windows)' } | Select-Object -First 1
    }
    if (-not $pick) {
        Die ('no Windows asset found in tone release "{0}". Available assets: {1}' -f `
            $release.tag_name, (($assets | ForEach-Object { $_.name }) -join ', '))
    }
    Info "Downloading tone asset: $($pick.name)"
    Invoke-WebRequest -Uri $pick.browser_download_url -OutFile (Join-Path $work 'tone.dl') -UseBasicParsing -TimeoutSec 300
    $toneSrc = Join-Path $work 'tone.dl'
    if ($pick.name -match '\.(zip|7z)$') {
        $tx = Join-Path $work 'tone-x'
        New-Item -ItemType Directory -Force -Path $tx | Out-Null
        if ($pick.name -like '*.zip') {
            Expand-Archive -Path $toneSrc -DestinationPath $tx -Force
        }
        $found = Get-ChildItem -Path $tx -Recurse -Filter 'tone.exe' | Select-Object -First 1
        if (-not $found) { Die 'tone archive extracted but no tone.exe inside' }
        $toneSrc = $found.FullName
    }
    Copy-Item $toneSrc (Join-Path $binDir 'tone.exe') -Force
    Info ("copied tone.exe ({0:N1} MB)" -f ((Get-Item (Join-Path $binDir 'tone.exe')).Length / 1MB))

    # ------------------------------------------------------------- final check
    Step 'Verify staged runtime'
    Assert-RequiredRuntime
    Write-Host '`nRuntime staging complete:' -ForegroundColor Green
    Get-ChildItem -Path $vlcDist -File | ForEach-Object { Info ("  src-tauri\vlc-dist\{0}  ({1:N1} MB)" -f $_.Name, ($_.Length / 1MB)) }
    Info "  src-tauri\vlc-dist\plugins\  ($dllCount DLLs)"
    Get-ChildItem -Path $binDir -File | ForEach-Object { Info ("  src-tauri\bin\{0}  ({1:N1} MB)" -f $_.Name, ($_.Length / 1MB)) }
}
finally {
    if (Test-Path $work) { Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue }
}
