# Downloads official whisper.cpp CUDA build and installs it for Virelia Prism.
# Usage (from repo root):
#   powershell -ExecutionPolicy Bypass -File .\scripts\setup-whisper-gpu.ps1

param(
    [string]$Version = "v1.8.7",
    [string]$CudaPackage = "12.4.0"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent
$TargetDir = Join-Path $RepoRoot "src-tauri\resources\bin\windows"
$CacheDir = Join-Path $env:TEMP "virelia-whisper-gpu"
$ZipName = "whisper-cublas-$CudaPackage-bin-x64.zip"
$Url = "https://github.com/ggml-org/whisper.cpp/releases/download/$Version/$ZipName"
$ZipPath = Join-Path $CacheDir $ZipName

Write-Host "Virelia Prism - Whisper GPU setup"
Write-Host "Target: $TargetDir"
Write-Host "Download: $Url"

New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null
New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null

if (-not (Test-Path $ZipPath)) {
    Write-Host "Downloading (~450 MB)..."
    Invoke-WebRequest -Uri $Url -OutFile $ZipPath -UseBasicParsing
} else {
    Write-Host "Using cached zip: $ZipPath"
}

$ExtractDir = Join-Path $CacheDir "extracted"
if (Test-Path $ExtractDir) {
    Remove-Item -Recurse -Force $ExtractDir
}
Expand-Archive -Path $ZipPath -DestinationPath $ExtractDir -Force

$Cli = Get-ChildItem -Path $ExtractDir -Recurse -Filter "whisper-cli.exe" | Select-Object -First 1
if (-not $Cli) {
    throw "whisper-cli.exe not found inside $ZipName"
}

$SourceRoot = $Cli.Directory.FullName
Write-Host "Found whisper-cli at: $($Cli.FullName)"

Copy-Item -Force $Cli.FullName (Join-Path $TargetDir "whisper-cli-cuda.exe")

Get-ChildItem -Path $SourceRoot -Filter "*.dll" | ForEach-Object {
    Copy-Item -Force $_.FullName (Join-Path $TargetDir $_.Name)
}

$CpuCli = Join-Path $TargetDir "whisper-cli.exe"
if (-not (Test-Path $CpuCli)) {
    Write-Host "Note: whisper-cli.exe (CPU) not present. GPU build will be used when GPU is enabled."
    Write-Host "For CPU fallback, also install whisper-bin-x64.zip whisper-cli.exe here."
}

Write-Host ""
Write-Host "Done. Installed:"
Get-ChildItem $TargetDir -Filter "whisper-cli*.exe" | ForEach-Object { Write-Host "  $($_.Name)" }
Get-ChildItem $TargetDir -Filter "*.dll" | ForEach-Object { Write-Host "  $($_.Name)" }

Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. npm run tauri:dev"
Write-Host "  2. Settings - Subtitles - GPU acceleration - Auto"
Write-Host "  3. Regenerate subtitles"

$Model = Join-Path $RepoRoot "src-tauri\resources\models\ggml-base.bin"
if (-not (Test-Path $Model)) {
    $AppModel = Join-Path $env:APPDATA "com.virelia.prism\models\ggml-medium.bin"
    if (Test-Path $AppModel) { $Model = $AppModel }
}
if (Test-Path $Model) {
    Write-Host ""
    Write-Host "GPU probe (whisper-cli-cuda -h):"
    & (Join-Path $TargetDir "whisper-cli-cuda.exe") -h 2>&1 | Select-String -Pattern "ngl|gpu" | Select-Object -First 3
}
