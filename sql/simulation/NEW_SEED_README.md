# Simulation Runner

`scripts/simulation.mjs` controls the repeatable rehearsal flow. Database
schema, RLS, triggers, and production RPC functions are managed by
`supabase/migrations`.

## Prerequisites

1. Use a separated Supabase test project.
2. Run `supabase db reset` from the repository root.
3. Add the test project's service-role key to `.env`:

   ```text
   SUPABASE_SERVICE_ROLE_KEY=your-test-project-service-role-key
   ```

Never prefix the service-role key with `VITE_` and never commit it.

## Complete Flows

Create all simulation accounts and initial data:

```powershell
npm.cmd run simulation -- seed
```

The command asks for the global admin ID (email) and password in the terminal,
creates or updates the Auth account, and grants the `global_admin` role. The
password is masked while typing.

Close reservations and complete the settlement rehearsal:

```powershell
npm.cmd run simulation -- settle
```

Run both flows:

```powershell
npm.cmd run simulation -- all
```

Remove only simulation accounts and their related data:

```powershell
npm.cmd run simulation -- cleanup:simulation
```

Delete operation data, non-global-admin Auth users, destinations, bus options,
organization rows, and app settings from the separated test project:

```powershell
$env:SIMULATION_FULL_CLEANUP_CONFIRM="DELETE_ALL_TEST_DATA"
npm.cmd run simulation -- cleanup
```

`cleanup` requires the confirmation environment variable because it is
destructive. Optional tables that do not exist in an older test-project schema
are reported as skipped, while permission, foreign-key, and network failures
still stop the command.

Only Auth users with a `global_admin` role, their profiles, and their
`global_admin` role rows are preserved. All campus-admin accounts, profiles,
and roles are deleted. The preserved global admins' district, team, and campus
scope values are cleared before the organization rows are deleted.

Recreate only the organization, destinations, bus options, and app settings:

```powershell
npm.cmd run simulation -- seed:reference
```

`seed:reference` creates the Seoul reference-data set with 7 teams, 47
campuses, 40 destinations, and campus participation targets totaling 2,000
people. Values explicitly defined in `REFERENCE_PARTICIPATION_TARGETS` are
kept, and the remaining target is distributed across campuses without a fixed
value.

After a full cleanup, run `seed:reference` to restore only reference data, or
run `seed` to restore reference data and create the complete simulation data.

## Detailed Seed Steps

Run these when inspecting or retrying an individual seed stage:

```powershell
npm.cmd run simulation -- cleanup:simulation
npm.cmd run simulation -- seed:reference
npm.cmd run simulation -- seed:global-admin
npm.cmd run simulation -- seed:accounts
npm.cmd run simulation -- seed:reservations
npm.cmd run simulation -- seed:payments
npm.cmd run simulation -- seed:verify
```

- `seed:accounts` assigns general users to active campuses and creates exactly
  one campus admin for every campus, including inactive campuses, then
  registers their profiles and campus-admin roles.
- `seed:global-admin` asks for the global admin ID and password, then creates or
  updates the account, profile, and `global_admin` role.
- `seed:reservations` creates deterministic but uneven reservations. Each
  campus has favored destinations, every user chooses distinct first-choice
  and second-choice destinations (1지망 and 2지망), and request times are
  irregularly distributed across the previous 24 hours. Every tenth simulation
  account remains without a reservation, and all created reservations use
  `requested` status without admin cancellation.
- `seed:payments` creates the initial 95% completed and 5% pending distribution
  for general users. Campus admins start completed. Legacy invalid payment
  statuses stored in simulation account metadata are normalized to `pending`.

`seed:reference` uses upserts for organization, destination, and setting rows,
and replaces only `SIM-` bus options, so it can be rerun.

`seed:accounts` refuses to run while simulation accounts already exist. Run
`cleanup:simulation` explicitly before retrying it.

The combined `seed` command runs `cleanup:simulation`, `seed:reference`, and
`seed:global-admin` first and therefore replaces the previous simulation run
without deleting non-simulation users.

## Detailed Settlement Steps

```powershell
npm.cmd run simulation -- close
npm.cmd run simulation -- settle:payments
npm.cmd run simulation -- settle:reports
npm.cmd run simulation -- settle:confirm
npm.cmd run simulation -- settle:verify
```

- `close` closes the first reservation window.
- `settle:payments` records each campus admin's payment confirmation.
- `settle:reports` first completes and verifies individual payments as each
  campus admin, then aggregates them by campus and records each campus admin's
  transfer report to global admins with `sent` status.
- `settle:transfers` remains available as a compatibility alias for
  `settle:reports`.
- `settle:confirm` records headquarters confirmation by `admin@gmail.com`.
- `settle:verify` verifies the closed deadline, payments, and transfers.

Set a different global admin email with `SIMULATION_GLOBAL_ADMIN_EMAIL`.
For non-interactive execution, also set `SIMULATION_GLOBAL_ADMIN_PASSWORD`.

## Smaller Smoke Test

```powershell
$env:SIMULATION_USER_COUNT=20
npm.cmd run simulation -- seed
```

All generated accounts use `Simulation123!` unless `SIMULATION_PASSWORD` is
set. The first general account is `sim-user-0001@ccc-bus.test`.
