create or replace function public.get_personal_inquiry_audit_logs(
  p_inquiry_id uuid
)
returns setof public.personal_inquiry_audit_logs
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_global_admin() then
    raise exception 'Only global administrators can view personal inquiry audit logs.';
  end if;
  return query
  select audit.*
  from public.personal_inquiry_audit_logs audit
  where audit.inquiry_id = p_inquiry_id
  order by audit.created_at desc;
end;
$$;

revoke all on function public.get_personal_inquiry_audit_logs(uuid)
  from public, anon;
grant execute on function public.get_personal_inquiry_audit_logs(uuid)
  to authenticated;

notify pgrst, 'reload schema';
