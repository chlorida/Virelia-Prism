# Installs built-in offline translation (LibreTranslate) for Virelia Prism.
# Usage (from repo root):
#   powershell -ExecutionPolicy Bypass -File .\scripts\setup-builtin-translation.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent
$TargetDir = Join-Path $RepoRoot "src-tauri\resources\translation"
$VenvDir = Join-Path $TargetDir "venv"

Write-Host "Virelia Prism - Built-in translation setup"
Write-Host "Target: $VenvDir"

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    $python = Get-Command py -ErrorAction SilentlyContinue
    if ($python) {
        $pythonExe = "py"
        $pythonArgs = @("-3")
    }
} else {
    $pythonExe = $python.Source
    $pythonArgs = @()
}

if (-not $python -and -not $pythonExe) {
    throw "Python 3.10+ is required. Install from https://www.python.org/downloads/ and retry."
}

New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null

if (-not (Test-Path (Join-Path $VenvDir "Scripts\python.exe"))) {
    Write-Host "Creating virtual environment..."
    if ($pythonArgs.Count -gt 0) {
        & $pythonExe @pythonArgs -m venv $VenvDir
    } else {
        & $pythonExe -m venv $VenvDir
    }
}

$pip = Join-Path $VenvDir "Scripts\pip.exe"
$venvPython = Join-Path $VenvDir "Scripts\python.exe"

Write-Host "Installing LibreTranslate (this may take a few minutes)..."
& $pip install --upgrade pip
& $pip install "libretranslate==1.6.5"

Write-Host ""
Write-Host "Done. Built-in translation will start automatically with Virelia Prism."
Write-Host "First translation may download language models (~100-300 MB)."
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. npm run tauri:dev"
Write-Host "  2. Settings - Subtitles - Translation - Built-in (offline)"
Write-Host "  3. Generate Russian subtitles"
