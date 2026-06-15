$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root '.venv\Scripts\python.exe'
$requirements = Join-Path $root 'optimizer\requirements-dev.txt'

if (-not (Test-Path -LiteralPath $python)) {
  throw 'Run npm run optimizer:local:setup before running optimizer tests.'
}

& $python -c 'import pytest' *> $null
if ($LASTEXITCODE -ne 0) {
  & $python -m pip install --disable-pip-version-check -r $requirements
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to install optimizer test dependencies with exit code $LASTEXITCODE."
  }
}

Push-Location (Join-Path $root 'optimizer')
try {
  & $python -m pytest tests -q -p no:cacheprovider
  if ($LASTEXITCODE -ne 0) {
    throw "Optimizer tests failed with exit code $LASTEXITCODE."
  }
} finally {
  Pop-Location
}
