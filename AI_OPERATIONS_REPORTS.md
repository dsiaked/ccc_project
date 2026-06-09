# AI Operations Reports

The AI operations report feature combines privacy-safe activity statistics with
a curated description of the repository architecture. Global administrators can
generate and review reports at `/admin/system/ai-reports`.

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

1. Apply `supabase/migrations/20260610230017_156_ai_operations_reports.sql`.
2. Deploy the Edge Function:

   ```bash
   supabase functions deploy ai-operations-report
   ```

3. Set server-side secrets:

   ```bash
   supabase secrets set OPENAI_API_KEY=...
   supabase secrets set AI_REPORT_MODEL=gpt-5-mini
   ```

`AI_REPORT_MODEL` is optional. The function defaults to `gpt-5-mini`.

## Access and retention

- Only global administrators can read or generate reports.
- AI receives aggregated, anonymized statistics and the curated project map
  embedded in the Edge Function.
- Add a scheduled retention policy before long-term production use. Activity
  event volume depends on traffic and core data-change frequency.
