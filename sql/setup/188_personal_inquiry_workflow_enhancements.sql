create table if not exists public.personal_inquiry_messages (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.personal_inquiries(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('user', 'global_admin')),
  message text not null,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_personal_inquiry_messages_inquiry_created
  on public.personal_inquiry_messages(inquiry_id, created_at, id);

create table if not exists public.personal_inquiry_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  inquiry_id uuid not null references public.personal_inquiries(id) on delete cascade,
  read_at timestamptz not null default clock_timestamp(),
  primary key (user_id, inquiry_id)
);

create table if not exists public.personal_inquiry_audit_logs (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.personal_inquiries(id) on delete cascade,
  message_id uuid,
  actor_id uuid,
  action text not null check (
    action in ('status_changed', 'response_changed', 'message_created')
  ),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_personal_inquiry_audit_logs_inquiry_created
  on public.personal_inquiry_audit_logs(inquiry_id, created_at desc);

alter table public.personal_inquiry_messages enable row level security;
alter table public.personal_inquiry_reads enable row level security;
alter table public.personal_inquiry_audit_logs enable row level security;

revoke all on table public.personal_inquiry_messages from public, anon, authenticated;
revoke all on table public.personal_inquiry_reads from public, anon, authenticated;
revoke all on table public.personal_inquiry_audit_logs from public, anon, authenticated;

insert into public.personal_inquiry_messages (
  inquiry_id, sender_id, sender_role, message, created_at
)
select inquiry.id, inquiry.user_id, 'user', inquiry.content, inquiry.created_at
from public.personal_inquiries inquiry
where not exists (
  select 1
  from public.personal_inquiry_messages message
  where message.inquiry_id = inquiry.id
    and message.sender_role = 'user'
);

insert into public.personal_inquiry_messages (
  inquiry_id, sender_id, sender_role, message, created_at
)
select
  inquiry.id,
  inquiry.handled_by,
  'global_admin',
  inquiry.admin_response,
  coalesce(inquiry.handled_at, inquiry.updated_at)
from public.personal_inquiries inquiry
where inquiry.handled_by is not null
  and nullif(btrim(coalesce(inquiry.admin_response, '')), '') is not null
  and not exists (
    select 1
    from public.personal_inquiry_messages message
    where message.inquiry_id = inquiry.id
      and message.sender_role = 'global_admin'
      and message.message = inquiry.admin_response
  );

create or replace function public.audit_personal_inquiry_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.personal_inquiry_audit_logs (
      inquiry_id, actor_id, action, before_data, after_data
    )
    values (
      new.id, auth.uid(), 'status_changed',
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status)
    );
  end if;
  if new.admin_response is distinct from old.admin_response then
    insert into public.personal_inquiry_audit_logs (
      inquiry_id, actor_id, action, before_data, after_data
    )
    values (
      new.id, auth.uid(), 'response_changed',
      jsonb_build_object('admin_response', old.admin_response),
      jsonb_build_object('admin_response', new.admin_response)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists audit_personal_inquiry_change on public.personal_inquiries;
create trigger audit_personal_inquiry_change
after update on public.personal_inquiries
for each row execute function public.audit_personal_inquiry_change();

create or replace function public.audit_personal_inquiry_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.personal_inquiry_audit_logs (
    inquiry_id, message_id, actor_id, action, after_data
  )
  values (
    new.inquiry_id, new.id, auth.uid(), 'message_created',
    jsonb_build_object(
      'sender_role', new.sender_role,
      'message', new.message,
      'created_at', new.created_at
    )
  );
  return new;
end;
$$;

drop trigger if exists audit_personal_inquiry_message on public.personal_inquiry_messages;
create trigger audit_personal_inquiry_message
after insert on public.personal_inquiry_messages
for each row execute function public.audit_personal_inquiry_message();

create or replace function public.create_personal_inquiry(
  p_category text,
  p_title text,
  p_content text
)
returns public.personal_inquiries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_inquiry public.personal_inquiries;
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  if p_category not in ('reservation', 'payment', 'ticket', 'boarding', 'etc') then
    raise exception 'Personal inquiry category is invalid.';
  end if;
  if nullif(btrim(p_title), '') is null or nullif(btrim(p_content), '') is null then
    raise exception 'Personal inquiry title and content are required.';
  end if;
  if length(btrim(p_title)) > 100 or length(btrim(p_content)) > 2000 then
    raise exception 'Personal inquiry is too long.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('personal-inquiry:' || v_user_id::text, 0));
  if (
    select count(*)
    from public.personal_inquiries inquiry
    where inquiry.user_id = v_user_id and inquiry.status <> 'resolved'
  ) >= 3 then
    raise exception 'Resolve an existing inquiry before creating another one.';
  end if;
  if exists (
    select 1
    from public.personal_inquiries inquiry
    where inquiry.user_id = v_user_id
      and inquiry.created_at > clock_timestamp() - interval '60 seconds'
  ) then
    raise exception 'Please wait before creating another inquiry.';
  end if;

  insert into public.personal_inquiries (user_id, category, title, content)
  values (v_user_id, p_category, btrim(p_title), btrim(p_content))
  returning * into v_inquiry;

  insert into public.personal_inquiry_messages (
    inquiry_id, sender_id, sender_role, message
  )
  values (v_inquiry.id, v_user_id, 'user', btrim(p_content));

  return v_inquiry;
end;
$$;

create or replace function public.add_personal_inquiry_message(
  p_inquiry_id uuid,
  p_message text
)
returns public.personal_inquiry_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_is_global_admin boolean := public.is_global_admin();
  v_inquiry public.personal_inquiries;
  v_message public.personal_inquiry_messages;
begin
  if v_actor_id is null then raise exception 'Authentication is required.'; end if;
  if nullif(btrim(p_message), '') is null or length(btrim(p_message)) > 2000 then
    raise exception 'Personal inquiry message is invalid.';
  end if;

  select * into v_inquiry
  from public.personal_inquiries
  where id = p_inquiry_id
  for update;
  if not found or (not v_is_global_admin and v_inquiry.user_id <> v_actor_id) then
    raise exception 'Personal inquiry not found or inaccessible.';
  end if;

  insert into public.personal_inquiry_messages (
    inquiry_id, sender_id, sender_role, message
  )
  values (
    p_inquiry_id,
    v_actor_id,
    case when v_is_global_admin then 'global_admin' else 'user' end,
    btrim(p_message)
  )
  returning * into v_message;

  if v_is_global_admin then
    update public.personal_inquiries
    set
      admin_response = btrim(p_message),
      handled_by = v_actor_id,
      updated_at = clock_timestamp()
    where id = p_inquiry_id;

    insert into public.personal_notifications (
      target_user_id, category, title, content, created_by
    )
    values (
      v_inquiry.user_id,
      'inquiry',
      '문의에 새 답변이 등록되었습니다',
      v_inquiry.title || E'\n\n' || btrim(p_message) || E'\n\n개인 문의 내역에서 확인하세요.',
      v_actor_id
    );
  else
    update public.personal_inquiries
    set status = 'open', handled_at = null, updated_at = clock_timestamp()
    where id = p_inquiry_id;
  end if;

  return v_message;
end;
$$;

create or replace function public.get_my_personal_inquiry_messages()
returns setof public.personal_inquiry_messages
language sql
stable
security definer
set search_path = public
as $$
  select message.*
  from public.personal_inquiry_messages message
  join public.personal_inquiries inquiry on inquiry.id = message.inquiry_id
  where inquiry.user_id = auth.uid()
  order by message.created_at, message.id;
$$;

create or replace function public.get_personal_inquiries_page_as_global_admin(
  p_page integer default 1,
  p_page_size integer default 15,
  p_status text default 'all',
  p_search text default ''
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_page integer := greatest(1, coalesce(p_page, 1));
  v_page_size integer := least(50, greatest(1, coalesce(p_page_size, 15)));
  v_status text := coalesce(p_status, 'all');
  v_search text := btrim(coalesce(p_search, ''));
  v_result jsonb;
begin
  if not public.is_global_admin() then
    raise exception 'Only global administrators can view personal inquiries.';
  end if;
  if v_status not in ('all', 'open', 'in_progress', 'resolved', 'on_hold') then
    raise exception 'Personal inquiry status is invalid.';
  end if;

  with filtered as (
    select inquiry.*, profile.name as user_name, profile.email as user_email,
      profile.phone as user_phone
    from public.personal_inquiries inquiry
    left join public.profiles profile on profile.id = inquiry.user_id
    where (v_status = 'all' or inquiry.status = v_status)
      and (
        v_search = ''
        or inquiry.title ilike '%' || v_search || '%'
        or inquiry.content ilike '%' || v_search || '%'
        or coalesce(profile.name, '') ilike '%' || v_search || '%'
        or coalesce(profile.email, '') ilike '%' || v_search || '%'
        or coalesce(profile.phone, '') ilike '%' || v_search || '%'
        or exists (
          select 1 from public.personal_inquiry_messages message
          where message.inquiry_id = inquiry.id
            and message.message ilike '%' || v_search || '%'
        )
      )
  ),
  paged as (
    select *
    from filtered
    order by
      case status when 'open' then 0 when 'in_progress' then 1 when 'on_hold' then 2 else 3 end,
      updated_at desc, id desc
    offset (v_page - 1) * v_page_size
    limit v_page_size
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(
        to_jsonb(paged) || jsonb_build_object(
          'messages', coalesce((
            select jsonb_agg(to_jsonb(message) order by message.created_at, message.id)
            from public.personal_inquiry_messages message
            where message.inquiry_id = paged.id
          ), '[]'::jsonb)
        )
      ) from paged
    ), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'summary', jsonb_build_object(
      'total', (select count(*) from public.personal_inquiries),
      'open', (select count(*) from public.personal_inquiries where status = 'open'),
      'in_progress', (select count(*) from public.personal_inquiries where status = 'in_progress'),
      'resolved', (select count(*) from public.personal_inquiries where status = 'resolved'),
      'on_hold', (select count(*) from public.personal_inquiries where status = 'on_hold')
    )
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.mark_personal_inquiry_read(p_inquiry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_global_admin() then
    raise exception 'Only global administrators can mark personal inquiries read.';
  end if;
  if not exists (select 1 from public.personal_inquiries where id = p_inquiry_id) then
    raise exception 'Personal inquiry not found.';
  end if;
  insert into public.personal_inquiry_reads(user_id, inquiry_id, read_at)
  values (auth.uid(), p_inquiry_id, clock_timestamp())
  on conflict (user_id, inquiry_id) do update set read_at = excluded.read_at;
end;
$$;

create or replace function public.get_unread_personal_inquiry_count()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_global_admin() then return 0; end if;
  select count(*)::integer into v_count
  from public.personal_inquiries inquiry
  left join public.personal_inquiry_reads read_state
    on read_state.user_id = auth.uid() and read_state.inquiry_id = inquiry.id
  where exists (
    select 1
    from public.personal_inquiry_messages message
    where message.inquiry_id = inquiry.id
      and message.sender_role = 'user'
      and message.created_at > coalesce(read_state.read_at, '-infinity'::timestamptz)
  );
  return v_count;
end;
$$;

create or replace function public.respond_to_personal_inquiry(
  p_inquiry_id uuid,
  p_status text,
  p_admin_response text
)
returns public.personal_inquiries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_response text := nullif(btrim(coalesce(p_admin_response, '')), '');
  v_previous_response text;
  v_inquiry public.personal_inquiries;
begin
  if not public.is_global_admin() then
    raise exception 'Only global administrators can process personal inquiries.';
  end if;
  if p_status not in ('open', 'in_progress', 'resolved', 'on_hold') then
    raise exception 'Personal inquiry status is invalid.';
  end if;

  select * into v_inquiry
  from public.personal_inquiries where id = p_inquiry_id for update;
  if not found then raise exception 'Personal inquiry not found.'; end if;

  v_previous_response := v_inquiry.admin_response;
  if p_status = 'resolved' and v_response is null and v_previous_response is null then
    raise exception 'A response is required before resolving an inquiry.';
  end if;
  if v_response is not null and length(v_response) > 2000 then
    raise exception 'Personal inquiry response is too long.';
  end if;

  update public.personal_inquiries
  set status = p_status,
    handled_by = v_actor_id,
    handled_at = case when p_status = 'resolved' then clock_timestamp() else null end,
    updated_at = clock_timestamp()
  where id = p_inquiry_id
  returning * into v_inquiry;

  if v_response is not null and v_response is distinct from v_previous_response then
    perform public.add_personal_inquiry_message(p_inquiry_id, v_response);
    select * into v_inquiry from public.personal_inquiries where id = p_inquiry_id;
  end if;
  return v_inquiry;
end;
$$;

revoke all on function public.add_personal_inquiry_message(uuid, text) from public, anon;
revoke all on function public.get_my_personal_inquiry_messages() from public, anon;
revoke all on function public.get_personal_inquiries_page_as_global_admin(integer, integer, text, text) from public, anon;
revoke all on function public.mark_personal_inquiry_read(uuid) from public, anon;
revoke all on function public.get_unread_personal_inquiry_count() from public, anon;

grant execute on function public.add_personal_inquiry_message(uuid, text) to authenticated;
grant execute on function public.get_my_personal_inquiry_messages() to authenticated;
grant execute on function public.get_personal_inquiries_page_as_global_admin(integer, integer, text, text) to authenticated;
grant execute on function public.mark_personal_inquiry_read(uuid) to authenticated;
grant execute on function public.get_unread_personal_inquiry_count() to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'personal_inquiries'
  ) then
    alter publication supabase_realtime add table public.personal_inquiries;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'personal_inquiry_messages'
  ) then
    alter publication supabase_realtime add table public.personal_inquiry_messages;
  end if;
end $$;

notify pgrst, 'reload schema';
