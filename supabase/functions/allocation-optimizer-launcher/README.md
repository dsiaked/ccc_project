# Allocation Optimizer Launcher

This global-admin-only Edge Function starts one Cloud Run Job execution for an
existing `PENDING` allocation optimization job.

## Required secrets

```powershell
supabase secrets set GCP_PROJECT_ID=your-project-id
supabase secrets set GCP_REGION=asia-northeast3
supabase secrets set GCP_RUN_JOB_NAME=ccc-bus-allocation-optimizer
```

Register the service-account JSON through an env file so PowerShell does not
strip or reinterpret its JSON quotes:

```powershell
$serviceAccount = Get-Content .\launcher-service-account.json -Raw | ConvertFrom-Json
$envLine = 'GCP_SERVICE_ACCOUNT_JSON=' + ($serviceAccount | ConvertTo-Json -Compress)
[IO.File]::WriteAllText('.\launcher-secret.env', $envLine, (New-Object Text.UTF8Encoding($false)))
supabase secrets set --env-file .\launcher-secret.env
Remove-Item .\launcher-secret.env
```

Do not commit either file. The Google service account should have
`roles/run.jobsExecutorWithOverrides` on the configured Cloud Run Job because
the launcher supplies `ALLOCATION_OPTIMIZATION_JOB_ID` and `WORKER_ID` as
execution overrides. The Cloud Run Job itself receives the Supabase
service-role key through Google Secret Manager.

Deploy:

```powershell
supabase functions deploy allocation-optimizer-launcher
```

The browser first creates a job through
`create_allocation_optimization_job()`, then invokes this function with:

```json
{ "jobId": "optimization-job-uuid" }
```
