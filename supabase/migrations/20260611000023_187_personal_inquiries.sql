create table if not exists public.personal_inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  status text not null default 'open',
  title text not null,
  content text not null,
  admin_response text,
  handled_by uuid references auth.users(id),
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personal_inquiries_category_check
    check (category in ('reservation', 'payment', 'ticket', 'boarding', 'etc')),
  constraint personal_inquiries_status_check
    check (status in ('open', 'in_progress', 'resolved', 'on_hold'))
);

create index if not exists idx_personal_inquiries_user_created
  on public.personal_inquiries(user_id, created_at desc);
create index if not exists idx_personal_inquiries_status_created
  on public.personal_inquiries(status, created_at desc);

alter table public.personal_inquiries enable row level security;

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
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;
  if p_category not in ('reservation', 'payment', 'ticket', 'boarding', 'etc') then
    raise exception 'Personal inquiry category is invalid.';
  end if;
  if nullif(btrim(p_title), '') is null or nullif(btrim(p_content), '') is null then
    raise exception 'Personal inquiry title and content are required.';
  end if;
  if length(btrim(p_title)) > 100 or length(btrim(p_content)) > 2000 then
    raise exception 'Personal inquiry is too long.';
  end if;

  insert into public.personal_inquiries (user_id, category, title, content)
  values (v_user_id, p_category, btrim(p_title), btrim(p_content))
  returning * into v_inquiry;

  return v_inquiry;
end;
$$;

create or replace function public.get_my_personal_inquiries()
returns setof public.personal_inquiries
language sql
stable
security definer
set search_path = public
as $$
  select inquiry.*
  from public.personal_inquiries inquiry
  where inquiry.user_id = auth.uid()
  order by inquiry.created_at desc;
$$;

create or replace function public.get_personal_inquiries_as_global_admin()
returns table (
  id uuid,
  user_id uuid,
  user_name text,
  user_email text,
  user_phone text,
  category text,
  status text,
  title text,
  content text,
  admin_response text,
  handled_by uuid,
  handled_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_global_admin() then
    raise exception 'Only global administrators can view personal inquiries.';
  end if;

  return query
  select
    inquiry.id,
    inquiry.user_id,
    profile.name,
    profile.email,
    profile.phone,
    inquiry.category,
    inquiry.status,
    inquiry.title,
    inquiry.content,
    inquiry.admin_response,
    inquiry.handled_by,
    inquiry.handled_at,
    inquiry.created_at,
    inquiry.updated_at
  from public.personal_inquiries inquiry
  left join public.profiles profile on profile.id = inquiry.user_id
  order by
    case inquiry.status
      when 'open' then 0
      when 'in_progress' then 1
      when 'on_hold' then 2
      else 3
    end,
    inquiry.created_at desc;
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
  if p_status = 'resolved' and v_response is null then
    raise exception 'A response is required before resolving an inquiry.';
  end if;
  if v_response is not null and length(v_response) > 2000 then
    raise exception 'Personal inquiry response is too long.';
  end if;

  select inquiry.admin_response
  into v_previous_response
  from public.personal_inquiries inquiry
  where inquiry.id = p_inquiry_id
  for update;

  if not found then
    raise exception 'Personal inquiry not found.';
  end if;

  update public.personal_inquiries
  set
    status = p_status,
    admin_response = coalesce(v_response, admin_response),
    handled_by = v_actor_id,
    handled_at = case when p_status = 'resolved' then clock_timestamp() else null end,
    updated_at = clock_timestamp()
  where id = p_inquiry_id
  returning * into v_inquiry;

  if v_response is not null and v_response is distinct from v_previous_response then
    insert into public.personal_notifications (
      target_user_id,
      category,
      title,
      content,
      created_by
    )
    values (
      v_inquiry.user_id,
      'inquiry',
      '문의에 답변이 등록되었습니다',
      v_inquiry.title || E'\n\n' || v_response,
      v_actor_id
    );
  end if;

  return v_inquiry;
end;
$$;

revoke all on table public.personal_inquiries from public, anon, authenticated;
revoke all on function public.create_personal_inquiry(text, text, text) from public, anon;
revoke all on function public.get_my_personal_inquiries() from public, anon;
revoke all on function public.get_personal_inquiries_as_global_admin() from public, anon;
revoke all on function public.respond_to_personal_inquiry(uuid, text, text) from public, anon;

grant execute on function public.create_personal_inquiry(text, text, text) to authenticated;
grant execute on function public.get_my_personal_inquiries() to authenticated;
grant execute on function public.get_personal_inquiries_as_global_admin() to authenticated;
grant execute on function public.respond_to_personal_inquiry(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
