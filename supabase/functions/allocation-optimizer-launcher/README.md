# Allocation Optimizer Launcher

This global-admin-only Edge Function starts one Cloud Run Job execution for an
existing `PENDING` allocation optimization job.

## Required secrets

```powershell
supabase secrets set GCP_PROJECT_ID=your-project-id
supabase secrets set GCP_REGION=asia-northeast3
supabase secrets set GCP_RUN_JOB_NAME=ccc-bus-allocation-optimizer
supabase secrets set GCP_SERVICE_ACCOUNT_JSON='<service-account-json>'
```

The Google service account should have only the permission required to run the
configured Cloud Run Job. The Cloud Run Job itself receives the Supabase
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

