$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root '.venv\Scripts\python.exe'

if (-not (Test-Path -LiteralPath $python)) {
  throw 'Local optimizer is not installed. Run npm run optimizer:local:setup first.'
}

$env:PYTHONPATH = Join-Path $root 'optimizer'
Set-Location -LiteralPath $root
& $python -m exact_optimizer.local_worker @args
