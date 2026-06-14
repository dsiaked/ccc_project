# SQL Utilities

`supabase/migrations` is the only deployable schema source.

`sql/setup` is retained temporarily as historical test fixtures. Do not apply
those files to a database or add new schema changes there.

The staged rehearsal utilities under `sql/simulation` are data-operation
scripts for an isolated test project. Build its schema first with:

```bash
supabase db reset
```
