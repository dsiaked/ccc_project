# Exact Allocation Optimizer

This package contains the exact CP-SAT allocation engine. It is intentionally
independent from Supabase and Cloud Run integration so the mathematical model
can be tested before infrastructure is added.

## Run tests

```bash
python -m pip install -r optimizer/requirements.txt
python -m unittest discover -s optimizer/tests -v
```

The optimizer accepts anonymized passenger data only. A result is usable by the
application only when its status is `OPTIMAL` and `validate_result` succeeds.

## Local worker

The frontend defaults to local execution mode. Install and start the local
worker from the repository root:

```powershell
npm run optimizer:local:setup
npm run optimizer:local
```

The worker reads `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from
`.env`, watches for `PENDING` jobs, atomically claims one job at a time, and
writes progress and results back to Supabase. Keep this process running while
administrators may start calculations.

To process pending work and exit:

```powershell
npm run optimizer:local:once
```

## Windows installer

Build a standalone Windows setup executable:

```powershell
npm.cmd run optimizer:installer:build
```

The output is written to:

```text
outputs/windows-installer/CCC-Bus-Allocation-Optimizer-Setup.exe
```

The setup executable includes Python, OR-Tools, and the local worker. Its guided
console menu asks for the Supabase URL and service-role key, stores the key
using Windows DPAPI, installs under the current user's Local AppData directory,
and registers the worker in the current user's Startup folder. No separate
Node.js or Python installation is required on the target computer.

Enter the project URL in `https://<project-ref>.supabase.co` format without a
dashboard or `/rest/v1` path. Both legacy JWT service-role keys and newer
`sb_secret_...` secret keys are supported.

The generated executable is not code-signed. Sign it with the organization's
Windows code-signing certificate before distributing it outside a controlled
administrator group.

## Cloud Run Job

Build the image from this directory. Each execution must provide
`ALLOCATION_OPTIMIZATION_JOB_ID` as an environment override. The service-role
key must be supplied through Secret Manager and must never be included in the
image or frontend environment.

The worker atomically claims a `PENDING` job, records each proven optimization
phase, and writes a final result only after the independent result validator
passes.
