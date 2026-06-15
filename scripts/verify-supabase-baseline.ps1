$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$tmpRoot = Resolve-Path (Join-Path $repoRoot '.tmp')
$verificationRoot = Join-Path $tmpRoot 'supabase-baseline-verify'
$fullChainRoot = Join-Path $verificationRoot 'full-chain'
$squashedRoot = Join-Path $verificationRoot 'squashed'
$fullDump = Join-Path $verificationRoot 'full-chain.sql'
$squashedDump = Join-Path $verificationRoot 'squashed.sql'
$supabase = Join-Path $repoRoot 'node_modules\@supabase\cli-windows-x64\bin\supabase.exe'
$checksumManifest = Get-Content `
  -LiteralPath (Join-Path $repoRoot 'supabase\migration-checksums.json') `
  -Raw |
  ConvertFrom-Json
$baselineVersion = $checksumManifest.immutableThrough
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
if ($baselineVersion -gt $lastVersion) {
  throw "Baseline version $baselineVersion is newer than latest migration $lastVersion."
}
$baselineInputFiles = @(
  $migrationFiles | Where-Object { $_.Name.Substring(0, 14) -le $baselineVersion }
)
$isAlreadySquashed = (
  $baselineInputFiles.Count -eq 1 -and
  $baselineInputFiles[0].Name.Substring(0, 14) -eq $baselineVersion
)

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
  if ($isAlreadySquashed) {
    Write-Host "Baseline $baselineVersion is already squashed; verifying chain reproducibility."
  }
  else {
    Invoke-Supabase -Workdir $fullChainRoot -Arguments @(
      'migration', 'squash', '--local', '--version', $baselineVersion, '--yes'
    )

    $squashedMigration = Get-ChildItem `
      -LiteralPath (Join-Path $fullChainRoot 'supabase\migrations') `
      -Filter "$($baselineVersion)_*.sql"
    if ($squashedMigration.Count -ne 1) {
      throw "Expected one baseline migration for $baselineVersion, found $($squashedMigration.Count)."
    }

    $aclCorrectionMigration = Get-ChildItem `
      -LiteralPath (Join-Path $fullChainRoot 'supabase\migrations') `
      -Filter '*_restore_baseline_acl.sql' |
      Select-Object -First 1
    if (-not $aclCorrectionMigration) {
      $aclCorrectionVersion = ([int64]$lastVersion + 1).ToString('00000000000000')
      $aclCorrectionMigration = New-Item -ItemType File -Path (
        Join-Path $fullChainRoot "supabase\migrations\$($aclCorrectionVersion)_restore_baseline_acl.sql"
      )
    }

    $aclStatements = Get-Content -LiteralPath $fullDump |
      Where-Object { $_ -match '^(GRANT|REVOKE) ' }
    $aclCorrection = @(
      '-- Restore the exact ACL state after objects inherit Supabase defaults.'
      'REVOKE ALL PRIVILEGES ON SCHEMA public FROM anon, authenticated, service_role;'
      'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated, service_role;'
      'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, service_role;'
      'REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated, service_role;'
      ''
    ) + $aclStatements
    Set-Content -LiteralPath $aclCorrectionMigration.FullName -Value $aclCorrection
  }
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
