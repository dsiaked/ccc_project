# admin-user-manager

Creates application users from the individual user management page.

Deploy:

```bash
supabase functions deploy admin-user-manager
```

The function requires the default `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` secrets. It verifies that the caller has a
`global_admin` role before creating an email-confirmed Auth user and profile.
