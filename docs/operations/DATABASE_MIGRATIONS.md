# Database Migration Operations

## Source Of Truth

`supabase/migrations` is the only deployable schema source.

- Create every schema or database-function change as a new timestamped
  migration.
- Never edit a migration after it has been applied to a shared environment.
- `npm run db:migrations:verify` checks committed historical migration hashes
  through the recorded immutable cutoff.
- Do not deploy `sql/setup`; it contains temporary historical test fixtures.
- Do not add new `sql/setup` fixtures. Migrate tests to final-state migration
  contracts and delete fixtures in small reviewed batches.
- Keep repeatable reference and local-development data in `supabase/seed.sql`.

## Local Verification

```bash
npm run db:migrations:verify
npm run db:local:reset
npm test
```

`db:local:reset` requires Docker Desktop and rebuilds the local database from
the migration chain.

`db:migrations:verify` also enforces a decreasing legacy SQL context budget so
the repository does not regain large duplicate schema sources.

## Baseline Squash

Run this only on a dedicated branch after every shared environment has the same
migration history:

```bash
npm run db:baseline:verify
```

The verifier copies the Supabase project into `.tmp`, applies the full chain,
squashes only the temporary copy, rebuilds another database from the squash,
and compares the resulting `public` schema dumps. It also restores the exact
ACL state at the end of the temporary baseline because objects created by a
single squash otherwise inherit Supabase default grants and can accidentally
gain broader `anon` or `authenticated` access.

The repository baseline is `20260613000001` (migration 204). Migrations 205 and
later remain as incremental changes. The linked production project and
repository migration history now match from the squashed baseline onward.

## Normalization Rollout

Normalize core tables over separate deploys:

1. **Expand:** add canonical columns and compatibility storage.
2. **Backfill:** populate new columns and verify all rows.
3. **Switch:** update RPCs, Edge Functions, and clients to use canonical data.
4. **Constrain:** add validated foreign keys and required constraints.
5. **Remove:** drop obsolete fields only after usage checks remain clean.

Migration `20260613000008_211_expand_reservation_normalization.sql` begins the
reservation expand/backfill phase. It intentionally removes no existing field.
Migration `20260614000004_218_validate_reservation_normalized_storage.sql`
backfills missing snapshots and constrains normalized compatibility storage
before read cutover.
