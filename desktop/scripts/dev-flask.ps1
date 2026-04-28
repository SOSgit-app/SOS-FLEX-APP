$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$repoRoot = Resolve-Path (Join-Path $root "..")

$venvDir = Join-Path $root ".venv"
$pyExe = Join-Path $venvDir "Scripts\\python.exe"

if (-not (Test-Path $pyExe)) {
  Write-Host "Creating Python venv at $venvDir"
  py -3 -m venv $venvDir
}

Write-Host "Installing Python dependencies (if needed)…"
& $pyExe -m pip install --upgrade pip | Out-Host
& $pyExe -m pip install -r (Join-Path $repoRoot "requirements.txt") | Out-Host

if (-not $env:PORT -or $env:PORT.Trim() -eq "") { $env:PORT = "5000" }
if (-not $env:FLASK_DEBUG -or $env:FLASK_DEBUG.Trim() -eq "") { $env:FLASK_DEBUG = "0" }

Write-Host "Starting Flask on http://127.0.0.1:$($env:PORT)/"
& $pyExe (Join-Path $repoRoot "app.py")

