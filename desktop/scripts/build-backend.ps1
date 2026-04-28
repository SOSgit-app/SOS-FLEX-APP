$ErrorActionPreference = "Stop"

$desktop = Resolve-Path (Join-Path $PSScriptRoot "..")
$repo = Resolve-Path (Join-Path $desktop "..")

$venvDir = Join-Path $desktop ".venv-backend-build"
$pyExe = Join-Path $venvDir "Scripts\\python.exe"

if (-not (Test-Path $pyExe)) {
  Write-Host "Creating venv for backend build at $venvDir"
  py -3 -m venv $venvDir
}

Write-Host "Installing build deps (pyinstaller) + app deps…"
& $pyExe -m pip install --upgrade pip | Out-Host
& $pyExe -m pip install pyinstaller | Out-Host
& $pyExe -m pip install -r (Join-Path $repo "requirements.txt") | Out-Host

$outDir = Join-Path $desktop "backend-dist"
if (Test-Path $outDir) { Remove-Item -Recurse -Force $outDir }
New-Item -ItemType Directory -Path $outDir | Out-Null

$entry = Join-Path $desktop "backend\\entry.py"
$appPy = Join-Path $repo "app.py"

Write-Host "Building backend.exe…"
Push-Location $repo
& $pyExe -m PyInstaller `
  --noconfirm `
  --clean `
  --onefile `
  --name flex-backend `
  --distpath $outDir `
  --workpath (Join-Path $desktop "backend-build") `
  --specpath (Join-Path $desktop "backend-spec") `
  --add-data="$((Join-Path $repo "templates"));templates" `
  --add-data="$((Join-Path $repo "public"));public" `
  --add-data="$appPy;." `
  $entry | Out-Host
Pop-Location

Write-Host "Backend built at $outDir\\flex-backend.exe"

