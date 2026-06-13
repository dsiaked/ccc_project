$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$tmpRoot = Resolve-Path (Join-Path $repoRoot '.tmp')
$verificationRoot = Join-Path $tmpRoot 'supabase-baseline-verify'
$fullChainRoot = Join-Path $verificationRoot 'full-chain'
$squashedRoot = Join-Path $verificationRoot 'squashed'
$fullDump = Join-Path $verificationRoot 'full-chain.sql'
$squashedDump = Join-Path $verificationRoot 'squashed.sql'
$supabase = Join-Path $repoRoot 'node_modules\@supabase\cli-windows-x64\bin\supabase.exe'

$resolvedVerificationParent = [System.IO.Path]::GetFullPath(
  [System.IO.Path]::GetDirectoryName($verificationRoot)
)
if ($resolvedVerificationParent -ne [System.IO.Path]::GetFullPath($tmpRoot)) {
  throw "Refusing to use verification directory outside .tmp: $verificationRoot"
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker Desktop is required for baseline verification.'
}

if (-not (Test-Path -LiteralPath $supabase)) {
  throw "Supabase CLI not found: $supabase"
}

if (Test-Path -LiteralPath $verificationRoot) {
  Remove-Item -LiteralPath $verificationRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $fullChainRoot | Out-Null
Copy-Item -LiteralPath (Join-Path $repoRoot 'supabase') -Destination $fullChainRoot -Recurse

function Invoke-Supabase {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Workdir,
    [Parameter(Mandatory = $true)]
    [string[]] $Arguments
  )

  & $supabase @Arguments --workdir $Workdir
  if ($LASTEXITCODE -ne 0) {
    throw "Supabase command failed: $($Arguments -join ' ')"
  }
}

try {
  Invoke-Supabase -Workdir $fullChainRoot -Arguments @('start')
  Invoke-Supabase -Workdir $fullChainRoot -Arguments @('db', 'reset', '--local', '--yes')
  Invoke-Supabase -Workdir $fullChainRoot -Arguments @(
    'db', 'dump', '--local', '--schema', 'public', '--file', $fullDump
  )
  Invoke-Supabase -Workdir $fullChainRoot -Arguments @(
    'migration', 'squash', '--local', '--yes'
  )
}
finally {
  & $supabase stop --workdir $fullChainRoot --no-backup 2>$null
}

New-Item -ItemType Directory -Path $squashedRoot | Out-Null
Copy-Item -LiteralPath (Join-Path $fullChainRoot 'supabase') -Destination $squashedRoot -Recurse

try {
  Invoke-Supabase -Workdir $squashedRoot -Arguments @('start')
  Invoke-Supabase -Workdir $squashedRoot -Arguments @('db', 'reset', '--local', '--yes')
  Invoke-Supabase -Workdir $squashedRoot -Arguments @(
    'db', 'dump', '--local', '--schema', 'public', '--file', $squashedDump
  )
}
finally {
  & $supabase stop --workdir $squashedRoot --no-backup 2>$null
}

$fullHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $fullDump).Hash
$squashedHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $squashedDump).Hash
if ($fullHash -ne $squashedHash) {
  throw "Squashed schema differs from full chain. Compare $fullDump and $squashedDump."
}

Write-Host "Baseline verified. Matching schema hash: $fullHash"
