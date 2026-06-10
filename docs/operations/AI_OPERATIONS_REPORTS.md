# AI Operations Reports

The AI operations report feature combines privacy-safe activity statistics with
a curated description of the repository architecture. Global administrators can
generate and review reports at `/admin/system/ai-reports`.

Global administrators can select which log groups are included in new AI
reports. The selection affects AI input only; collected privacy-safe logs remain
available for operational review at `/admin/system/ai-reports/logs`.

## What is logged

- Authenticated user and administrator page views
- Successful authenticated session events
- Data-change events for core reservation, payment, allocation, request, and
  boarding workflows
- Existing detailed administrator audit records

The client logging RPC only accepts an allowlist of metadata fields. The
data-change trigger records resource type, resource ID, and status only. Names,
emails, phone numbers, passwords, tokens, and raw before/after snapshots are not
included in the AI input.

## Deployment

1. Apply `supabase/migrations/20260610230017_156_ai_operations_reports.sql` and
   `supabase/migrations/20260610230030_166_ai_report_log_selection.sql`.
2. Deploy the Edge Function:

   ```bash
   supabase functions deploy ai-operations-report
   ```

3. Set server-side secrets:

   ```bash
   supabase secrets set GEMINI_API_KEY=...
   supabase secrets set AI_REPORT_MODEL=gemini-2.5-flash-lite
   ```

`AI_REPORT_MODEL` is optional. The function defaults to `gemini-2.5-flash-lite`.
Temporary capacity and rate-limit failures are retried twice before the report
is marked as failed.

## Access and retention

- Only global administrators can read or generate reports.
- AI receives aggregated, anonymized statistics and the curated project map
  embedded in the Edge Function.
- Add a scheduled retention policy before long-term production use. Activity
  event volume depends on traffic and core data-change frequency.
