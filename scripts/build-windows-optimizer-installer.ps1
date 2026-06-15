$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root '.venv\Scripts\python.exe'
$output = Join-Path $root 'outputs\windows-installer'
$publicDownloads = Join-Path $root 'public\downloads'
$work = Join-Path $root ".tmp\windows-installer-build-$([guid]::NewGuid().ToString('N'))"
$installerName = 'CCC-Bus-Allocation-Optimizer-Setup.exe'

if (-not (Test-Path -LiteralPath $python)) {
  throw 'Python environment is missing. Run npm.cmd run optimizer:local:setup first.'
}

& $python -m pip install --disable-pip-version-check pyinstaller==6.16.0
if ($LASTEXITCODE -ne 0) {
  throw 'Failed to install PyInstaller.'
}

New-Item -ItemType Directory -Force -Path $output | Out-Null
New-Item -ItemType Directory -Force -Path $work | Out-Null

$env:PYTHONPATH = Join-Path $root 'optimizer'
& $python -m PyInstaller `
  --noconfirm `
  --onefile `
  --windowed `
  --name 'CCC-Bus-Allocation-Optimizer-Setup' `
  --distpath $output `
  --workpath (Join-Path $work 'work') `
  --specpath (Join-Path $work 'spec') `
  --collect-all ortools `
  (Join-Path $root 'optimizer\exact_optimizer\windows_installer.py')

if ($LASTEXITCODE -ne 0) {
  throw 'Failed to build the Windows optimizer installer.'
}

New-Item -ItemType Directory -Force -Path $publicDownloads | Out-Null
Copy-Item `
  -LiteralPath (Join-Path $output $installerName) `
  -Destination (Join-Path $publicDownloads $installerName) `
  -Force

Write-Host "Created: $(Join-Path $output $installerName)"
Write-Host "Published: $(Join-Path $publicDownloads $installerName)"
