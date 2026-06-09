-- Support cursor pagination for the administrator audit log.

create index if not exists idx_admin_action_audit_logs_created_id
  on public.admin_action_audit_logs(created_at desc, id desc);
