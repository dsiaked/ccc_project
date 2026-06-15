# Simulation Rehearsal SQL

These files prepare and verify the end-to-end rehearsal environment.
Run them in a Supabase **test project** or a clearly separated rehearsal database.

## Recommended Fresh Seed

For a repeatable simulation run, use the command runner described in
`NEW_SEED_README.md`. It provides detailed seed and settlement commands and
does not depend on direct writes to the protected `auth.users` schema.

The numbered SQL flow below remains available for staged database rehearsal.
The command runner creates simulation campus-admin accounts and can execute the
full post-deadline settlement rehearsal.

## Before You Start

1. Run `supabase db reset` from the repository root.
2. Sign up the real global admin account in the web app.
3. Confirm the email literal in `00_사전점검_및_전체관리자.sql`.
   The current value is `admin@gmail.com`.

Simulation accounts use the `sim-%@ccc-bus.test` email pattern and the default
password `Simulation123!`.

## Seed Steps

Run these files in order:

1. `00_사전점검_및_전체관리자.sql`
   - Checks required tables and the auth profile trigger.
   - Grants `global_admin` to the configured real admin account.
2. `10_이전_시뮬레이션_정리.sql`
   - Removes data from the previous simulation run.
   - Only targets simulation users and `SIM-` tagged rows.
3. `20_기준정보_생성.sql`
   - Seeds organization, 40 destination stations, a 10,000 won ticket price,
     and 40-seat/45-seat bus options.
4. External Auth user creation
   - Supabase SQL Editor cannot directly create protected Auth users.
   - Create the accounts through a separate trusted Auth Admin API process.
   - The repository intentionally does not include an Auth-user seed script.
   - Creates one campus admin account for every active campus.
   - Creates 2,000 general user accounts with weighted, uneven campus distribution.
   - General users include 1,900 completed, 80 pending, and 20 cancelled payment cases.
5. `30_프로필_및_캠퍼스관리자_등록.sql`
   - Registers generated Auth users in `profiles`.
   - Registers every generated campus admin in `admin_roles`.
   - Refuses to replace non-simulation campus admins automatically.
   - Validates exact Auth user counts, uneven campus distribution, and campus scope metadata before writing.
6. `35_인증사용자_검증.sql`
   - Verifies Auth users, profiles, and campus-admin registrations.
7. `40_예약_생성.sql`
   - Creates reservations for general users and campus admins.
   - Stores only first-choice and second-choice destination stations.
   - Expected reservations: 2,000 users + one admin per active campus.
   - Rolls back if the expected reservation counts are not produced.
8. `45_입금_상태_생성.sql`
   - Creates the initial payment rows after reservations exist.
   - Expected payments: 1,980 users + one admin per active campus.
   - Rolls back if the expected counts are not produced.
9. `50_시드_검증.sql`
   - Runs read-only checks for accounts, reservations, station demand, and payments.

Each mutation file has its own transaction. If a step fails, fix the reported
problem and rerun that step. To restart from a known state, rerun from step 2.

## Post-Deadline Operations and Allocation Rehearsal

Run these files only when the team is ready to close reservations and rehearse
the operational flow. The settlement files reproduce the state changes made by
campus admins and the global admin. They are intended for SQL Editor rehearsal;
use the web screens as well when validating RLS, authentication, and UI behavior.

1. `60_예약_마감.sql`
   - Immediately closes the first reservation window.
2. `61_캠퍼스_입금_확인.sql`
   - Rehearses every simulation campus admin confirming requested reservations'
     payments.
   - Validates that the verifier belongs to the same campus.
3. `62_캠퍼스_송금_보고.sql`
   - Rehearses each campus reporting its completed transfer to headquarters.
   - Stops if active non-simulation reservations exist in the database.
4. `63_본부_입금_확인.sql`
   - Rehearses `admin@gmail.com` confirming the reported amount for each campus.
5. `65_배차_준비_검증.sql`
   - Stops unless the deadline is closed, all requested simulation reservations
     are paid, and all campus transfers match and are confirmed.
6. Open `/admin/allocation`.
7. Calculate recommendations and select one allocation.
8. Save the selected allocation.
9. Enter departure time and boarding place, then run automatic assignment.
10. Open `/admin/remaining-seat-sales` and rehearse any planned additional sales.
11. Ask simulation users to open `/ticket` and `/confirmed-ticket`.
12. Run `70_배차_후_검증.sql`.

The SQL settlement steps require a separated rehearsal database because campus
transfer snapshots represent the complete active reservation population.

## Safety

- `10_이전_시뮬레이션_정리.sql` deletes users matching `sim-%@ccc-bus.test`.
- It does not delete reservations belonging to real users.
- Do not change the simulation email pattern to a real email domain.
