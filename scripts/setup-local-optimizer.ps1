$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$venv = Join-Path $root '.venv'
$python = Join-Path $venv 'Scripts\python.exe'

if (-not (Test-Path -LiteralPath $python)) {
  py install 3.12
  py -3.12 -m venv $venv
}

if (-not (Test-Path -LiteralPath $python)) {
  throw 'Failed to create the local optimizer Python environment.'
}

& $python -m pip install --disable-pip-version-check -r (Join-Path $root 'optimizer\requirements.txt')
