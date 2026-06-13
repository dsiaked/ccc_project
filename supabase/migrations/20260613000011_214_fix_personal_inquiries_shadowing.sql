-- Fix personal inquiry message shadowing where to_jsonb(message) evaluated to the text column instead of the table record.
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
            select jsonb_agg(to_jsonb(msg) order by msg.created_at, msg.id)
            from public.personal_inquiry_messages msg
            where msg.inquiry_id = paged.id
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
