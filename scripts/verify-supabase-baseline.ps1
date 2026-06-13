$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$tmpRoot = Resolve-Path (Join-Path $repoRoot '.tmp')
$verificationRoot = Join-Path $tmpRoot 'supabase-baseline-verify'
$fullChainRoot = Join-Path $verificationRoot 'full-chain'
$squashedRoot = Join-Path $verificationRoot 'squashed'
$fullDump = Join-Path $verificationRoot 'full-chain.sql'
$squashedDump = Join-Path $verificationRoot 'squashed.sql'
$supabase = Join-Path $repoRoot 'node_modules\@supabase\cli-windows-x64\bin\supabase.exe'
$excludedServices = 'edge-runtime,gotrue,imgproxy,kong,logflare,mailpit,postgres-meta,postgrest,realtime,storage-api,studio,supavisor,vector'
$dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
$dockerCandidates = @(
  $dockerCommand.Source,
  (Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
$docker = $dockerCandidates | Select-Object -First 1
$migrationFiles = Get-ChildItem -LiteralPath (Join-Path $repoRoot 'supabase\migrations') `
  -Filter '*.sql' |
  Sort-Object Name
if ($migrationFiles.Count -eq 0) {
  throw 'No Supabase migrations found.'
}
$lastVersion = $migrationFiles[-1].Name.Substring(0, 14)

$resolvedVerificationParent = [System.IO.Path]::GetFullPath(
  [System.IO.Path]::GetDirectoryName($verificationRoot)
)
if ($resolvedVerificationParent -ne [System.IO.Path]::GetFullPath($tmpRoot)) {
  throw "Refusing to use verification directory outside .tmp: $verificationRoot"
}

if (-not (Test-Path -LiteralPath $supabase)) {
  throw "Supabase CLI not found: $supabase"
}

if (-not $docker) {
  throw 'Docker Desktop is required for baseline verification.'
}

$dockerCheckOut = Join-Path $tmpRoot 'supabase-baseline-docker-check.out'
$dockerCheckError = Join-Path $tmpRoot 'supabase-baseline-docker-check.err'
$dockerCheck = Start-Process -FilePath $docker `
  -ArgumentList @('info', '--format', '{{.ServerVersion}}') `
  -NoNewWindow `
  -PassThru `
  -RedirectStandardOutput $dockerCheckOut `
  -RedirectStandardError $dockerCheckError
if (-not $dockerCheck.WaitForExit(15000)) {
  $dockerCheck.Kill()
  throw 'Docker Desktop is installed but its engine is not ready.'
}
$dockerCheck.WaitForExit()
$dockerServerVersion = Get-Content -LiteralPath $dockerCheckOut -Raw
if ([string]::IsNullOrWhiteSpace($dockerServerVersion)) {
  throw 'Docker Desktop is installed but its engine is not ready.'
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

function Stop-Supabase {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Workdir
  )

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & $supabase stop --workdir $Workdir --no-backup *> $null
  $ErrorActionPreference = $previousErrorActionPreference
}

try {
  Invoke-Supabase -Workdir $fullChainRoot -Arguments @(
    'start', '--exclude', $excludedServices
  )
  Invoke-Supabase -Workdir $fullChainRoot -Arguments @('db', 'reset', '--local', '--yes')
  Invoke-Supabase -Workdir $fullChainRoot -Arguments @(
    'db', 'dump', '--local', '--schema', 'public', '--file', $fullDump
  )
  Invoke-Supabase -Workdir $fullChainRoot -Arguments @(
    'migration', 'squash', '--local', '--version', $lastVersion, '--yes'
  )
}
finally {
  Stop-Supabase -Workdir $fullChainRoot
}

New-Item -ItemType Directory -Path $squashedRoot | Out-Null
Copy-Item -LiteralPath (Join-Path $fullChainRoot 'supabase') -Destination $squashedRoot -Recurse

try {
  Invoke-Supabase -Workdir $squashedRoot -Arguments @(
    'start', '--exclude', $excludedServices
  )
  Invoke-Supabase -Workdir $squashedRoot -Arguments @('db', 'reset', '--local', '--yes')
  Invoke-Supabase -Workdir $squashedRoot -Arguments @(
    'db', 'dump', '--local', '--schema', 'public', '--file', $squashedDump
  )
}
finally {
  Stop-Supabase -Workdir $squashedRoot
}

$fullHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $fullDump).Hash
$squashedHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $squashedDump).Hash
if ($fullHash -ne $squashedHash) {
  throw "Squashed schema differs from full chain. Compare $fullDump and $squashedDump."
}

Write-Host "Baseline verified. Matching schema hash: $fullHash"
