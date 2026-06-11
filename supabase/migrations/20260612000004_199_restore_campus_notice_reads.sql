-- Restore the per-user notice read table if it was removed after the foundation migration.

create table if not exists public.campus_notice_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  notice_id uuid not null references public.campus_requests(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, notice_id)
);

create index if not exists idx_campus_notice_reads_notice_id
  on public.campus_notice_reads(notice_id);

alter table public.campus_notice_reads enable row level security;

drop policy if exists "Users can view own campus notice reads"
  on public.campus_notice_reads;
drop policy if exists "Users can create own campus notice reads"
  on public.campus_notice_reads;
drop policy if exists "Users can delete own campus notice reads"
  on public.campus_notice_reads;

create policy "Users can view own campus notice reads"
on public.campus_notice_reads
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can create own campus notice reads"
on public.campus_notice_reads
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.campus_requests
    where campus_requests.id = campus_notice_reads.notice_id
      and campus_requests.is_global_notice = true
  )
);

create policy "Users can delete own campus notice reads"
on public.campus_notice_reads
for delete
to authenticated
using (user_id = auth.uid());

revoke all on table public.campus_notice_reads from anon;
grant select, insert, delete on table public.campus_notice_reads to authenticated;
grant all on table public.campus_notice_reads to service_role;

notify pgrst, 'reload schema';
