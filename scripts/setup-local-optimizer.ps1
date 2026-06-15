$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$venv = Join-Path $root '.venv'
$python = Join-Path $venv 'Scripts\python.exe'

if (-not (Test-Path -LiteralPath $python)) {
  py install 3.12
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "Failed to install Python 3.12 with py (exit code $exitCode)."
  }

  py -3.12 -m venv $venv
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "Failed to create the local optimizer Python environment with py (exit code $exitCode)."
  }
}

if (-not (Test-Path -LiteralPath $python)) {
  throw 'Failed to create the local optimizer Python environment.'
}

& $python -m pip install --disable-pip-version-check -r (Join-Path $root 'optimizer\requirements.txt')
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
  throw "Failed to install local optimizer Python dependencies with pip (exit code $exitCode)."
}
