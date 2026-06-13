# Supabase Baseline Workflow

`supabase/migrations` is the only deployable database schema source.

`current_migration_chain.sql` is generated for inspection only and is ignored by
Git. Generate it with:

```bash
npm run db:migrations:bundle
```

Do not deploy the generated bundle and do not edit or delete migrations already
applied to a shared environment.

## Creating A Squashed Baseline

Create a baseline only in a dedicated branch after all environments have the
same migration history:

1. Back up the production schema and migration history.
2. Run the full migration chain against an empty local Supabase database.
3. Run `supabase migration squash --local --version <last-version>`.
4. Reset a second empty database from the squashed migration.
5. Compare schema dumps from the full-chain and squashed databases.
6. Move data-only inserts to `supabase/seed.sql`.
7. Repair shared-environment migration history only after reviewing the exact
   versions that will be marked reverted/applied.

Never combine schema normalization with the baseline-history replacement.

With Docker Desktop running, verify the full chain and a temporary squash with:

```bash
npm run db:baseline:verify
```

The command works only inside `.tmp` and does not modify the repository's
original migration files.
