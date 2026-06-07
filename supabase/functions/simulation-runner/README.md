# Simulation Runner Edge Function

The admin simulation page calls this function for privileged simulation stages.
It never exposes the Supabase service-role key to the browser.

## Required setup

1. Apply `sql/setup/58_simulation_runtime.sql` and
   `sql/setup/60_reset_reservation_data.sql` to the separated test project.
2. Optionally set the shared password for generated accounts:

   ```powershell
   supabase secrets set SIMULATION_PASSWORD=Simulation123!
   ```

3. Deploy the function:

   ```powershell
   supabase functions deploy simulation-runner
   ```

4. Open the admin simulation page and use the safety-lock controls to enable
   or disable execution. Enabling requires typing the displayed test project
   ID again. Only global admins can update the setting through the existing
   `app_settings` RLS policy.

The function allowlist is fixed to the separated test project in
`SIMULATION_PROJECT_ID`. Changing the test project requires changing that
constant and deploying the function again.

## Connected stages

- `cleanup`: removes `sim-%@ccc-bus.test` accounts in batches, then clears all
  operation data, announcements, stations, bus options, app settings, campus
  admin roles, and organization data. Non-simulation user accounts and global
  admin accounts are preserved, but non-simulation users lose organization
  assignments.
- `reference`: sets simulation operation initial values from the common active
  campuses and stations: a 2,000-person participation target, SIM bus options,
  ticket price, reservation deadline, and scenario checklist.
- `accounts`: creates general users and one campus admin for every campus in
  batches of at most 100 accounts. The server owns the resume offset and
  account count after the first batch, refuses conflicting real campus-admin
  roles, and verifies the final profile and campus-admin-role counts.
