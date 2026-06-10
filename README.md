# CCC Bus Reservation System

CCC 버스 신청, 배정, 탑승 관리를 위한 React + TypeScript + Vite 애플리케이션입니다.

## Quick Start

1. Install dependencies.

```bash
npm install
```

2. Create a local environment file.

```powershell
Copy-Item .env.example .env.local
```

3. Fill in the required Supabase values in `.env.local`.

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

4. Start the development server.

```bash
npm run dev
```

If either Supabase variable is missing, the app now shows an in-app setup screen instead of failing with a generic runtime crash.

## Scripts

- `npm run dev`: start the Vite development server
- `npm run build`: run TypeScript build checks and create a production bundle
- `npm run lint`: run ESLint
- `npm test`: run the unit test suite
- `npm run deploy:check:supabase`: verify that the target Supabase database is compatible with the frontend
- `npm run simulation`: run the local simulation script with `.env`
- `npm run optimizer:local`: start the local optimizer workflow

## Repository Structure

- `src/`: React application code
- `tests/`: TypeScript unit and repository safety tests
- `optimizer/`: Python exact-allocation optimizer and its tests
- `supabase/`: deployable migrations and Edge Functions
- `sql/`: fresh-project setup and manual simulation SQL
- `scripts/`: developer, verification, deployment, and optimizer commands
- `docs/`: architecture and operations documentation
- `data/`: version-controlled templates and sample input data
- `public/`: static files shipped with the web application
- `outputs/`, `.tmp/`, `dist/`: generated artifacts; not source-controlled

See `docs/README.md` for documentation ownership and maintenance guidance.

## Supabase Setup

For a fresh Supabase project, run `sql/setup/combined_supabase_setup.sql` once.

This combined script already includes the Seoul organization and station seed data, so do not rerun these older seed files unless you are patching an older database:

- `sql/setup/80_seed_seoul_organization.sql`
- `sql/setup/82_seed_stations_template.sql`
- `sql/setup/83_add_dong_team_campuses.sql`

## Deployment Compatibility

Firebase live deployment checks the target Supabase database before deploying
the frontend. Apply the latest Supabase migrations first, then deploy the
frontend.

When a frontend change requires a new database migration, increment both:

- `deployment-compatibility.json`
- both deployment compatibility RPC versions in the matching setup SQL and migration

The check uses only `VITE_SUPABASE_URL` and the public
`VITE_SUPABASE_ANON_KEY`; it does not require a service-role key.

The live merge workflow also deploys the changed Edge Functions before Firebase
Hosting. Configure the repository's `SUPABASE_ACCESS_TOKEN` secret so frontend
and Edge Function behavior cannot drift.

## Main Routes

### Public

- `/`: home
- `/login`: user login
- `/signup`: user signup
- `/reservation`: reservation request and editing
- `/ticket`: ticket lookup
- `/remaining-seats`: remaining seat request flow
- `/forgot-password`: password reset email request
- `/reset-password`: new password entry after email recovery

### Admin

- `/admin/login`: admin login
- `/admin/dashboard`: head-office dashboard
- `/admin/campus-dashboard`: campus admin dashboard
- `/admin/boarding`: boarding manager dashboard

## Notes

- Browser clients rely on Supabase Auth and database RPCs configured by the SQL setup.
- The repository includes an installer artifact at `public/downloads/CCC-Bus-Allocation-Optimizer-Setup.exe`.
- Existing public routes intentionally preserve the current URL structure.
