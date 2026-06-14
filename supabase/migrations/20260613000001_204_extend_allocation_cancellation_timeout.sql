


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."acquire_allocation_workspace_lock"("p_allocation_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_now timestamptz := clock_timestamp();
  v_actor_id uuid := auth.uid();
  v_current public.bus_allocations%rowtype;
  v_lock_actor text;
  v_lock_expires_at timestamptz;
begin
  if v_actor_id is null or not public.is_global_admin() then
    raise exception 'Only global admins can edit allocations.';
  end if;

  select *
  into v_current
  from public.bus_allocations
  where id = p_allocation_id
  for update;

  if not found then
    raise exception 'Allocation workspace not found.';
  end if;

  v_lock_actor := v_current.allocation_data #>> '{editLock,actorId}';
  v_lock_expires_at := nullif(
    v_current.allocation_data #>> '{editLock,expiresAt}',
    ''
  )::timestamptz;

  if v_lock_actor is distinct from v_actor_id::text
    and coalesce(v_lock_expires_at, '-infinity'::timestamptz) > v_now then
    return jsonb_build_object(
      'lock_acquired', false,
      'row', to_jsonb(v_current)
    );
  end if;

  update public.bus_allocations
  set
    allocation_data = jsonb_set(
      allocation_data,
      '{editLock}',
      jsonb_build_object(
        'actorId', v_actor_id::text,
        'expiresAt', (v_now + interval '15 minutes')::text
      ),
      true
    ),
    updated_at = v_now,
    revision = revision + 1
  where id = p_allocation_id
  returning * into v_current;

  return jsonb_build_object(
    'lock_acquired', true,
    'row', to_jsonb(v_current)
  );
end;
$$;


ALTER FUNCTION "public"."acquire_allocation_workspace_lock"("p_allocation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_boarding_walk_in_as_global_admin"("p_bus_id" "text", "p_seat_number" integer, "p_name" "text", "p_phone" "text", "p_campus" "text", "p_reason" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_allocation public.bus_allocations%rowtype;
  v_bus jsonb;
  v_id uuid;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can add walk-in passengers.';
  end if;
  if p_seat_number is null or p_seat_number < 1 then
    raise exception 'A valid seat number is required.';
  end if;
  if nullif(btrim(coalesce(p_name, '')), '') is null
    or nullif(btrim(coalesce(p_phone, '')), '') is null
    or nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Name, phone, and reason are required.';
  end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed'
  for update;
  if not found then raise exception 'Confirmed allocation not found.'; end if;

  select bus into v_bus
  from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
  where bus ->> 'id' = p_bus_id;
  if v_bus is null then raise exception 'Target bus not found.'; end if;
  if not public.can_manage_boarding_bus(v_allocation.id, p_bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;
  if exists (
    select 1 from public.boarding_bus_departures
    where allocation_id = v_allocation.id
      and bus_id = p_bus_id
      and cancelled_at is null
  ) then
    raise exception 'Departed buses cannot receive walk-in passengers.';
  end if;
  if p_seat_number > (v_bus ->> 'capacity')::integer then
    raise exception 'The selected seat number exceeds the bus capacity.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_allocation.allocation_data -> 'passengers') passenger
    where passenger ->> 'busId' = p_bus_id
      and (passenger ->> 'seatNumber')::integer = p_seat_number
  ) then
    raise exception 'The selected seat number is already assigned.';
  end if;

  insert into public.boarding_walk_in_passengers (
    allocation_id, bus_id, seat_number, name, phone, campus, reason, created_by
  ) values (
    v_allocation.id,
    p_bus_id,
    p_seat_number,
    btrim(p_name),
    btrim(p_phone),
    btrim(coalesce(p_campus, '')),
    btrim(p_reason),
    auth.uid()
  )
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'The selected seat number is already assigned.';
end;
$$;


ALTER FUNCTION "public"."add_boarding_walk_in_as_global_admin"("p_bus_id" "text", "p_seat_number" integer, "p_name" "text", "p_phone" "text", "p_campus" "text", "p_reason" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."personal_inquiry_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inquiry_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "sender_role" "text" NOT NULL,
    "message" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    CONSTRAINT "personal_inquiry_messages_sender_role_check" CHECK (("sender_role" = ANY (ARRAY['user'::"text", 'global_admin'::"text"])))
);


ALTER TABLE "public"."personal_inquiry_messages" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_personal_inquiry_message"("p_inquiry_id" "uuid", "p_message" "text") RETURNS "public"."personal_inquiry_messages"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_is_global_admin boolean := public.is_global_admin();
  v_message_text text := btrim(coalesce(p_message, ''));
  v_inquiry public.personal_inquiries;
  v_message public.personal_inquiry_messages;
begin
  if v_actor_id is null then raise exception 'Authentication is required.'; end if;
  if v_message_text = '' or length(v_message_text) > 2000 then
    raise exception 'Personal inquiry message is invalid.';
  end if;

  select * into v_inquiry
  from public.personal_inquiries
  where id = p_inquiry_id
  for update;
  if not found or (not v_is_global_admin and v_inquiry.user_id <> v_actor_id) then
    raise exception 'Personal inquiry not found or inaccessible.';
  end if;

  select message.*
  into v_message
  from public.personal_inquiry_messages message
  where message.inquiry_id = p_inquiry_id
    and message.sender_id = v_actor_id
    and message.sender_role = case when v_is_global_admin then 'global_admin' else 'user' end
    and message.message = v_message_text
    and message.created_at > clock_timestamp() - interval '30 seconds'
  order by message.created_at desc, message.id desc
  limit 1;

  if v_message.id is not null then
    return v_message;
  end if;

  insert into public.personal_inquiry_messages (
    inquiry_id, sender_id, sender_role, message
  )
  values (
    p_inquiry_id,
    v_actor_id,
    case when v_is_global_admin then 'global_admin' else 'user' end,
    v_message_text
  )
  returning * into v_message;

  if v_is_global_admin then
    update public.personal_inquiries
    set
      admin_response = v_message_text,
      handled_by = v_actor_id,
      updated_at = clock_timestamp()
    where id = p_inquiry_id;

    insert into public.personal_notifications (
      target_user_id, category, title, content, created_by
    )
    values (
      v_inquiry.user_id,
      'inquiry',
      '문의 답변이 등록되었습니다.',
      v_inquiry.title || E'\n\n' || v_message_text || E'\n\n개인 문의 내역에서 확인하세요.',
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


ALTER FUNCTION "public"."add_personal_inquiry_message"("p_inquiry_id" "uuid", "p_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."allocation_optimization_snapshot_is_current"("p_input_snapshot" "jsonb") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(p_input_snapshot ->> 'active_reservations_hash', '')
    = coalesce(
      public.get_active_reservation_optimization_state() ->> 'hash',
      ''
    );
$$;


ALTER FUNCTION "public"."allocation_optimization_snapshot_is_current"("p_input_snapshot" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."archive_boarding_exception_as_global_admin"("p_record_key" "text", "p_allocation_id" "uuid", "p_record_data" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global administrators can archive boarding exceptions';
  end if;

  if nullif(btrim(p_record_key), '') is null or p_record_data is null then
    raise exception 'A boarding exception record is required';
  end if;

  insert into public.boarding_exception_archives (
    record_key,
    allocation_id,
    record_data,
    archived_by
  ) values (
    btrim(p_record_key),
    p_allocation_id,
    p_record_data,
    auth.uid()
  )
  on conflict (record_key) do update
  set record_data = excluded.record_data,
      archived_at = now(),
      archived_by = auth.uid();
end;
$$;


ALTER FUNCTION "public"."archive_boarding_exception_as_global_admin"("p_record_key" "text", "p_allocation_id" "uuid", "p_record_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assert_allocation_planning_unlocked"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if current_setting('app.allocation_confirmation_write', true) = 'on' then
    return;
  end if;

  if exists (
    select 1
    from public.bus_allocations
    where allocation_data ->> 'status' = 'confirmed'
  ) then
    raise exception 'Cancel the confirmed allocation before using allocation planning.';
  end if;
end;
$$;


ALTER FUNCTION "public"."assert_allocation_planning_unlocked"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assert_deployment_compatibility"("p_required_version" integer) RETURNS integer
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $$
declare
  v_deployed_version constant integer := 186;
begin
  if p_required_version > v_deployed_version then
    raise exception 'Database deployment version % is older than required version %.',
      v_deployed_version,
      p_required_version;
  end if;

  return v_deployed_version;
end;
$$;


ALTER FUNCTION "public"."assert_deployment_compatibility"("p_required_version" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."assert_deployment_compatibility"("p_required_version" integer) IS 'Fails when the database deployment version is older than the required frontend version.';



CREATE TABLE IF NOT EXISTS "public"."admin_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "campus" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "district" "text",
    "team" "text",
    "district_id" "uuid",
    "team_id" "uuid",
    "campus_id" "uuid",
    "granted_by" "uuid",
    CONSTRAINT "admin_roles_role_check" CHECK (("role" = ANY (ARRAY['campus_admin'::"text", 'global_admin'::"text", 'boarding_manager'::"text"])))
);


ALTER TABLE "public"."admin_roles" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_boarding_manager_as_global_admin"("p_user_id" "uuid") RETURNS "public"."admin_roles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_role public.admin_roles;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can assign boarding managers.';
  end if;
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'User not found.';
  end if;

  insert into public.admin_roles (user_id, role, granted_by, updated_at)
  values (p_user_id, 'boarding_manager', auth.uid(), clock_timestamp())
  on conflict (user_id, role) where role = 'boarding_manager'
  do update set granted_by = excluded.granted_by, updated_at = excluded.updated_at
  returning * into v_role;

  return v_role;
end;
$$;


ALTER FUNCTION "public"."assign_boarding_manager_as_global_admin"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_campus_admin_as_global_admin"("p_user_id" "uuid", "p_district" "text", "p_team" "text", "p_campus" "text") RETURNS "public"."admin_roles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_role public.admin_roles;
  v_district_id uuid;
  v_team_id uuid;
  v_campus_id uuid;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can assign campus admins.';
  end if;

  if p_user_id is null then
    raise exception 'A user ID is required.';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'User not found.';
  end if;

  select district_id, team_id, campus_id
  into v_district_id, v_team_id, v_campus_id
  from public.campus_options
  where district = nullif(trim(p_district), '')
    and team = nullif(trim(p_team), '')
    and campus = nullif(trim(p_campus), '')
  limit 1;

  if v_campus_id is null then
    raise exception 'Active campus scope not found.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'admin_roles:campus:' || v_district_id::text || ':' || v_team_id::text || ':' || v_campus_id::text,
      0
    )
  );

  delete from public.admin_roles
  where role = 'campus_admin'
    and district_id = v_district_id
    and team_id = v_team_id
    and campus_id = v_campus_id;

  insert into public.admin_roles (
    user_id,
    role,
    district,
    team,
    campus,
    district_id,
    team_id,
    campus_id,
    granted_by,
    updated_at
  )
  values (
    p_user_id,
    'campus_admin',
    trim(p_district),
    trim(p_team),
    trim(p_campus),
    v_district_id,
    v_team_id,
    v_campus_id,
    auth.uid(),
    now()
  )
  returning * into v_role;

  return v_role;
end;
$$;


ALTER FUNCTION "public"."assign_campus_admin_as_global_admin"("p_user_id" "uuid", "p_district" "text", "p_team" "text", "p_campus" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_admin_operation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_resource_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.admin_roles admin_role
    where admin_role.user_id = auth.uid()
  ) then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' and to_jsonb(new) = to_jsonb(old) then
    return new;
  end if;

  v_resource_id := case
    when tg_op = 'DELETE' then old.id
    else new.id
  end;

  insert into public.admin_action_audit_logs (
    actor_id,
    action,
    resource_type,
    resource_id,
    before_data,
    after_data
  )
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    v_resource_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."audit_admin_operation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_business_activity_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_row jsonb;
  v_actor_id uuid := auth.uid();
  v_actor_kind text;
  v_subject_id_text text;
  v_subject_id uuid;
  v_is_simulation_user boolean := false;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_subject_id_text := case
    when tg_table_name = 'profiles' then v_row ->> 'id'
    else v_row ->> 'user_id'
  end;

  if v_subject_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_subject_id := v_subject_id_text::uuid;

    select exists (
      select 1
      from auth.users simulation_user
      where simulation_user.id = v_subject_id
        and lower(coalesce(simulation_user.email, '')) like '%@ccc-bus.test'
        and simulation_user.raw_user_meta_data ? 'sim_seq'
    )
    into v_is_simulation_user;
  end if;

  if v_is_simulation_user
     and tg_table_name in ('profiles', 'reservations', 'payments') then
    v_actor_id := v_subject_id;
    v_actor_kind := 'user';
  else
    if exists (
      select 1
      from public.admin_roles admin_role
      where admin_role.user_id = v_actor_id
        and admin_role.role = 'global_admin'
    ) then
      return case when tg_op = 'DELETE' then old else new end;
    end if;

    v_actor_kind := case
      when v_actor_id is null then 'system'
      when exists (
        select 1
        from public.admin_roles admin_role
        where admin_role.user_id = v_actor_id
      ) then 'admin'
      else 'user'
    end;
  end if;

  insert into public.activity_event_logs (
    actor_id,
    actor_kind,
    event_name,
    category,
    metadata
  )
  values (
    v_actor_id,
    v_actor_kind,
    tg_table_name || '.' || lower(tg_op),
    'data_change',
    jsonb_strip_nulls(jsonb_build_object(
      'resource_type', tg_table_name,
      'resource_id', v_row ->> 'id',
      'outcome', coalesce(v_row ->> 'status', lower(tg_op)),
      'source', case when v_is_simulation_user then 'simulation' else null end
    ))
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$_$;


ALTER FUNCTION "public"."audit_business_activity_event"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_campus_request_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.status is distinct from old.status then
    insert into public.campus_request_audit_logs (
      request_id, actor_id, action, before_data, after_data
    )
    values (
      old.id, auth.uid(), 'status_changed',
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status)
    );
  end if;

  if new.admin_response is distinct from old.admin_response then
    insert into public.campus_request_audit_logs (
      request_id, actor_id, action, before_data, after_data
    )
    values (
      old.id, auth.uid(), 'response_changed',
      jsonb_build_object('admin_response', old.admin_response),
      jsonb_build_object('admin_response', new.admin_response)
    );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."audit_campus_request_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_campus_request_message_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'UPDATE' and new.message is distinct from old.message then
    insert into public.campus_request_audit_logs (
      request_id, message_id, actor_id, action, before_data, after_data
    )
    values (
      old.request_id, old.id, auth.uid(), 'message_updated',
      jsonb_build_object('message', old.message),
      jsonb_build_object('message', new.message)
    );
    return new;
  end if;

  if tg_op = 'DELETE' then
    if exists (
      select 1
      from public.campus_requests request
      where request.id = old.request_id
    ) then
      insert into public.campus_request_audit_logs (
        request_id, message_id, actor_id, action, before_data
      )
      values (
        old.request_id, old.id, auth.uid(), 'message_deleted',
        jsonb_build_object(
          'sender_id', old.sender_id,
          'sender_role', old.sender_role,
          'message', old.message,
          'created_at', old.created_at
        )
      );
    end if;
    return old;
  end if;

  return null;
end;
$$;


ALTER FUNCTION "public"."audit_campus_request_message_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_personal_inquiry_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."audit_personal_inquiry_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_personal_inquiry_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."audit_personal_inquiry_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backfill_confirmed_allocation_ticket_bus_ids"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.allocation_data ->> 'status' <> 'confirmed' then
    return new;
  end if;

  with assignments as (
    select
      (passenger ->> 'reservationId')::uuid as reservation_id,
      bus ->> 'id' as bus_id
    from jsonb_array_elements(new.allocation_data -> 'passengers') passenger
    join jsonb_array_elements(new.allocation_data -> 'buses') bus
      on bus ->> 'id' = passenger ->> 'busId'
  )
  update public.reservations reservation
  set
    confirmed_ticket = jsonb_set(
      reservation.confirmed_ticket,
      '{busId}',
      to_jsonb(assignments.bus_id),
      true
    ),
    data = jsonb_set(
      coalesce(reservation.data, '{}'::jsonb),
      '{confirmedTicket}',
      jsonb_set(
        reservation.confirmed_ticket,
        '{busId}',
        to_jsonb(assignments.bus_id),
        true
      ),
      true
    )
  from assignments
  where reservation.id = assignments.reservation_id
    and reservation.status = 'confirmed'
    and reservation.confirmed_ticket is not null
    and reservation.confirmed_ticket ->> 'busId' is distinct from assignments.bus_id;

  return new;
end;
$$;


ALTER FUNCTION "public"."backfill_confirmed_allocation_ticket_bus_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bulk_manage_personal_user_payments"("p_reservation_ids" "uuid"[], "p_status" "text", "p_reason" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can manage personal payments.';
  end if;

  if coalesce(array_length(p_reservation_ids, 1), 0) > 100 then
    raise exception 'Bulk operation is limited to 100 users.';
  end if;

  foreach v_id in array coalesce(p_reservation_ids, array[]::uuid[]) loop
    perform public.manage_personal_user_payment(v_id, p_status, p_reason);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;


ALTER FUNCTION "public"."bulk_manage_personal_user_payments"("p_reservation_ids" "uuid"[], "p_status" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bulk_send_personal_notifications"("p_target_user_ids" "uuid"[], "p_title" "text", "p_content" "text", "p_category" "text" DEFAULT 'admin'::"text", "p_reason" "text" DEFAULT NULL::"text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can send personal notifications.';
  end if;

  if coalesce(array_length(p_target_user_ids, 1), 0) > 100 then
    raise exception 'Bulk operation is limited to 100 users.';
  end if;

  foreach v_id in array coalesce(p_target_user_ids, array[]::uuid[]) loop
    perform public.send_personal_notification(
      v_id,
      p_title,
      p_content,
      p_category,
      p_reason
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;


ALTER FUNCTION "public"."bulk_send_personal_notifications"("p_target_user_ids" "uuid"[], "p_title" "text", "p_content" "text", "p_category" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_boarding_bus"("p_allocation_id" "uuid", "p_bus_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_global_admin()
    or exists (
      select 1
      from public.boarding_manager_bus_assignments assignment
      where assignment.allocation_id = p_allocation_id
        and assignment.manager_user_id = auth.uid()
        and assignment.bus_id = p_bus_id
    );
$$;


ALTER FUNCTION "public"."can_manage_boarding_bus"("p_allocation_id" "uuid", "p_bus_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_boarding_bus_label"("p_allocation_id" "uuid", "p_bus_label" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_global_admin()
    or exists (
      select 1
      from public.bus_allocations allocation
      cross join lateral jsonb_array_elements(allocation.allocation_data -> 'buses') bus
      where allocation.id = p_allocation_id
        and btrim(bus ->> 'label') = btrim(p_bus_label)
        and public.can_manage_boarding_bus(p_allocation_id, bus ->> 'id')
    );
$$;


ALTER FUNCTION "public"."can_manage_boarding_bus_label"("p_allocation_id" "uuid", "p_bus_label" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_boarding_reservation"("p_reservation_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.reservations reservation
    join public.bus_allocations allocation
      on allocation.allocation_data ->> 'status' = 'confirmed'
    where reservation.id = p_reservation_id
      and public.can_manage_boarding_bus(
        allocation.id,
        public.get_confirmed_ticket_bus_id(reservation.id, reservation.confirmed_ticket)
      )
  );
$$;


ALTER FUNCTION "public"."can_manage_boarding_reservation"("p_reservation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_current_boarding_bus_label"("p_bus_label" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.bus_allocations allocation
    where allocation.allocation_data ->> 'status' = 'confirmed'
      and public.can_manage_boarding_bus_label(allocation.id, p_bus_label)
  );
$$;


ALTER FUNCTION "public"."can_manage_current_boarding_bus_label"("p_bus_label" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_admin_invitation_code"("p_invitation_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_updated_id uuid;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can cancel invitation codes.';
  end if;

  update public.admin_invitation_codes
  set cancelled_by = auth.uid(), cancelled_at = clock_timestamp()
  where id = p_invitation_id
    and used_at is null
    and cancelled_at is null
    and expires_at > clock_timestamp()
  returning id into v_updated_id;

  return v_updated_id is not null;
end;
$$;


ALTER FUNCTION "public"."cancel_admin_invitation_code"("p_invitation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_allocation_optimization_job"("p_job_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_previous_status text;
  v_status text;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can cancel allocation optimization jobs.';
  end if;

  select job.status
  into v_previous_status
  from public.allocation_optimization_jobs job
  where job.id = p_job_id
  for update;

  if v_previous_status is null then
    raise exception 'Allocation optimization job not found.';
  end if;

  update public.allocation_optimization_jobs job
  set
    status = case
      when job.status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED') then 'CANCELLED'
      else job.status
    end,
    current_phase = case
      when job.status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED') then 'cancelled'
      else job.current_phase
    end,
    cancel_requested_at = case
      when job.status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED')
        then coalesce(job.cancel_requested_at, now())
      else job.cancel_requested_at
    end,
    completed_at = case
      when job.status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED') then now()
      else job.completed_at
    end
  where job.id = p_job_id
  returning status into v_status;

  if v_previous_status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED') then
    insert into public.allocation_optimization_events (job_id, event_type, detail)
    values (
      p_job_id,
      'CANCELLED',
      jsonb_build_object(
        'requested_by', auth.uid()::text,
        'previous_status', v_previous_status
      )
    );
  end if;

  return v_status;
end;
$$;


ALTER FUNCTION "public"."cancel_allocation_optimization_job"("p_job_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_boarding_bus_departure"("p_bus_id" "text", "p_reason" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_departure public.boarding_bus_departures%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_restored_reservations integer := 0;
  v_restored_walk_ins integer := 0;
  v_restored_total integer := 0;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can cancel departure.';
  end if;
  if v_reason is null then
    raise exception 'A departure cancellation reason is required.';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'Departure cancellation reasons must be 500 characters or fewer.';
  end if;

  select * into v_departure
  from public.boarding_bus_departures
  where bus_id = p_bus_id and cancelled_at is null
  order by departed_at desc
  limit 1
  for update;
  if not found then raise exception 'Active bus departure not found.'; end if;
  if not public.can_manage_boarding_bus(v_departure.allocation_id, p_bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;

  with changed as (
    update public.reservations
    set boarding_status = 'unchecked',
        boarding_status_updated_at = v_now,
        boarding_status_updated_by = auth.uid(),
        boarding_no_show_departure_id = null
    where boarding_no_show_departure_id = v_departure.id
      and boarding_status = 'no_show'
    returning id
  ),
  events as (
    insert into public.boarding_status_events (
      reservation_id, from_status, to_status, actor_id, note
    )
    select
      id,
      'no_show',
      'unchecked',
      auth.uid(),
      'bus_departure_cancelled_auto_restore: ' || v_reason
    from changed
    returning 1
  )
  select count(*) into v_restored_reservations from events;

  update public.boarding_walk_in_passengers
  set boarding_status = 'unchecked',
      boarding_status_updated_at = v_now,
      boarding_status_updated_by = auth.uid(),
      boarding_no_show_departure_id = null,
      boarding_note = concat_ws(
        E'\n',
        nullif(boarding_note, ''),
        '[출발 완료 취소] ' || v_reason
      ),
      updated_at = v_now
  where boarding_no_show_departure_id = v_departure.id
    and boarding_status = 'no_show';
  get diagnostics v_restored_walk_ins = row_count;

  update public.boarding_bus_departures
  set cancelled_at = v_now,
      cancelled_by = auth.uid(),
      cancellation_reason = v_reason
  where id = v_departure.id;

  v_restored_total := v_restored_reservations + v_restored_walk_ins;
  perform public.notify_boarding_managers_of_departure_cancel(
    v_departure,
    v_reason,
    v_restored_total
  );

  return v_restored_total;
end;
$$;


ALTER FUNCTION "public"."cancel_boarding_bus_departure"("p_bus_id" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_boarding_manager_as_global_admin"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_deleted_id uuid;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can cancel boarding managers.';
  end if;

  delete from public.boarding_manager_bus_assignments
  where manager_user_id = p_user_id;

  delete from public.admin_roles
  where user_id = p_user_id and role = 'boarding_manager'
  returning id into v_deleted_id;

  return v_deleted_id is not null;
end;
$$;


ALTER FUNCTION "public"."cancel_boarding_manager_as_global_admin"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_campus_admin_as_global_admin"("p_admin_role_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_deleted_id uuid;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can cancel campus admins.';
  end if;

  if p_admin_role_id is null then
    raise exception 'An admin role ID is required.';
  end if;

  delete from public.admin_roles
  where id = p_admin_role_id
    and role = 'campus_admin'
  returning id into v_deleted_id;

  if v_deleted_id is null then
    raise exception 'Campus admin role not found.';
  end if;

  return true;
end;
$$;


ALTER FUNCTION "public"."cancel_campus_admin_as_global_admin"("p_admin_role_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campus_transfers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "district_id" "uuid",
    "team_id" "uuid",
    "campus_id" "uuid",
    "district" "text" NOT NULL,
    "team" "text" NOT NULL,
    "campus" "text" NOT NULL,
    "total_people" integer DEFAULT 0 NOT NULL,
    "paid_people" integer DEFAULT 0 NOT NULL,
    "total_amount" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'sent'::"text" NOT NULL,
    "sent_by" "uuid",
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "confirmed_by" "uuid",
    "confirmed_at" timestamp with time zone,
    "actual_confirmed_amount" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campus_transfers_status_check" CHECK (("status" = ANY (ARRAY['sent'::"text", 'confirmed'::"text"])))
);


ALTER TABLE "public"."campus_transfers" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_campus_transfer_report"("p_transfer_id" "uuid") RETURNS "public"."campus_transfers"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_transfer public.campus_transfers;
  v_deleted_count integer;
begin
  select *
  into v_transfer
  from public.campus_transfers transfer
  where transfer.id = p_transfer_id;

  if v_transfer.id is null then
    raise exception 'Campus transfer not found.';
  end if;

  if v_transfer.status <> 'sent' then
    raise exception 'Only a reported campus transfer can be cancelled.';
  end if;

  if auth.uid() is null or not exists (
    select 1
    from public.admin_roles admin_role
    where admin_role.user_id = auth.uid()
      and (
        admin_role.role = 'global_admin'
        or (
          admin_role.role = 'campus_admin'
          and (
            (
              v_transfer.campus_id is not null
              and admin_role.campus_id = v_transfer.campus_id
            )
            or (
              admin_role.district = v_transfer.district
              and admin_role.team = v_transfer.team
              and admin_role.campus = v_transfer.campus
            )
          )
        )
      )
  ) then
    raise exception 'Not authorized to cancel this campus transfer report.';
  end if;

  delete from public.campus_transfers
  where id = p_transfer_id
    and status = 'sent';

  get diagnostics v_deleted_count = row_count;
  if v_deleted_count <> 1 then
    raise exception 'Campus transfer report is no longer cancellable.';
  end if;

  return v_transfer;
end;
$$;


ALTER FUNCTION "public"."cancel_campus_transfer_report"("p_transfer_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bus_allocations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "allocation_name" "text" NOT NULL,
    "allocation_data" "jsonb" NOT NULL,
    "total_cost" integer DEFAULT 0 NOT NULL,
    "total_capacity" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revision" bigint DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."bus_allocations" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_confirmed_allocation_workspace"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer) RETURNS SETOF "public"."bus_allocations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "statement_timeout" TO '5min'
    AS $$
declare
  v_now timestamptz := clock_timestamp();
  v_actor_id uuid := auth.uid();
  v_current_status text;
  v_current_revision bigint;
  v_lock_actor text;
  v_lock_expires_at timestamptz;
begin
  if v_actor_id is null or not public.is_global_admin() then
    raise exception 'Only global admins can cancel confirmed allocations.';
  end if;

  if jsonb_typeof(p_allocation_data) <> 'object'
    or p_allocation_data ->> 'status' <> 'draft' then
    raise exception 'Invalid draft allocation payload.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('allocation-confirmation', 0));

  select
    allocation_data ->> 'status',
    revision,
    allocation_data #>> '{editLock,actorId}',
    nullif(allocation_data #>> '{editLock,expiresAt}', '')::timestamptz
  into v_current_status, v_current_revision, v_lock_actor, v_lock_expires_at
  from public.bus_allocations
  where id = p_allocation_id
  for update;

  if v_current_status is null or v_current_status <> 'confirmed' then
    raise exception 'Only confirmed allocations can be cancelled.';
  end if;
  if v_current_revision <> p_expected_revision then
    raise exception 'Allocation workspace changed. Reload before saving.';
  end if;
  if v_lock_actor is distinct from v_actor_id::text then
    raise exception 'Allocation workspace lock is owned by another administrator.';
  end if;
  if coalesce(v_lock_expires_at, '-infinity'::timestamptz) <= v_now then
    raise exception 'Allocation workspace lock expired. Reopen the workspace.';
  end if;

  update public.reservations reservation
  set
    status = 'requested',
    confirmed_ticket = null,
    data = (coalesce(reservation.data, '{}'::jsonb) - 'confirmedTicket')
      || jsonb_build_object(
        'status', 'requested',
        'updatedAt', v_now::text
      ),
    updated_at = v_now
  where reservation.status is distinct from 'cancelled';

  update public.bus_allocations
  set
    allocation_data = jsonb_set(
      p_allocation_data,
      '{editLock}',
      jsonb_build_object(
        'actorId', v_actor_id::text,
        'expiresAt', (v_now + interval '15 minutes')::text
      ),
      true
    ),
    total_cost = p_total_cost,
    total_capacity = p_total_capacity,
    updated_at = v_now,
    revision = revision + 1
  where id = p_allocation_id;

  return query
  select *
  from public.bus_allocations
  where id = p_allocation_id;
end;
$$;


ALTER FUNCTION "public"."cancel_confirmed_allocation_workspace"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_confirmed_allocation_workspace_v2"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") RETURNS SETOF "public"."bus_allocations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "statement_timeout" TO '5min'
    AS $$
declare
  v_saved public.bus_allocations%rowtype;
begin
  select *
  into v_saved
  from public.cancel_confirmed_allocation_workspace(
    p_allocation_id,
    p_expected_revision,
    p_allocation_data - 'versions',
    p_total_cost,
    p_total_capacity
  );

  perform public.store_allocation_workspace_version(
    p_allocation_id,
    v_saved.revision,
    p_allocation_data,
    p_version_id,
    p_version_label,
    p_version_changes
  );

  return next v_saved;
end;
$$;


ALTER FUNCTION "public"."cancel_confirmed_allocation_workspace_v2"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_remaining_seat_claim"("p_reservation_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_reservation public.reservations;
  v_claim jsonb;
  v_allocation_data jsonb;
  v_is_global_admin boolean;
begin
  select exists (
    select 1 from public.admin_roles where user_id = v_actor_id and role = 'global_admin'
  ) into v_is_global_admin;
  select * into v_reservation from public.reservations where id = p_reservation_id for update;
  v_claim := v_reservation.data -> 'remainingSeatClaim';

  if v_reservation.id is null or v_claim ->> 'status' <> 'pending_payment' then
    raise exception 'Pending remaining seat claim not found.';
  end if;
  if v_reservation.user_id is distinct from v_actor_id and not v_is_global_admin then
    raise exception 'Not authorized to cancel this remaining seat claim.';
  end if;

  select allocation_data into v_allocation_data
  from public.bus_allocations where id = (v_claim ->> 'allocationId')::uuid for update;
  if v_allocation_data is not null then
    update public.bus_allocations
    set allocation_data = jsonb_set(
      v_allocation_data, '{passengers}',
      (
        select coalesce(jsonb_agg(passenger), '[]'::jsonb)
        from jsonb_array_elements(coalesce(v_allocation_data -> 'passengers', '[]'::jsonb)) passenger
        where passenger ->> 'reservationId' <> p_reservation_id::text
      ), true
    )
    where id = (v_claim ->> 'allocationId')::uuid;
  end if;

  delete from public.reservations where id = p_reservation_id;
  return true;
end;
$$;


ALTER FUNCTION "public"."cancel_remaining_seat_claim"("p_reservation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_remaining_seat"("p_allocation_id" "uuid", "p_bus_id" "text", "p_depositor_name" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_deadline_at timestamptz;
  v_sales_setting jsonb := '{"enabled": true, "hidden_bus_ids": []}'::jsonb;
  v_allocation_name text;
  v_allocation_data jsonb;
  v_bus jsonb;
  v_capacity integer;
  v_seat_number integer;
  v_reservation_id uuid := gen_random_uuid();
  v_profile record;
  v_claim jsonb;
  v_reservation_data jsonb;
  v_passenger jsonb;
  v_price integer := 0;
  v_transfer_account text := '';
  v_existing_reservation_status text;
begin
  if v_actor_id is null then raise exception 'Authentication is required.'; end if;
  if nullif(btrim(p_depositor_name), '') is null then raise exception 'Depositor name is required.'; end if;

  select nullif(value ->> 'deadline_at', '')::timestamptz into v_deadline_at
  from public.app_settings where key = 'first_reservation_deadline';
  select value into v_sales_setting from public.app_settings where key = 'remaining_seat_sales';
  select greatest(coalesce((value ->> 'price')::integer, 0), 0) into v_price
  from public.app_settings where key = 'bus_ticket_price';
  select coalesce(value ->> 'account_number', '') into v_transfer_account
  from public.app_settings where key = 'seoul_district_transfer_account';

  if v_deadline_at is null or v_deadline_at > v_now then
    raise exception 'Remaining seats are available only after the deadline.';
  end if;
  if not coalesce((v_sales_setting ->> 'enabled')::boolean, true) then
    raise exception 'Remaining seat sales are closed.';
  end if;
  if coalesce(v_sales_setting -> 'hidden_bus_ids', '[]'::jsonb) ? p_bus_id then
    raise exception 'The selected bus is not open for remaining seat sales.';
  end if;

  lock table public.bus_allocations in share row exclusive mode;
  lock table public.reservations in share row exclusive mode;

  select id, status
  into v_reservation_id, v_existing_reservation_status
  from public.reservations
  where user_id = v_actor_id
  for update;

  if found and v_existing_reservation_status <> 'cancelled' then
    raise exception 'A reservation already exists for this user.';
  end if;
  if not found then
    v_reservation_id := gen_random_uuid();
  end if;

  select allocation_name, allocation_data into v_allocation_name, v_allocation_data
  from public.bus_allocations
  where id = p_allocation_id and allocation_data ->> 'status' = 'confirmed'
  for update;
  if v_allocation_data is null then raise exception 'The confirmed allocation is no longer available.'; end if;

  select bus into v_bus
  from jsonb_array_elements(coalesce(v_allocation_data -> 'buses', '[]'::jsonb)) bus
  where bus ->> 'id' = p_bus_id limit 1;
  if v_bus is null then raise exception 'The selected bus is not available.'; end if;

  v_capacity := (v_bus ->> 'capacity')::integer;
  select candidate into v_seat_number
  from generate_series(1, v_capacity) candidate
  where not exists (
    select 1
    from jsonb_array_elements(coalesce(v_allocation_data -> 'passengers', '[]'::jsonb)) passenger
    where passenger ->> 'busId' = p_bus_id and passenger ->> 'seatNumber' = candidate::text
  )
  order by candidate limit 1;
  if v_seat_number is null then raise exception 'No remaining seats are available on this bus.'; end if;

  select name, phone, district_id, district, team_id, team, campus_id, campus
  into v_profile from public.profiles where id = v_actor_id;
  if not found or nullif(btrim(v_profile.name), '') is null or nullif(btrim(v_profile.phone), '') is null then
    raise exception 'Complete your profile before selecting a remaining seat.';
  end if;

  v_claim := jsonb_build_object(
    'allocationId', p_allocation_id::text, 'allocationName', v_allocation_name,
    'busId', p_bus_id, 'busLabel', v_bus ->> 'label',
    'destination', v_bus ->> 'destination', 'departureTime', v_bus ->> 'departureTime',
    'boardingPlace', v_bus ->> 'boardingPlace', 'seatNumber', v_seat_number::text,
    'amount', v_price, 'depositorName', btrim(p_depositor_name),
    'transferAccount', v_transfer_account, 'status', 'pending_payment',
    'requestedAt', v_now::text
  );
  v_reservation_data := jsonb_build_object(
    'id', v_reservation_id::text, 'name', v_profile.name, 'phone', v_profile.phone,
    'district', coalesce(v_profile.district, ''), 'team', coalesce(v_profile.team, ''),
    'campus', coalesce(v_profile.campus, ''), 'stationPreferences', '[]'::jsonb,
    'status', 'requested', 'remainingSeatClaim', v_claim, 'requestedAt', v_now::text
  );

  insert into public.reservations (
    id, user_id, name, phone, district_id, district, team_id, team, campus_id, campus,
    station_preferences, status, confirmed_ticket, data, created_at, updated_at
  ) values (
    v_reservation_id, v_actor_id, v_profile.name, v_profile.phone,
    v_profile.district_id, coalesce(v_profile.district, ''), v_profile.team_id,
    coalesce(v_profile.team, ''), v_profile.campus_id, coalesce(v_profile.campus, ''),
    '[]'::jsonb, 'requested', null, v_reservation_data, v_now, v_now
  )
  on conflict (id) do update set
    name = excluded.name,
    phone = excluded.phone,
    district_id = excluded.district_id,
    district = excluded.district,
    team_id = excluded.team_id,
    team = excluded.team,
    campus_id = excluded.campus_id,
    campus = excluded.campus,
    station_preferences = excluded.station_preferences,
    status = excluded.status,
    confirmed_ticket = null,
    data = excluded.data,
    updated_at = excluded.updated_at;

  delete from public.payments where reservation_id = v_reservation_id;
  insert into public.payments (user_id, reservation_id, amount, status, notes, updated_at)
  values (v_actor_id, v_reservation_id, v_price, 'pending', '잔여좌석 입금자명: ' || btrim(p_depositor_name), v_now);

  v_passenger := jsonb_build_object(
    'reservationId', v_reservation_id::text, 'name', v_profile.name,
    'phone', v_profile.phone, 'campus', coalesce(v_profile.campus, ''),
    'team', coalesce(v_profile.team, ''), 'preferences', jsonb_build_array(v_bus ->> 'destination'),
    'busId', p_bus_id, 'seatNumber', v_seat_number, 'remainingSeatStatus', 'pending_payment'
  );
  update public.bus_allocations
  set allocation_data = jsonb_set(
    v_allocation_data, '{passengers}',
    coalesce(v_allocation_data -> 'passengers', '[]'::jsonb) || jsonb_build_array(v_passenger), true
  )
  where id = p_allocation_id;

  return v_claim;
end;
$$;


ALTER FUNCTION "public"."claim_remaining_seat"("p_allocation_id" "uuid", "p_bus_id" "text", "p_depositor_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_admin_invitation_codes"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_deleted_invitations integer;
  v_deleted_audit_logs integer;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can clean up invitation codes.';
  end if;

  delete from public.admin_invitation_codes invitation
  where invitation.cancelled_at is not null
    or (
      invitation.used_at is null
      and invitation.expires_at <= clock_timestamp()
    )
    or invitation.used_at <= clock_timestamp() - interval '30 days';

  get diagnostics v_deleted_invitations = row_count;

  delete from public.admin_action_audit_logs audit_log
  where audit_log.resource_type = 'admin_invitation_codes'
    and audit_log.created_at <= clock_timestamp() - interval '1 year';

  get diagnostics v_deleted_audit_logs = row_count;

  return jsonb_build_object(
    'deletedInvitations', v_deleted_invitations,
    'deletedAuditLogs', v_deleted_audit_logs
  );
end;
$$;


ALTER FUNCTION "public"."cleanup_admin_invitation_codes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_campus_transfer_amount"("p_transfer_id" "uuid", "p_confirmed_by" "uuid", "p_actual_confirmed_amount" integer) RETURNS "public"."campus_transfers"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_transfer campus_transfers;
begin
  if auth.uid() is null or not exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  ) then
    raise exception 'Only global admins can confirm campus transfers.';
  end if;

  update campus_transfers
  set
    status = 'confirmed',
    confirmed_by = auth.uid(),
    confirmed_at = now(),
    actual_confirmed_amount = greatest(
      coalesce(p_actual_confirmed_amount, 0),
      0
    ),
    updated_at = now()
  where id = p_transfer_id
  returning * into v_transfer;

  if v_transfer.id is null then
    raise exception 'campus transfer not found: %', p_transfer_id;
  end if;

  return v_transfer;
end;
$$;


ALTER FUNCTION "public"."confirm_campus_transfer_amount"("p_transfer_id" "uuid", "p_confirmed_by" "uuid", "p_actual_confirmed_amount" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_my_boarding"() RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_reservation public.reservations%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;

  select * into v_reservation
  from public.reservations
  where user_id = v_user_id and status = 'confirmed' and confirmed_ticket is not null
  for update;

  if not found then
    raise exception 'A confirmed ticket is required before boarding confirmation.';
  end if;

  if v_reservation.boarding_status <> 'boarded' then
    update public.reservations
    set boarding_status = 'boarded',
        boarding_confirmed_at = v_now,
        boarding_status_updated_at = v_now,
        boarding_status_updated_by = v_user_id,
        boarding_no_show_departure_id = null
    where id = v_reservation.id;

    insert into public.boarding_status_events (
      reservation_id, from_status, to_status, actor_id, note
    ) values (
      v_reservation.id, v_reservation.boarding_status, 'boarded', v_user_id, '탑승 확인'
    );
  end if;

  return coalesce(v_reservation.boarding_confirmed_at, v_now);
end;
$$;


ALTER FUNCTION "public"."confirm_my_boarding"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_remaining_seat_payment"("p_reservation_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_reservation public.reservations;
  v_claim jsonb;
  v_ticket jsonb;
  v_allocation_data jsonb;
begin
  if not exists (
    select 1 from public.admin_roles where user_id = v_actor_id and role = 'global_admin'
  ) then raise exception 'Only global admins can confirm remaining seat payments.'; end if;

  select * into v_reservation from public.reservations where id = p_reservation_id for update;
  v_claim := v_reservation.data -> 'remainingSeatClaim';
  if v_reservation.id is null or v_claim ->> 'status' <> 'pending_payment' then
    raise exception 'Pending remaining seat claim not found.';
  end if;

  select allocation_data into v_allocation_data
  from public.bus_allocations where id = (v_claim ->> 'allocationId')::uuid for update;
  if v_allocation_data is null then raise exception 'The confirmed allocation is no longer available.'; end if;

  v_ticket := jsonb_build_object(
    'busNumber', v_claim ->> 'busLabel', 'seatNumber', v_claim ->> 'seatNumber',
    'departureTime', v_claim ->> 'departureTime', 'boardingPlace', v_claim ->> 'boardingPlace',
    'dropoffStation', v_claim ->> 'destination', 'managerNote', '마감 후 잔여좌석 · 서울지구 입금 확인',
    'confirmedAt', v_now::text
  );
  v_claim := jsonb_set(jsonb_set(v_claim, '{status}', '"confirmed"'::jsonb), '{confirmedAt}', to_jsonb(v_now::text));

  update public.reservations set
    status = 'confirmed', confirmed_ticket = v_ticket,
    data = jsonb_set(jsonb_set(jsonb_set(data, '{status}', '"confirmed"'::jsonb), '{confirmedTicket}', v_ticket, true), '{remainingSeatClaim}', v_claim, true),
    updated_at = v_now
  where id = p_reservation_id;

  update public.payments set
    status = 'completed', paid_at = v_now, verified_by = v_actor_id, verified_at = v_now, updated_at = v_now
  where reservation_id = p_reservation_id;

  update public.bus_allocations
  set allocation_data = jsonb_set(
    v_allocation_data, '{passengers}',
    (
      select coalesce(jsonb_agg(case when passenger ->> 'reservationId' = p_reservation_id::text then passenger - 'remainingSeatStatus' else passenger end), '[]'::jsonb)
      from jsonb_array_elements(coalesce(v_allocation_data -> 'passengers', '[]'::jsonb)) passenger
    ), true
  )
  where id = (v_claim ->> 'allocationId')::uuid;

  return v_ticket;
end;
$$;


ALTER FUNCTION "public"."confirm_remaining_seat_payment"("p_reservation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_admin_invitation_code"("p_role" "text", "p_campus_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_raw text := upper(encode(gen_random_bytes(12), 'hex'));
  v_code text;
  v_invitation public.admin_invitation_codes%rowtype;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can create invitation codes.';
  end if;
  if p_role not in ('campus_admin', 'boarding_manager') then
    raise exception 'Unsupported invitation role.';
  end if;
  if p_role = 'campus_admin' and p_campus_id is null then
    raise exception 'Campus administrator invitations require a campus.';
  end if;
  if p_role = 'boarding_manager' and p_campus_id is not null then
    raise exception 'Boarding manager invitations cannot have a campus.';
  end if;
  if p_role = 'campus_admin' and not exists (
    select 1 from public.campuses where id = p_campus_id
  ) then
    raise exception 'Campus was not found.';
  end if;
  if p_role = 'campus_admin' then
    perform pg_advisory_xact_lock(
      hashtextextended('admin-invitation-campus:' || p_campus_id::text, 0)
    );
  end if;
  if p_role = 'campus_admin' and exists (
    select 1 from public.admin_roles role
    where role.role = 'campus_admin' and role.campus_id = p_campus_id
  ) then
    raise exception 'This campus already has an active campus administrator.';
  end if;
  if p_role = 'campus_admin' and exists (
    select 1 from public.admin_invitation_codes invitation
    where invitation.role = 'campus_admin'
      and invitation.campus_id = p_campus_id
      and invitation.used_at is null
      and invitation.cancelled_at is null
      and invitation.expires_at > clock_timestamp()
  ) then
    raise exception 'This campus already has an active invitation code.';
  end if;

  v_code := concat(
    substr(v_raw, 1, 6), '-',
    substr(v_raw, 7, 6), '-',
    substr(v_raw, 13, 6), '-',
    substr(v_raw, 19, 6)
  );

  insert into public.admin_invitation_codes (
    code_hash, code, code_hint, role, campus_id, created_by
  )
  values (
    digest(v_raw, 'sha256'),
    v_code,
    concat(substr(v_raw, 1, 4), '-****-', substr(v_raw, 21, 4)),
    p_role,
    p_campus_id,
    auth.uid()
  )
  returning * into v_invitation;

  return jsonb_build_object(
    'id', v_invitation.id,
    'code', v_code,
    'expiresAt', v_invitation.expires_at
  );
end;
$$;


ALTER FUNCTION "public"."create_admin_invitation_code"("p_role" "text", "p_campus_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_admin_invitation_codes"("p_role" "text", "p_campus_id" "uuid" DEFAULT NULL::"uuid", "p_count" integer DEFAULT 1) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_index integer;
  v_created jsonb;
  v_invitations jsonb := '[]'::jsonb;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can create invitation codes.';
  end if;
  if p_count is null or p_count < 1 or p_count > 50 then
    raise exception 'Between 1 and 50 invitation codes can be created at once.';
  end if;
  if p_role = 'campus_admin' and p_count <> 1 then
    raise exception 'Only one campus administrator invitation can be active per campus.';
  end if;

  for v_index in 1..p_count loop
    v_created := public.create_admin_invitation_code(p_role, p_campus_id);
    v_invitations := v_invitations || jsonb_build_array(v_created);
  end loop;

  return v_invitations;
end;
$$;


ALTER FUNCTION "public"."create_admin_invitation_codes"("p_role" "text", "p_campus_id" "uuid", "p_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_all_campus_admin_invitation_codes"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_campus record;
  v_created jsonb;
  v_invitations jsonb := '[]'::jsonb;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can create invitation codes.';
  end if;

  for v_campus in
    select distinct
      campus_option.campus_id,
      campus_option.district,
      campus_option.team,
      campus_option.campus
    from public.campus_options campus_option
    where not exists (
      select 1
      from public.admin_roles role
      where role.role = 'campus_admin'
        and role.campus_id = campus_option.campus_id
    )
      and not exists (
        select 1
        from public.admin_invitation_codes invitation
        where invitation.role = 'campus_admin'
          and invitation.campus_id = campus_option.campus_id
          and invitation.used_at is null
          and invitation.cancelled_at is null
          and invitation.expires_at > clock_timestamp()
      )
    order by
      campus_option.district,
      campus_option.team,
      campus_option.campus,
      campus_option.campus_id
  loop
    perform pg_advisory_xact_lock(
      hashtextextended('admin-invitation-campus:' || v_campus.campus_id::text, 0)
    );

    if exists (
      select 1
      from public.admin_roles role
      where role.role = 'campus_admin'
        and role.campus_id = v_campus.campus_id
    ) or exists (
      select 1
      from public.admin_invitation_codes invitation
      where invitation.role = 'campus_admin'
        and invitation.campus_id = v_campus.campus_id
        and invitation.used_at is null
        and invitation.cancelled_at is null
        and invitation.expires_at > clock_timestamp()
    ) then
      continue;
    end if;

    v_created := public.create_admin_invitation_code(
      'campus_admin',
      v_campus.campus_id
    );
    v_invitations := v_invitations || jsonb_build_array(
      v_created || jsonb_build_object('campusId', v_campus.campus_id)
    );
  end loop;

  return v_invitations;
end;
$$;


ALTER FUNCTION "public"."create_all_campus_admin_invitation_codes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_allocation_draft_from_optimal_job"("p_job_id" "uuid", "p_allocation_name" "text") RETURNS "public"."bus_allocations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_job public.allocation_optimization_jobs%rowtype;
  v_result jsonb;
  v_snapshot jsonb;
  v_config jsonb;
  v_buses jsonb;
  v_passengers jsonb;
  v_route_plan jsonb;
  v_workspace jsonb;
  v_created public.bus_allocations;
  v_now timestamptz := clock_timestamp();
  v_passenger_count integer;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can create allocation drafts.';
  end if;
  if nullif(btrim(p_allocation_name), '') is null then
    raise exception 'Allocation name is required.';
  end if;

  select *
  into v_job
  from public.allocation_optimization_jobs
  where id = p_job_id
  for update;

  if v_job.id is null then
    raise exception 'Allocation optimization job not found.';
  end if;
  if v_job.status <> 'OPTIMAL' or jsonb_typeof(v_job.result) <> 'object' then
    raise exception 'Only OPTIMAL allocation optimization jobs can create drafts.';
  end if;
  if exists (
    select 1
    from public.bus_allocations allocation
    where allocation.allocation_data ->> 'sourceOptimizationJobId' = p_job_id::text
      and allocation.allocation_data ->> 'status' in ('draft', 'confirmed')
  ) then
    raise exception 'An allocation draft already exists for this optimization job.';
  end if;

  v_result := v_job.result;
  v_snapshot := v_job.input_snapshot;
  v_config := v_snapshot -> 'bus';
  v_passenger_count := jsonb_array_length(v_snapshot -> 'passengers');

  if v_config is distinct from public.get_allocation_optimizer_config() then
    raise exception 'Allocation optimizer configuration changed after calculation.';
  end if;
  if jsonb_typeof(v_result -> 'buses') <> 'array'
    or jsonb_typeof(v_result -> 'assignments') <> 'array'
    or v_result ->> 'status' <> 'OPTIMAL'
    or coalesce(v_result ->> 'total_buses', '') !~ '^[1-9][0-9]*$'
    or coalesce(v_result ->> 'total_cost', '') !~ '^[0-9]+$'
    or coalesce(v_result ->> 'second_choice_count', '') !~ '^[0-9]+$'
    or jsonb_array_length(v_result -> 'buses') <> (v_result ->> 'total_buses')::integer
    or jsonb_array_length(v_result -> 'assignments') <> v_passenger_count then
    raise exception 'Optimal allocation result structure is invalid.';
  end if;
  if (v_result ->> 'total_cost')::integer
    <> (v_result ->> 'total_buses')::integer * (v_config ->> 'price')::integer then
    raise exception 'Optimal allocation result cost is invalid.';
  end if;
  if v_job.proven_bus_count is distinct from (v_result ->> 'total_buses')::integer
    or (
      select count(distinct bus ->> 'bus_id')
      from jsonb_array_elements(v_result -> 'buses') bus
    ) <> jsonb_array_length(v_result -> 'buses')
    or (
      select count(*)
      from jsonb_array_elements(v_result -> 'assignments') assignment
      where assignment ->> 'preference_rank' = '2'
    ) <> (v_result ->> 'second_choice_count')::integer then
    raise exception 'Optimal allocation proof metadata is invalid.';
  end if;

  if (
    select count(*)
    from public.reservations reservation
    where reservation.status is distinct from 'cancelled'
      and not coalesce(reservation.data ? 'remainingSeatClaim', false)
  ) <> v_passenger_count
    or exists (
      select 1
      from public.reservations reservation
      where reservation.status is distinct from 'cancelled'
        and not coalesce(reservation.data ? 'remainingSeatClaim', false)
        and not exists (
          select 1
          from jsonb_array_elements(v_snapshot -> 'passengers') passenger
          where passenger ->> 'reservation_id' = reservation.id::text
            and passenger ->> 'campus' = coalesce(
              nullif(reservation.data ->> 'campus', ''),
              nullif(reservation.campus, '')
            )
            and passenger ->> 'team' = coalesce(
              nullif(reservation.data ->> 'team', ''),
              nullif(reservation.team, ''),
              case when reservation.affiliation_type = 'external' then '-' end
            )
            and passenger ->> 'first_choice' = (
              case
                when jsonb_typeof(reservation.data -> 'stationPreferences') = 'array'
                  then reservation.data -> 'stationPreferences'
                else coalesce(reservation.station_preferences, '[]'::jsonb)
              end
            ) #>> '{0,station,name}'
            and passenger ->> 'second_choice' = (
              case
                when jsonb_typeof(reservation.data -> 'stationPreferences') = 'array'
                  then reservation.data -> 'stationPreferences'
                else coalesce(reservation.station_preferences, '[]'::jsonb)
              end
            ) #>> '{1,station,name}'
        )
    ) then
    raise exception 'Active reservations changed after optimization.';
  end if;

  if (
    select count(distinct assignment ->> 'reservation_id')
    from jsonb_array_elements(v_result -> 'assignments') assignment
  ) <> v_passenger_count
    or exists (
      select 1
      from jsonb_array_elements(v_result -> 'assignments') assignment
      left join jsonb_array_elements(v_snapshot -> 'passengers') passenger
        on passenger ->> 'reservation_id' = assignment ->> 'reservation_id'
      left join jsonb_array_elements(v_result -> 'buses') bus
        on bus ->> 'bus_id' = assignment ->> 'bus_id'
      where passenger is null
        or bus is null
        or assignment ->> 'destination' <> bus ->> 'destination'
        or assignment ->> 'destination' not in (
          passenger ->> 'first_choice',
          passenger ->> 'second_choice'
        )
        or coalesce(assignment ->> 'seat_number', '') !~ '^[1-9][0-9]*$'
        or coalesce(bus ->> 'capacity', '') !~ '^[1-9][0-9]*$'
        or (assignment ->> 'seat_number')::integer > (bus ->> 'capacity')::integer
        or case
          when assignment ->> 'destination' = passenger ->> 'first_choice'
            then assignment ->> 'preference_rank' <> '1'
          else assignment ->> 'preference_rank' <> '2'
        end
    ) then
    raise exception 'Optimal allocation assignments are invalid.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_result -> 'assignments') assignment
    group by assignment ->> 'bus_id', assignment ->> 'seat_number'
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(v_result -> 'buses') bus
    left join lateral (
      select count(*) as passenger_count
      from jsonb_array_elements(v_result -> 'assignments') assignment
      where assignment ->> 'bus_id' = bus ->> 'bus_id'
    ) assigned on true
    where nullif(bus ->> 'bus_id', '') is null
      or nullif(bus ->> 'label', '') is null
      or nullif(bus ->> 'destination', '') is null
      or coalesce(bus ->> 'capacity', '') !~ '^[1-9][0-9]*$'
      or coalesce(bus ->> 'price', '') !~ '^[0-9]+$'
      or (bus ->> 'capacity')::integer <> (v_config ->> 'capacity')::integer
      or (bus ->> 'price')::integer <> (v_config ->> 'price')::integer
      or assigned.passenger_count = 0
      or assigned.passenger_count > (bus ->> 'capacity')::integer
  ) then
    raise exception 'Optimal allocation buses or seats are invalid.';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', bus ->> 'bus_id',
      'label', bus ->> 'label',
      'capacity', (bus ->> 'capacity')::integer,
      'price', (bus ->> 'price')::integer,
      'destination', bus ->> 'destination',
      'departureTime', '',
      'boardingPlace', '',
      'minimumPassengers', (v_config ->> 'recommended_minimum_passengers')::integer
    )
    order by bus ->> 'bus_id'
  )
  into v_buses
  from jsonb_array_elements(v_result -> 'buses') bus;

  select jsonb_agg(
    jsonb_build_object(
      'reservationId', reservation.id::text,
      'name', coalesce(nullif(reservation.data ->> 'name', ''), reservation.name, '-'),
      'phone', coalesce(nullif(reservation.data ->> 'phone', ''), reservation.phone, '-'),
      'campus', passenger ->> 'campus',
      'team', passenger ->> 'team',
      'preferences', jsonb_build_array(
        passenger ->> 'first_choice',
        passenger ->> 'second_choice'
      ),
      'busId', assignment ->> 'bus_id',
      'seatNumber', (assignment ->> 'seat_number')::integer
    )
    order by reservation.created_at, reservation.id
  )
  into v_passengers
  from jsonb_array_elements(v_result -> 'assignments') assignment
  join jsonb_array_elements(v_snapshot -> 'passengers') passenger
    on passenger ->> 'reservation_id' = assignment ->> 'reservation_id'
  join public.reservations reservation
    on reservation.id::text = assignment ->> 'reservation_id'
  where reservation.status is distinct from 'cancelled'
    and not coalesce(reservation.data ? 'remainingSeatClaim', false);

  select jsonb_agg(
    jsonb_build_object(
      'busLabel', bus ->> 'label',
      'capacity', (bus ->> 'capacity')::integer,
      'price', (bus ->> 'price')::integer,
      'passengerCount', assigned.passenger_count,
      'emptySeats', (bus ->> 'capacity')::integer - assigned.passenger_count,
      'destinations', jsonb_build_array(
        jsonb_build_object(
          'name', bus ->> 'destination',
          'passengerCount', assigned.passenger_count,
          'rank2Demand', assigned.second_choice_count
        )
      )
    )
    order by bus ->> 'bus_id'
  )
  into v_route_plan
  from jsonb_array_elements(v_result -> 'buses') bus
  cross join lateral (
    select
      count(*)::integer as passenger_count,
      count(*) filter (where assignment ->> 'preference_rank' = '2')::integer
        as second_choice_count
    from jsonb_array_elements(v_result -> 'assignments') assignment
    where assignment ->> 'bus_id' = bus ->> 'bus_id'
  ) assigned;

  v_workspace := jsonb_build_object(
    'schemaVersion', 2,
    'status', 'draft',
    'sourceOptimizationJobId', p_job_id::text,
    'optimalBaseline', jsonb_build_object(
      'totalBuses', (v_result ->> 'total_buses')::integer,
      'totalCost', (v_result ->> 'total_cost')::integer,
      'secondChoiceCount', (v_result ->> 'second_choice_count')::integer,
      'inputHash', v_job.input_hash
    ),
    'sourceAllocation', jsonb_build_object(
      'combination', jsonb_build_array(
        jsonb_build_object(
          'count', (v_result ->> 'total_buses')::integer,
          'capacity', (v_config ->> 'capacity')::integer,
          'price', (v_config ->> 'price')::integer
        )
      ),
      'totalCost', (v_result ->> 'total_cost')::integer,
      'totalCapacity',
        (v_result ->> 'total_buses')::integer * (v_config ->> 'capacity')::integer,
      'totalBuses', (v_result ->> 'total_buses')::integer,
      'efficiency',
        (100.0 * v_passenger_count)
          / ((v_result ->> 'total_buses')::integer * (v_config ->> 'capacity')::integer),
      'emptySeats',
        (v_result ->> 'total_buses')::integer * (v_config ->> 'capacity')::integer
          - v_passenger_count,
      'costPerPerson',
        case when v_passenger_count > 0
          then (v_result ->> 'total_cost')::numeric / v_passenger_count
          else 0
        end,
      'qualityScore', 0,
      'routePlan', v_route_plan
    ),
    'buses', v_buses,
    'passengers', v_passengers,
    'optimization', jsonb_build_object(
      'mode', '정확 최저비용',
      'firstChoiceWeight', 0,
      'costWeight', 1
    ),
    'allowMinimumPassengerOverride', false,
    'history', jsonb_build_array(
      jsonb_build_object(
        'id', 'history-' || replace(gen_random_uuid()::text, '-', ''),
        'at', v_now,
        'actorId', auth.uid()::text,
        'action', 'exact_draft_created',
        'detail', '최적해 증명이 완료된 정확 최저비용 배차안으로 임시 배차안을 생성했습니다.'
      )
    )
  );

  v_created := public.create_bus_allocation_as_global_admin(
    btrim(p_allocation_name),
    v_workspace
  );

  insert into public.allocation_optimization_events (job_id, event_type, detail)
  values (
    p_job_id,
    'DRAFT_CREATED',
    jsonb_build_object(
      'allocation_id', v_created.id::text,
      'created_by', auth.uid()::text
    )
  );

  return v_created;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Optimal allocation result contains invalid numbers.';
end;
$_$;


ALTER FUNCTION "public"."create_allocation_draft_from_optimal_job"("p_job_id" "uuid", "p_allocation_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_allocation_optimization_job"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_job_id uuid;
  v_job public.allocation_optimization_jobs%rowtype;
  v_reusable public.allocation_optimization_jobs%rowtype;
begin
  v_job_id := public.create_uncached_allocation_optimization_job();

  select *
  into v_job
  from public.allocation_optimization_jobs
  where id = v_job_id;

  select reusable.*
  into v_reusable
  from public.allocation_optimization_jobs reusable
  where public.allocation_optimization_snapshot_is_current(v_job.input_snapshot)
    and reusable.id <> v_job.id
    and reusable.status = 'OPTIMAL'
    and reusable.optimization_scope = 'BASELINE'
    and reusable.input_hash = v_job.input_hash
    and reusable.input_snapshot = v_job.input_snapshot
    and jsonb_typeof(reusable.result) = 'object'
  order by reusable.completed_at desc
  limit 1;

  if v_reusable.id is not null then
    update public.allocation_optimization_jobs
    set
      status = 'OPTIMAL',
      started_at = now(),
      completed_at = now(),
      progress = 100,
      current_phase = 'completed',
      elapsed_seconds = 0,
      best_known_bus_count = v_reusable.best_known_bus_count,
      proven_bus_count = v_reusable.proven_bus_count,
      result = v_reusable.result,
      diagnostics = v_reusable.diagnostics,
      error_message = null
    where id = v_job.id
      and status = 'PENDING';

    insert into public.allocation_optimization_events (job_id, event_type, detail)
    values (
      v_job.id,
      'JOB_RESULT_REUSED',
      jsonb_build_object('source_job_id', v_reusable.id::text)
    );
  end if;

  return v_job.id;
end;
$$;


ALTER FUNCTION "public"."create_allocation_optimization_job"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_allocation_optimization_job_for_execution"("p_execution_mode" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_job_id uuid;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can create allocation optimization jobs.';
  end if;

  if p_execution_mode not in ('local', 'cloud') then
    raise exception 'Allocation optimization execution mode is invalid.';
  end if;

  v_job_id := public.create_allocation_optimization_job();

  update public.allocation_optimization_jobs
  set execution_mode = p_execution_mode
  where id = v_job_id;

  insert into public.allocation_optimization_events (job_id, event_type, detail)
  values (
    v_job_id,
    'EXECUTION_MODE_SELECTED',
    jsonb_build_object('execution_mode', p_execution_mode)
  );

  return v_job_id;
end;
$$;


ALTER FUNCTION "public"."create_allocation_optimization_job_for_execution"("p_execution_mode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_bus_allocation_as_global_admin"("p_allocation_name" "text", "p_allocation_data" "jsonb") RETURNS "public"."bus_allocations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row public.bus_allocations;
  v_status text;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can create allocations.';
  end if;

  if nullif(trim(p_allocation_name), '') is null then
    raise exception 'Allocation name is required.';
  end if;
  if jsonb_typeof(p_allocation_data) <> 'object' then
    raise exception 'Allocation data must be a JSON object.';
  end if;

  v_status := p_allocation_data ->> 'status';
  if v_status is not null and v_status <> 'draft' then
    raise exception 'New allocation workspaces must be drafts.';
  end if;
  if jsonb_typeof(p_allocation_data -> 'buses') <> 'array'
    and jsonb_typeof(p_allocation_data -> 'routePlan') <> 'array' then
    raise exception 'Allocation data must contain buses or routePlan.';
  end if;

  insert into public.bus_allocations (
    allocation_name,
    allocation_data,
    total_cost,
    total_capacity,
    created_by,
    revision,
    updated_at
  )
  values (
    trim(p_allocation_name),
    p_allocation_data - 'versions',
    0,
    0,
    auth.uid(),
    0,
    now()
  )
  returning * into v_row;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."create_bus_allocation_as_global_admin"("p_allocation_name" "text", "p_allocation_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_campus_request_with_message"("p_type" "text", "p_title" "text", "p_content" "text", "p_district" "text", "p_team" "text", "p_campus" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_content text := btrim(coalesce(p_content, ''));
  v_role public.admin_roles%rowtype;
  v_request public.campus_requests%rowtype;
  v_message public.campus_request_messages%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.';
  end if;
  if p_type not in (
    'late_signup',
    'cancel_refund',
    'payment_issue',
    'roster_change',
    'transfer_issue',
    'etc'
  ) then
    raise exception 'Campus request type is invalid.';
  end if;
  if v_title = '' or v_content = '' then
    raise exception 'Campus request title and content are required.';
  end if;

  select admin_role.*
  into v_role
  from public.admin_roles admin_role
  where admin_role.user_id = v_actor_id
    and admin_role.role = 'campus_admin'
    and admin_role.district = p_district
    and admin_role.team = p_team
    and admin_role.campus = p_campus
  limit 1;

  if v_role.id is null then
    raise exception 'Only the matching campus administrator can create this request.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('campus-request-create:' || v_actor_id::text, 0)
  );

  select request.*
  into v_request
  from public.campus_requests request
  where request.created_by = v_actor_id
    and request.is_global_notice = false
    and request.type = p_type
    and request.title = v_title
    and request.content = v_content
    and request.district = p_district
    and request.team = p_team
    and request.campus = p_campus
    and request.created_at >= clock_timestamp() - interval '30 seconds'
  order by request.created_at desc, request.id desc
  limit 1;

  if v_request.id is not null then
    select message.*
    into v_message
    from public.campus_request_messages message
    where message.request_id = v_request.id
      and message.sender_role = 'campus_admin'
    order by message.created_at, message.id
    limit 1;

    return jsonb_build_object(
      'request', to_jsonb(v_request),
      'message', case when v_message.id is null then null else to_jsonb(v_message) end
    );
  end if;

  insert into public.campus_requests (
    type,
    status,
    title,
    content,
    is_global_notice,
    district_id,
    team_id,
    campus_id,
    district,
    team,
    campus,
    created_by
  )
  values (
    p_type,
    'open',
    v_title,
    v_content,
    false,
    v_role.district_id,
    v_role.team_id,
    v_role.campus_id,
    p_district,
    p_team,
    p_campus,
    v_actor_id
  )
  returning * into v_request;

  insert into public.campus_request_messages (
    request_id,
    sender_id,
    sender_role,
    message
  )
  values (
    v_request.id,
    v_actor_id,
    'campus_admin',
    v_content
  )
  returning * into v_message;

  return jsonb_build_object(
    'request', to_jsonb(v_request),
    'message', to_jsonb(v_message)
  );
end;
$$;


ALTER FUNCTION "public"."create_campus_request_with_message"("p_type" "text", "p_title" "text", "p_content" "text", "p_district" "text", "p_team" "text", "p_campus" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campuses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."campuses" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_campus_scope_as_global_admin"("p_district" "text", "p_team" "text", "p_campus" "text") RETURNS "public"."campuses"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_district_id uuid;
  v_team_id uuid;
  v_campus public.campuses;
  v_district text := nullif(trim(p_district), '');
  v_team text := nullif(trim(p_team), '');
  v_campus_name text := nullif(trim(p_campus), '');
begin
  if not public.is_global_admin() then raise exception 'Only global admins can manage organization.'; end if;
  if v_district is null or v_team is null or v_campus_name is null then
    raise exception 'District, team, and campus are required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('organization:' || v_district || ':' || v_team || ':' || v_campus_name, 0));

  insert into public.districts (name, is_active)
  values (v_district, true)
  on conflict (name) do update set is_active = true
  returning id into v_district_id;

  insert into public.teams (district_id, name, is_active)
  values (v_district_id, v_team, true)
  on conflict (district_id, name) do update set is_active = true
  returning id into v_team_id;

  if exists (select 1 from public.campuses where team_id = v_team_id and name = v_campus_name) then
    raise exception 'Campus already exists.';
  end if;

  insert into public.campuses (team_id, name, is_active)
  values (v_team_id, v_campus_name, true)
  returning * into v_campus;
  return v_campus;
end;
$$;


ALTER FUNCTION "public"."create_campus_scope_as_global_admin"("p_district" "text", "p_team" "text", "p_campus" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_detailed_allocation_optimization_job"("p_source_job_id" "uuid", "p_skipped_phases" "text"[], "p_resume_from_job_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_source public.allocation_optimization_jobs%rowtype;
  v_resume public.allocation_optimization_jobs%rowtype;
  v_reusable public.allocation_optimization_jobs%rowtype;
  v_job_id uuid;
  v_base_source_job_id uuid;
  v_skipped_phases text[];
  v_settings jsonb;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can create detailed allocation jobs.';
  end if;
  if exists (
    select 1 from public.allocation_optimization_jobs
    where status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED')
  ) then
    raise exception 'Another allocation optimization job is already active.';
  end if;

  select * into v_source
  from public.allocation_optimization_jobs
  where id = p_source_job_id;

  if v_source.id is null
    or v_source.status <> 'OPTIMAL'
    or jsonb_typeof(v_source.result) <> 'object' then
    raise exception 'A completed optimal allocation job is required.';
  end if;

  v_base_source_job_id := case
    when v_source.optimization_scope = 'BASELINE' then v_source.id
    else v_source.source_job_id
  end;
  if v_base_source_job_id is null then
    raise exception 'A baseline source job is required.';
  end if;

  select coalesce(array_agg(phase order by phase), '{}'::text[])
  into v_skipped_phases
  from (
    select distinct unnest(coalesce(p_skipped_phases, '{}'::text[])) as phase
  ) phases
  where phase = any(array[
    'campus_bus_uses',
    'campus_distribution_imbalance',
    'campus_isolated_groups',
    'campus_odd_groups',
    'team_bus_uses',
    'team_distribution_imbalance',
    'destination_occupancy_imbalance'
  ]::text[]);

  if cardinality(v_skipped_phases)
    <> cardinality(coalesce(p_skipped_phases, '{}'::text[])) then
    raise exception 'Detailed allocation skipped phases contain an invalid value.';
  end if;

  v_settings := jsonb_build_object('skipped_phases', to_jsonb(v_skipped_phases));

  if p_resume_from_job_id is not null then
    select * into v_resume
    from public.allocation_optimization_jobs
    where id = p_resume_from_job_id
      and status = 'OPTIMAL'
      and optimization_scope = 'DETAILED'
      and input_snapshot = v_source.input_snapshot;
  else
    select * into v_resume
    from public.allocation_optimization_jobs
    where status = 'OPTIMAL'
      and optimization_scope = 'DETAILED'
      and input_snapshot = v_source.input_snapshot
    order by completed_at desc
    limit 1;
  end if;

  insert into public.allocation_optimization_jobs (
    status, requested_by, input_hash, input_snapshot, optimization_scope,
    source_job_id, detailed_settings, resume_from_job_id
  )
  values (
    'PENDING', auth.uid(), v_source.input_hash, v_source.input_snapshot, 'DETAILED',
    v_base_source_job_id, v_settings, v_resume.id
  )
  returning id into v_job_id;

  select reusable.* into v_reusable
  from public.allocation_optimization_jobs reusable
  where public.allocation_optimization_snapshot_is_current(v_source.input_snapshot)
    and reusable.id <> v_job_id
    and reusable.status = 'OPTIMAL'
    and reusable.optimization_scope = 'DETAILED'
    and reusable.input_snapshot = v_source.input_snapshot
    and reusable.detailed_settings = v_settings
    and jsonb_typeof(reusable.result) = 'object'
  order by reusable.completed_at desc
  limit 1;

  if v_reusable.id is not null then
    update public.allocation_optimization_jobs
    set status = 'OPTIMAL', started_at = now(), completed_at = now(),
      progress = 100, current_phase = 'completed', elapsed_seconds = 0,
      best_known_bus_count = v_reusable.best_known_bus_count,
      proven_bus_count = v_reusable.proven_bus_count,
      result = v_reusable.result, diagnostics = v_reusable.diagnostics,
      error_message = null
    where id = v_job_id and status = 'PENDING';

    insert into public.allocation_optimization_events (job_id, event_type, detail)
    values (
      v_job_id, 'JOB_RESULT_REUSED',
      jsonb_build_object('source_job_id', v_reusable.id::text)
    );
  else
    insert into public.allocation_optimization_events (job_id, event_type, detail)
    values (
      v_job_id, 'DETAILED_JOB_CREATED',
      jsonb_build_object(
        'source_job_id', v_base_source_job_id::text,
        'resume_from_job_id', v_resume.id::text,
        'skipped_phases', to_jsonb(v_skipped_phases)
      )
    );
  end if;

  return v_job_id;
end;
$$;


ALTER FUNCTION "public"."create_detailed_allocation_optimization_job"("p_source_job_id" "uuid", "p_skipped_phases" "text"[], "p_resume_from_job_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_detailed_allocation_optimization_job_for_execution"("p_source_job_id" "uuid", "p_skipped_phases" "text"[], "p_resume_from_job_id" "uuid", "p_execution_mode" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_job_id uuid;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can create allocation optimization jobs.';
  end if;

  if p_execution_mode not in ('local', 'cloud') then
    raise exception 'Allocation optimization execution mode is invalid.';
  end if;

  v_job_id := public.create_detailed_allocation_optimization_job(
    p_source_job_id,
    p_skipped_phases,
    p_resume_from_job_id
  );

  update public.allocation_optimization_jobs
  set execution_mode = p_execution_mode
  where id = v_job_id;

  insert into public.allocation_optimization_events (job_id, event_type, detail)
  values (
    v_job_id,
    'EXECUTION_MODE_SELECTED',
    jsonb_build_object('execution_mode', p_execution_mode)
  );

  return v_job_id;
end;
$$;


ALTER FUNCTION "public"."create_detailed_allocation_optimization_job_for_execution"("p_source_job_id" "uuid", "p_skipped_phases" "text"[], "p_resume_from_job_id" "uuid", "p_execution_mode" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campus_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" DEFAULT 'etc'::"text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "admin_response" "text",
    "is_global_notice" boolean DEFAULT false NOT NULL,
    "district_id" "uuid",
    "team_id" "uuid",
    "campus_id" "uuid",
    "district" "text" NOT NULL,
    "team" "text" NOT NULL,
    "campus" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "handled_by" "uuid",
    "handled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_archived" boolean DEFAULT false NOT NULL,
    CONSTRAINT "campus_requests_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text", 'resolved'::"text", 'on_hold'::"text"]))),
    CONSTRAINT "campus_requests_type_check" CHECK (("type" = ANY (ARRAY['late_signup'::"text", 'notice'::"text", 'cancel_refund'::"text", 'payment_issue'::"text", 'roster_change'::"text", 'transfer_issue'::"text", 'etc'::"text"])))
);


ALTER TABLE "public"."campus_requests" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_global_campus_notice"("p_title" "text", "p_content" "text") RETURNS "public"."campus_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_notice campus_requests;
begin
  if not exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  ) then
    raise exception 'Only global admins can create campus notices.';
  end if;

  insert into campus_requests (
    type,
    status,
    title,
    content,
    is_global_notice,
    district,
    team,
    campus,
    created_by
  )
  values (
    'notice',
    'open',
    trim(p_title),
    trim(p_content),
    true,
    '전체',
    '전체',
    '전체',
    auth.uid()
  )
  returning * into v_notice;

  return v_notice;
end;
$$;


ALTER FUNCTION "public"."create_global_campus_notice"("p_title" "text", "p_content" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."home_announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "is_published" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_archived" boolean DEFAULT false NOT NULL,
    "is_pinned" boolean DEFAULT false NOT NULL,
    "publish_start_at" timestamp with time zone,
    "publish_end_at" timestamp with time zone
);


ALTER TABLE "public"."home_announcements" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_home_announcement_as_global_admin"("p_title" "text", "p_content" "text") RETURNS "public"."home_announcements"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_row public.home_announcements;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can create home announcements.'; end if;
  if nullif(trim(p_title), '') is null then raise exception 'Announcement title is required.'; end if;
  if nullif(trim(p_content), '') is null then raise exception 'Announcement content is required.'; end if;

  insert into public.home_announcements (title, content, created_by, is_published)
  values (trim(p_title), trim(p_content), auth.uid(), true)
  returning * into v_row;
  return v_row;
end;
$$;


ALTER FUNCTION "public"."create_home_announcement_as_global_admin"("p_title" "text", "p_content" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_manual_boarding_exception_record"("p_allocation_id" "uuid", "p_bus_id" "text", "p_reservation_id" "uuid", "p_reason" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_reservation public.reservations%rowtype;
  v_record_id uuid;
  v_bus_label text;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding administrators can create manual boarding exception records';
  end if;
  if nullif(btrim(coalesce(p_bus_id, '')), '') is null
    or nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A bus and reason are required';
  end if;
  if not public.can_manage_boarding_bus(p_allocation_id, p_bus_id) then
    raise exception 'You are not assigned to this bus';
  end if;

  select bus ->> 'label' into v_bus_label
  from public.bus_allocations allocation
  cross join lateral jsonb_array_elements(allocation.allocation_data -> 'buses') bus
  where allocation.id = p_allocation_id
    and bus ->> 'id' = p_bus_id;
  if v_bus_label is null then
    raise exception 'The selected bus does not exist in this allocation';
  end if;

  if p_reservation_id is not null then
    select * into v_reservation
    from public.reservations reservation
    where reservation.id = p_reservation_id
      and public.get_confirmed_ticket_bus_id(
        reservation.id, reservation.confirmed_ticket
      ) = p_bus_id
      and exists (
        select 1
        from public.bus_allocations allocation
        cross join lateral jsonb_array_elements(
          allocation.allocation_data -> 'passengers'
        ) passenger
        where allocation.id = p_allocation_id
          and passenger ->> 'reservationId' = reservation.id::text
          and passenger ->> 'busId' = p_bus_id
      );
    if not found then
      raise exception 'The selected passenger does not belong to this bus';
    end if;
  end if;

  insert into public.manual_boarding_exception_records (
    allocation_id, bus_id, reservation_id, passenger_name, passenger_phone,
    campus, seat_number, reason, created_by
  ) values (
    p_allocation_id,
    p_bus_id,
    p_reservation_id,
    case when p_reservation_id is null then null else v_reservation.name end,
    case when p_reservation_id is null then null else v_reservation.phone end,
    case when p_reservation_id is null then null else v_reservation.campus end,
    case when p_reservation_id is null then null else v_reservation.confirmed_ticket ->> 'seatNumber' end,
    btrim(p_reason),
    auth.uid()
  )
  returning id into v_record_id;

  return v_record_id;
end;
$$;


ALTER FUNCTION "public"."create_manual_boarding_exception_record"("p_allocation_id" "uuid", "p_bus_id" "text", "p_reservation_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personal_inquiries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "admin_response" "text",
    "handled_by" "uuid",
    "handled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "personal_inquiries_category_check" CHECK (("category" = ANY (ARRAY['reservation'::"text", 'payment'::"text", 'ticket'::"text", 'boarding'::"text", 'etc'::"text"]))),
    CONSTRAINT "personal_inquiries_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text", 'resolved'::"text", 'on_hold'::"text"])))
);


ALTER TABLE "public"."personal_inquiries" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_personal_inquiry"("p_category" "text", "p_title" "text", "p_content" "text") RETURNS "public"."personal_inquiries"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_content text := btrim(coalesce(p_content, ''));
  v_inquiry public.personal_inquiries;
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  if p_category not in ('reservation', 'payment', 'ticket', 'boarding', 'etc') then
    raise exception 'Personal inquiry category is invalid.';
  end if;
  if v_title = '' or v_content = '' then
    raise exception 'Personal inquiry title and content are required.';
  end if;
  if length(v_title) > 100 or length(v_content) > 2000 then
    raise exception 'Personal inquiry is too long.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('personal-inquiry:' || v_user_id::text, 0));

  select inquiry.*
  into v_inquiry
  from public.personal_inquiries inquiry
  where inquiry.user_id = v_user_id
    and inquiry.category = p_category
    and inquiry.title = v_title
    and inquiry.content = v_content
    and inquiry.created_at > clock_timestamp() - interval '60 seconds'
  order by inquiry.created_at desc, inquiry.id desc
  limit 1;

  if v_inquiry.id is not null then
    return v_inquiry;
  end if;

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
  values (v_user_id, p_category, v_title, v_content)
  returning * into v_inquiry;

  insert into public.personal_inquiry_messages (
    inquiry_id, sender_id, sender_role, message
  )
  values (v_inquiry.id, v_user_id, 'user', v_content);

  return v_inquiry;
end;
$$;


ALTER FUNCTION "public"."create_personal_inquiry"("p_category" "text", "p_title" "text", "p_content" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_targeted_campus_notice"("p_title" "text", "p_content" "text", "p_targets" "jsonb") RETURNS "public"."campus_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_notice public.campus_requests;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can create campus notices.';
  end if;
  if nullif(trim(p_title), '') is null or nullif(trim(p_content), '') is null then
    raise exception 'Notice title and content are required.';
  end if;
  if jsonb_typeof(p_targets) <> 'array' or jsonb_array_length(p_targets) = 0 then
    raise exception 'At least one campus target is required.';
  end if;

  insert into public.campus_requests (
    type, status, title, content, is_global_notice,
    district, team, campus, created_by
  )
  values ('notice', 'open', trim(p_title), trim(p_content), true, '대상 지정', '대상 지정', '대상 지정', auth.uid())
  returning * into v_notice;

  insert into public.campus_notice_targets (notice_id, district, team, campus)
  select distinct
    v_notice.id,
    trim(target ->> 'district'),
    trim(target ->> 'team'),
    trim(target ->> 'campus')
  from jsonb_array_elements(p_targets) target
  where nullif(trim(target ->> 'district'), '') is not null
    and nullif(trim(target ->> 'team'), '') is not null
    and nullif(trim(target ->> 'campus'), '') is not null;

  if not exists (
    select 1 from public.campus_notice_targets where notice_id = v_notice.id
  ) then
    raise exception 'No valid campus targets were provided.';
  end if;

  return v_notice;
end;
$$;


ALTER FUNCTION "public"."create_targeted_campus_notice"("p_title" "text", "p_content" "text", "p_targets" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_uncached_allocation_optimization_job"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_job_id uuid;
  v_config jsonb;
  v_passengers jsonb;
  v_snapshot jsonb;
  v_active_reservation_count integer;
  v_active_reservations_hash text;
  v_invalid_reservations text;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can create allocation optimization jobs.';
  end if;
  if exists (
    select 1
    from public.allocation_optimization_jobs
    where status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED')
  ) then
    raise exception 'Another allocation optimization job is already active.';
  end if;

  v_config := public.get_allocation_optimizer_config();
  if coalesce((v_config ->> 'capacity')::integer, 0) <= 0
    or coalesce((v_config ->> 'price')::integer, -1) < 0
    or coalesce((v_config ->> 'recommended_minimum_passengers')::integer, 0) <= 0 then
    raise exception 'Allocation optimizer configuration is invalid.';
  end if;

  select
    count(*)::integer,
    md5(
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', reservation.id::text,
            'status', reservation.status,
            'updated_at', reservation.updated_at
          )
          order by reservation.id
        )::text,
        '[]'
      )
    )
  into v_active_reservation_count, v_active_reservations_hash
  from public.reservations reservation
  where reservation.status is distinct from 'cancelled';

  with active_reservations as (
    select
      reservation.id,
      coalesce(
        nullif(reservation.data ->> 'campus', ''),
        nullif(reservation.campus, '')
      ) as campus,
      coalesce(
        nullif(reservation.data ->> 'team', ''),
        nullif(reservation.team, ''),
        case when reservation.affiliation_type = 'external' then '-' end
      ) as team,
      case
        when jsonb_typeof(reservation.data -> 'stationPreferences') = 'array'
          then reservation.data -> 'stationPreferences'
        else coalesce(reservation.station_preferences, '[]'::jsonb)
      end as preferences
    from public.reservations reservation
    where reservation.status is distinct from 'cancelled'
      and not coalesce(reservation.data ? 'remainingSeatClaim', false)
  ),
  normalized as (
    select
      active.id,
      active.campus,
      active.team,
      active.preferences,
      active.preferences #>> '{0,station,name}' as first_choice,
      active.preferences #>> '{1,station,name}' as second_choice
    from active_reservations active
  )
  select string_agg(normalized.id::text, ', ' order by normalized.id::text)
  into v_invalid_reservations
  from normalized
  where normalized.campus is null
    or normalized.team is null
    or jsonb_typeof(normalized.preferences) <> 'array'
    or case
      when jsonb_typeof(normalized.preferences) = 'array'
        then jsonb_array_length(normalized.preferences) <> 2
      else true
    end
    or nullif(normalized.first_choice, '') is null
    or nullif(normalized.second_choice, '') is null
    or normalized.first_choice = normalized.second_choice;

  if v_invalid_reservations is not null then
    raise exception 'Active reservations have invalid allocation data: %',
      v_invalid_reservations;
  end if;

  with active_reservations as (
    select
      reservation.id,
      coalesce(
        nullif(reservation.data ->> 'campus', ''),
        nullif(reservation.campus, '')
      ) as campus,
      coalesce(
        nullif(reservation.data ->> 'team', ''),
        nullif(reservation.team, ''),
        case when reservation.affiliation_type = 'external' then '-' end
      ) as team,
      case
        when jsonb_typeof(reservation.data -> 'stationPreferences') = 'array'
          then reservation.data -> 'stationPreferences'
        else coalesce(reservation.station_preferences, '[]'::jsonb)
      end as preferences,
      reservation.created_at
    from public.reservations reservation
    where reservation.status is distinct from 'cancelled'
      and not coalesce(reservation.data ? 'remainingSeatClaim', false)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'reservation_id', active.id::text,
        'campus', active.campus,
        'team', active.team,
        'first_choice', active.preferences #>> '{0,station,name}',
        'second_choice', active.preferences #>> '{1,station,name}'
      )
      order by active.created_at, active.id
    ),
    '[]'::jsonb
  )
  into v_passengers
  from active_reservations active;

  if jsonb_array_length(v_passengers) = 0 then
    raise exception 'No active reservations are available for optimization.';
  end if;

  v_snapshot := jsonb_build_object(
    'schema_version', 1,
    'bus', v_config,
    'passengers', v_passengers,
    'active_reservation_count', v_active_reservation_count,
    'active_reservations_hash', v_active_reservations_hash
  );

  begin
    insert into public.allocation_optimization_jobs (
      status,
      requested_by,
      input_hash,
      input_snapshot
    )
    values (
      'PENDING',
      auth.uid(),
      md5(v_snapshot::text),
      v_snapshot
    )
    returning id into v_job_id;
  exception
    when unique_violation then
      raise exception 'Another allocation optimization job is already active.';
  end;

  insert into public.allocation_optimization_events (job_id, event_type, detail)
  values (
    v_job_id,
    'JOB_CREATED',
    jsonb_build_object(
      'requested_by', auth.uid()::text,
      'passenger_count', jsonb_array_length(v_passengers),
      'active_reservation_count', v_active_reservation_count,
      'input_hash', md5(v_snapshot::text)
    )
  );

  return v_job_id;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Allocation optimizer configuration contains invalid numbers.';
end;
$$;


ALTER FUNCTION "public"."create_uncached_allocation_optimization_job"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_bus_option_as_global_admin"("p_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_global_admin() then raise exception 'Only global admins can manage bus options.'; end if;
  delete from public.bus_options where id = p_id;
  if not found then raise exception 'Bus option not found.'; end if;
  return true;
end;
$$;


ALTER FUNCTION "public"."delete_bus_option_as_global_admin"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_campus_request_as_global_admin"("p_request_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global administrators can delete campus inquiries.';
  end if;

  delete from public.campus_requests
  where id = p_request_id
    and is_global_notice = false;

  if not found then
    raise exception 'Campus inquiry not found.';
  end if;

  return true;
end;
$$;


ALTER FUNCTION "public"."delete_campus_request_as_global_admin"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_draft_allocation_workspace"("p_allocation_id" "uuid", "p_expected_revision" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_current public.bus_allocations%rowtype;
begin
  if v_actor_id is null or not public.is_global_admin() then
    raise exception 'Only global admins can edit allocations.';
  end if;

  select *
  into v_current
  from public.bus_allocations
  where id = p_allocation_id
  for update;

  if not found then
    raise exception 'Allocation workspace not found.';
  end if;
  if v_current.revision <> p_expected_revision then
    raise exception 'Allocation workspace changed. Reload before saving.';
  end if;
  if v_current.allocation_data ->> 'status' <> 'draft' then
    raise exception 'Only draft allocations can be deleted.';
  end if;
  if v_current.allocation_data #>> '{editLock,actorId}' is distinct from v_actor_id::text then
    raise exception 'Allocation workspace lock is owned by another administrator.';
  end if;

  delete from public.bus_allocations
  where id = p_allocation_id;
end;
$$;


ALTER FUNCTION "public"."delete_draft_allocation_workspace"("p_allocation_id" "uuid", "p_expected_revision" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_my_personal_inquiry"("p_inquiry_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  delete from public.personal_inquiries
  where id = p_inquiry_id
    and user_id = v_user_id;

  if not found then
    raise exception 'Personal inquiry not found or inaccessible.';
  end if;

  return true;
end;
$$;


ALTER FUNCTION "public"."delete_my_personal_inquiry"("p_inquiry_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_personal_inquiry_as_global_admin"("p_inquiry_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global administrators can delete personal inquiries.';
  end if;

  delete from public.personal_inquiries
  where id = p_inquiry_id;

  if not found then
    raise exception 'Personal inquiry not found.';
  end if;

  return true;
end;
$$;


ALTER FUNCTION "public"."delete_personal_inquiry_as_global_admin"("p_inquiry_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_station_as_global_admin"("p_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_global_admin() then raise exception 'Only global admins can manage stations.'; end if;
  delete from public.stations where id = p_id;
  if not found then raise exception 'Station not found.'; end if;
  return true;
end;
$$;


ALTER FUNCTION "public"."delete_station_as_global_admin"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_user_account_as_admin"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $_$
declare
  v_now timestamptz := clock_timestamp();
  v_actor_id uuid := auth.uid();
  v_reservation_ids text[];
  v_allocation public.bus_allocations%rowtype;
begin
  if v_actor_id is null or not public.is_global_admin() then
    raise exception 'Only global admins can delete user accounts.';
  end if;

  if p_user_id is null then
    raise exception 'A user ID is required.';
  end if;

  if p_user_id = v_actor_id then
    raise exception 'The currently signed-in account cannot be deleted.';
  end if;

  perform 1
  from auth.users
  where id = p_user_id
  for update;

  if not found then
    return false;
  end if;

  if exists (
    select 1
    from public.admin_roles
    where user_id = p_user_id
      and role = 'global_admin'
  ) then
    raise exception 'Global admin accounts cannot be deleted.';
  end if;

  select coalesce(array_agg(id::text), array[]::text[])
  into v_reservation_ids
  from public.reservations
  where user_id = p_user_id;

  for v_allocation in
    select allocation.*
    from public.bus_allocations allocation
    where allocation.allocation_data ->> 'status' = 'confirmed'
      and exists (
        select 1
        from jsonb_array_elements(
          coalesce(allocation.allocation_data -> 'passengers', '[]'::jsonb)
        ) passenger
        where passenger ->> 'reservationId' = any(v_reservation_ids)
      )
    for update
  loop
    update public.bus_allocations
    set
      allocation_data = jsonb_set(
        jsonb_set(
          v_allocation.allocation_data,
          '{passengers}',
          coalesce((
            select jsonb_agg(passenger.value order by passenger.ordinality)
            from jsonb_array_elements(
              coalesce(v_allocation.allocation_data -> 'passengers', '[]'::jsonb)
            )
              with ordinality passenger(value, ordinality)
            where not (passenger.value ->> 'reservationId' = any(v_reservation_ids))
          ), '[]'::jsonb),
          true
        ),
        '{history}',
        coalesce(v_allocation.allocation_data -> 'history', '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object(
            'id', 'history-' || gen_random_uuid()::text,
            'at', v_now::text,
            'actorId', v_actor_id::text,
            'action', 'user_account_deleted',
            'detail', 'Deleted user was removed from the confirmed allocation.'
          )),
        true
      ),
      updated_at = v_now,
      revision = revision + 1
    where id = v_allocation.id;
  end loop;

  update public.payments
  set verified_by = null
  where verified_by = p_user_id;

  update public.bus_allocations
  set created_by = null
  where created_by = p_user_id;

  update public.admin_roles
  set granted_by = null
  where granted_by = p_user_id;

  update public.campus_transfers
  set
    sent_by = case when sent_by = p_user_id then null else sent_by end,
    confirmed_by = case when confirmed_by = p_user_id then null else confirmed_by end
  where sent_by = p_user_id
    or confirmed_by = p_user_id;

  update public.campus_requests
  set handled_by = null
  where handled_by = p_user_id;

  delete from public.campus_requests
  where created_by = p_user_id;

  delete from public.campus_request_messages
  where sender_id = p_user_id;

  if to_regclass('public.simulation_stage_runs') is not null then
    execute 'delete from public.simulation_stage_runs where requested_by = $1'
      using p_user_id;
  end if;

  delete from auth.users
  where id = p_user_id;

  return found;
end;
$_$;


ALTER FUNCTION "public"."delete_user_account_as_admin"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_user_reservation"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_opens_at timestamptz;
begin
  select nullif(value ->> 'opens_at', '')::timestamptz
  into v_opens_at
  from public.app_settings
  where key = 'first_reservation_deadline'
  for share;

  if v_opens_at is not null and v_opens_at > clock_timestamp() then
    raise exception 'Reservation window has not opened yet.';
  end if;

  return public.delete_user_reservation_without_opening_check();
end;
$$;


ALTER FUNCTION "public"."delete_user_reservation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_user_reservation_without_opening_check"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_deadline_value jsonb;
  v_deadline_at timestamptz;
  v_status text;
begin
  if v_user_id is null then
    raise exception 'Authentication failed.';
  end if;

  select value
  into v_deadline_value
  from public.app_settings
  where key = 'first_reservation_deadline'
  for share;

  if v_deadline_value is null then
    raise exception 'Reservation deadline setting is missing.';
  end if;

  v_deadline_at :=
    nullif(v_deadline_value ->> 'deadline_at', '')::timestamptz;

  if v_deadline_at is not null and v_deadline_at <= clock_timestamp() then
    raise exception 'Reservation deadline has passed.';
  end if;

  select status
  into v_status
  from public.reservations
  where user_id = v_user_id
  for update;

  if not found then
    return false;
  end if;

  if v_status <> 'requested' then
    raise exception 'Only requested reservations can be deleted.';
  end if;

  delete from public.reservations
  where user_id = v_user_id
    and status = 'requested';

  return found;
end;
$$;


ALTER FUNCTION "public"."delete_user_reservation_without_opening_check"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."email_exists"("p_email" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from auth.users
    where lower(auth.users.email) = lower(trim(p_email))
  );
$$;


ALTER FUNCTION "public"."email_exists"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_external_payment_global_admin"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if exists (
    select 1
    from public.reservations reservation
    where reservation.id = new.reservation_id
      and reservation.affiliation_type = 'external'
  ) and not public.is_global_admin() then
    raise exception 'Only global admins can manage external participant payments.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_external_payment_global_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_payment_mutation_financial_safety"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_reservation public.reservations;
  v_financial_change boolean := tg_op = 'INSERT';
begin
  select *
  into v_reservation
  from public.reservations
  where id = new.reservation_id;

  if v_reservation.id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(public.get_payment_scope_lock_key(
    v_reservation.campus_id,
    v_reservation.district,
    v_reservation.team,
    v_reservation.campus
  ));

  if tg_op = 'UPDATE' then
    v_financial_change :=
      old.amount is distinct from new.amount
      or old.status is distinct from new.status;
  end if;

  if not coalesce(v_reservation.data ? 'remainingSeatClaim', false)
    and v_financial_change
    and exists (
      select 1
      from public.campus_transfers transfer
      where transfer.status in ('sent', 'confirmed')
        and (
          (
            v_reservation.campus_id is not null
            and transfer.campus_id = v_reservation.campus_id
          )
          or (
            transfer.district = v_reservation.district
            and transfer.team = v_reservation.team
            and transfer.campus = v_reservation.campus
          )
        )
    ) then
    raise exception 'Cancel or reopen the campus transfer before changing individual payments.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_payment_mutation_financial_safety"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_single_confirmed_allocation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.allocation_data ->> 'status' = 'confirmed'
    and exists (
      select 1 from public.bus_allocations
      where id <> new.id and allocation_data ->> 'status' = 'confirmed'
    ) then
    raise exception 'Cancel the existing confirmed allocation before confirming another.';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_single_confirmed_allocation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_boarding_passenger_move"("p_reservation_id" "uuid", "p_expected_source_bus_id" "text", "p_target_bus_id" "text", "p_reason" "text", "p_actor_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_allocation public.bus_allocations%rowtype;
  v_reservation public.reservations%rowtype;
  v_target_bus jsonb;
  v_source_bus_id text;
  v_seat_number integer;
  v_passenger jsonb;
  v_passengers jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A move reason is required.';
  end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed'
  for update;
  if not found then raise exception 'Confirmed allocation not found.'; end if;

  select * into v_reservation
  from public.reservations
  where id = p_reservation_id
    and status = 'confirmed'
    and confirmed_ticket is not null
  for update;
  if not found then raise exception 'Confirmed passenger not found.'; end if;

  v_source_bus_id := public.get_confirmed_ticket_bus_id(
    v_reservation.id,
    v_reservation.confirmed_ticket
  );
  if v_source_bus_id is distinct from p_expected_source_bus_id then
    raise exception 'The passenger bus changed after the request was created.';
  end if;
  if v_source_bus_id = p_target_bus_id then
    raise exception 'The passenger is already assigned to the target bus.';
  end if;

  select bus into v_target_bus
  from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
  where bus ->> 'id' = p_target_bus_id;
  if v_target_bus is null then raise exception 'Target bus not found.'; end if;

  if exists (
    select 1 from public.boarding_bus_departures
    where allocation_id = v_allocation.id
      and bus_id in (v_source_bus_id, p_target_bus_id)
      and cancelled_at is null
  ) then
    raise exception 'Departed buses cannot receive passenger moves.';
  end if;

  select candidate.seat_number into v_seat_number
  from generate_series(1, (v_target_bus ->> 'capacity')::integer) candidate(seat_number)
  where not exists (
      select 1
      from jsonb_array_elements(v_allocation.allocation_data -> 'passengers') passenger
      where passenger ->> 'reservationId' <> p_reservation_id::text
        and passenger ->> 'busId' = p_target_bus_id
        and (passenger ->> 'seatNumber')::integer = candidate.seat_number
    )
    and not exists (
      select 1 from public.boarding_walk_in_passengers walk_in
      where walk_in.allocation_id = v_allocation.id
        and walk_in.bus_id = p_target_bus_id
        and walk_in.seat_number = candidate.seat_number
    )
  order by candidate.seat_number
  limit 1;
  if v_seat_number is null then
    raise exception 'The target bus has no remaining capacity.';
  end if;

  select passenger.value into v_passenger
  from jsonb_array_elements(v_allocation.allocation_data -> 'passengers') passenger(value)
  where passenger.value ->> 'reservationId' = p_reservation_id::text
  limit 1;
  if v_passenger is null then raise exception 'Allocation passenger not found.'; end if;

  v_passenger := jsonb_set(
    jsonb_set(v_passenger, '{busId}', to_jsonb(p_target_bus_id), true),
    '{seatNumber}',
    to_jsonb(v_seat_number),
    true
  );

  select coalesce(jsonb_agg(passenger.value order by passenger.ordinality), '[]'::jsonb)
  into v_passengers
  from jsonb_array_elements(v_allocation.allocation_data -> 'passengers')
    with ordinality passenger(value, ordinality)
  where passenger.value ->> 'reservationId' <> p_reservation_id::text;

  update public.bus_allocations
  set allocation_data = jsonb_set(
        allocation_data,
        '{passengers}',
        v_passengers || jsonb_build_array(v_passenger),
        true
      ),
      revision = revision + 1,
      updated_at = v_now
  where id = v_allocation.id;

  update public.reservations
  set confirmed_ticket = jsonb_set(
        jsonb_set(
          jsonb_set(confirmed_ticket, '{busId}', to_jsonb(p_target_bus_id), true),
          '{busNumber}', to_jsonb(v_target_bus ->> 'label'), true
        ),
        '{seatNumber}', to_jsonb(v_seat_number::text), true
      ),
      boarding_status = 'unchecked',
      boarding_confirmed_at = null,
      boarding_status_updated_at = v_now,
      boarding_status_updated_by = p_actor_id,
      boarding_no_show_departure_id = null,
      boarding_note = concat_ws(E'\n', nullif(boarding_note, ''), '[호차 이동] ' || btrim(p_reason)),
      boarding_note_updated_at = v_now,
      boarding_note_updated_by = p_actor_id,
      updated_at = v_now
  where id = p_reservation_id;

  insert into public.boarding_status_events (
    reservation_id, from_status, to_status, actor_id, note
  ) values (
    p_reservation_id, v_reservation.boarding_status, 'unchecked', p_actor_id, 'boarding_bus_moved'
  );
end;
$$;


ALTER FUNCTION "public"."execute_boarding_passenger_move"("p_reservation_id" "uuid", "p_expected_source_bus_id" "text", "p_target_bus_id" "text", "p_reason" "text", "p_actor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_stale_allocation_optimization_jobs"("p_stale_after_seconds" integer DEFAULT 4500) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_expired_count integer;
begin
  if p_stale_after_seconds < 60 or p_stale_after_seconds > 86400 then
    raise exception 'Stale optimizer job threshold must be between 60 and 86400 seconds.';
  end if;

  with expired as (
    update public.allocation_optimization_jobs
    set
      status = 'FAILED',
      current_phase = 'failed',
      completed_at = now(),
      error_message = 'The optimizer worker heartbeat expired before completion.'
    where status in ('RUNNING', 'CANCEL_REQUESTED')
      and updated_at < now() - make_interval(secs => p_stale_after_seconds)
    returning id, worker_id, updated_at
  ),
  events as (
    insert into public.allocation_optimization_events (
      job_id,
      event_type,
      detail
    )
    select
      id,
      'JOB_HEARTBEAT_EXPIRED',
      jsonb_build_object(
        'worker_id', worker_id,
        'last_heartbeat_at', updated_at,
        'stale_after_seconds', p_stale_after_seconds
      )
    from expired
    returning 1
  )
  select count(*)::integer into v_expired_count from events;

  return v_expired_count;
end;
$$;


ALTER FUNCTION "public"."expire_stale_allocation_optimization_jobs"("p_stale_after_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_active_reservation_optimization_state"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
    'count', count(*)::integer,
    'hash', md5(
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', reservation.id::text,
            'status', reservation.status,
            'updated_at', reservation.updated_at
          )
          order by reservation.id
        )::text,
        '[]'
      )
    )
  )
  from public.reservations reservation
  where reservation.status is distinct from 'cancelled';
$$;


ALTER FUNCTION "public"."get_active_reservation_optimization_state"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_personal_ticket_page"("p_page" integer DEFAULT 1, "p_page_size" integer DEFAULT 25, "p_search" "text" DEFAULT ''::"text", "p_status" "text" DEFAULT 'all'::"text", "p_ticket" "text" DEFAULT 'all'::"text", "p_admin_role" "text" DEFAULT 'all'::"text", "p_campus_issue" "text" DEFAULT 'all'::"text", "p_campus" "text" DEFAULT 'all'::"text", "p_district" "text" DEFAULT 'all'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_search text := trim(coalesce(p_search, ''));
  v_result jsonb;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can manage personal tickets.';
  end if;

  with reservation_people as (
    select
      coalesce(nullif(reservation.data ->> 'id', ''), reservation.id::text) as id,
      reservation.id as db_id,
      reservation.user_id,
      profile.email,
      coalesce(
        nullif(reservation.data ->> 'name', ''),
        nullif(reservation.name, ''),
        profile.name,
        ''
      ) as name,
      coalesce(
        nullif(reservation.data ->> 'phone', ''),
        nullif(reservation.phone, ''),
        profile.phone,
        ''
      ) as phone,
      coalesce(
        nullif(reservation.data ->> 'district', ''),
        nullif(reservation.district, ''),
        profile.district,
        ''
      ) as district,
      coalesce(
        nullif(reservation.data ->> 'team', ''),
        nullif(reservation.team, ''),
        profile.team,
        ''
      ) as team,
      coalesce(
        nullif(reservation.data ->> 'campus', ''),
        nullif(reservation.campus, ''),
        profile.campus,
        ''
      ) as campus,
      coalesce(
        reservation.data -> 'stationPreferences',
        reservation.station_preferences,
        '[]'::jsonb
      ) as station_preferences,
      coalesce(reservation.status, nullif(reservation.data ->> 'status', ''), 'requested') as status,
      payment.status as payment_status,
      coalesce(
        nullif(reservation.confirmed_ticket, 'null'::jsonb),
        nullif(reservation.data -> 'confirmedTicket', 'null'::jsonb)
      ) as confirmed_ticket,
      coalesce(nullif(reservation.data ->> 'requestedAt', ''), reservation.created_at::text, '') as requested_at,
      coalesce(nullif(reservation.data ->> 'updatedAt', ''), reservation.updated_at::text) as updated_at,
      reservation.data as raw_data,
      true as has_reservation
    from public.reservations reservation
    left join public.profiles profile on profile.id = reservation.user_id
    left join public.payments payment on payment.reservation_id = reservation.id
  ),
  not_applied_people as (
    select
      'profile-' || profile.id::text as id,
      null::uuid as db_id,
      profile.id as user_id,
      profile.email,
      coalesce(profile.name, '') as name,
      coalesce(profile.phone, '') as phone,
      coalesce(profile.district, '') as district,
      coalesce(profile.team, '') as team,
      coalesce(profile.campus, '') as campus,
      '[]'::jsonb as station_preferences,
      'not_applied'::text as status,
      null::text as payment_status,
      null::jsonb as confirmed_ticket,
      ''::text as requested_at,
      null::text as updated_at,
      null::jsonb as raw_data,
      false as has_reservation
    from public.profiles profile
    where not exists (
      select 1
      from public.reservations reservation
      where reservation.user_id = profile.id
    )
  ),
  people as (
    select * from reservation_people
    union all
    select * from not_applied_people
  ),
  people_with_roles as (
    select
      person.*,
      coalesce(roles.admin_roles, '[]'::jsonb) as admin_roles,
      coalesce(roles.role_names, array[]::text[]) as role_names,
      (
        (person.has_reservation and person.status <> 'cancelled' and person.payment_status is distinct from 'completed')
        or person.status = 'not_applied'
      ) as has_campus_issue
    from people person
    left join lateral (
      select
        jsonb_agg(
          jsonb_build_object(
            'id', admin_role.id,
            'user_id', admin_role.user_id,
            'role', admin_role.role,
            'district', admin_role.district,
            'team', admin_role.team,
            'campus', admin_role.campus
          )
          order by admin_role.role, admin_role.id
        ) as admin_roles,
        array_agg(admin_role.role) as role_names
      from public.admin_roles admin_role
      where admin_role.user_id = person.user_id
    ) roles on true
  ),
  filtered as (
    select *
    from people_with_roles person
    where
      (
        p_status = 'all'
        or person.status = any(string_to_array(p_status, ','))
      )
      and (
        p_ticket = 'all'
        or (p_ticket = 'not_applied' and person.status = 'not_applied')
        or (p_ticket = 'confirmed' and person.confirmed_ticket is not null)
        or (
          p_ticket = 'pending'
          and person.has_reservation
          and person.status <> 'cancelled'
          and person.confirmed_ticket is null
        )
      )
      and (
        p_district = 'all'
        or (
          p_district = 'outside_seoul'
          and person.district <> ''
          and person.district <> '서울지구'
        )
        or person.district = p_district
      )
      and (p_campus = 'all' or person.campus = p_campus)
      and (p_campus_issue = 'all' or person.has_campus_issue)
      and (
        p_admin_role = 'all'
        or (
          'general' = any(string_to_array(p_admin_role, ','))
          and cardinality(person.role_names) = 0
        )
        or person.role_names && string_to_array(p_admin_role, ',')
      )
      and (
        v_search = ''
        or concat_ws(
          ' ',
          person.name,
          person.email,
          person.phone,
          person.district,
          person.team,
          person.campus,
          person.station_preferences::text,
          person.confirmed_ticket::text
        ) ilike '%' || replace(v_search, '%', '\%') || '%'
      )
  ),
  page_rows as (
    select *
    from filtered
    order by campus collate "default", team collate "default", name collate "default", user_id
    offset (v_page - 1) * v_page_size
    limit v_page_size
  ),
  summary as (
    select
      count(*)::integer as total,
      count(*) filter (where status <> 'not_applied')::integer as applied,
      count(*) filter (
        where status not in ('cancelled', 'not_applied') and confirmed_ticket is not null
      )::integer as confirmed,
      count(*) filter (
        where status not in ('cancelled', 'not_applied') and confirmed_ticket is null
      )::integer as pending,
      count(*) filter (
        where status not in ('cancelled', 'not_applied') and payment_status = 'completed'
      )::integer as paid,
      count(*) filter (where status = 'cancelled')::integer as cancelled,
      count(*) filter (where status = 'not_applied')::integer as not_applied
    from people_with_roles
  ),
  district_summary as (
    select person.district as name
    from people_with_roles person
    where person.district <> ''
    group by person.district
  ),
  campus_summary as (
    select
      person.campus as name,
      count(*) filter (where has_campus_issue)::integer as issue_count,
      count(*) filter (where status = 'not_applied')::integer as not_applied_count,
      count(*) filter (
        where has_reservation and status <> 'cancelled' and payment_status is distinct from 'completed'
      )::integer as unpaid_count,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'user_id', admin_role.user_id,
              'name', coalesce(profile.name, ''),
              'phone', coalesce(profile.phone, ''),
              'email', profile.email
            )
            order by coalesce(profile.name, ''), admin_role.user_id
          )
          from public.admin_roles admin_role
          left join public.profiles profile on profile.id = admin_role.user_id
          where admin_role.role = 'campus_admin'
            and coalesce(admin_role.campus, '') = person.campus
        ),
        '[]'::jsonb
      ) as admins
    from people_with_roles person
    where person.campus <> ''
    group by person.campus
  )
  select jsonb_build_object(
    'items',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', row.id,
            'db_id', row.db_id,
            'user_id', row.user_id,
            'email', row.email,
            'name', row.name,
            'phone', row.phone,
            'district', row.district,
            'team', row.team,
            'campus', row.campus,
            'station_preferences', row.station_preferences,
            'status', row.status,
            'payment_status', row.payment_status,
            'confirmed_ticket', row.confirmed_ticket,
            'requested_at', row.requested_at,
            'updated_at', row.updated_at,
            'raw_data', row.raw_data,
            'has_reservation', row.has_reservation,
            'admin_roles', row.admin_roles
          )
          order by row.campus collate "default", row.team collate "default", row.name collate "default", row.user_id
        )
        from page_rows row
      ),
      '[]'::jsonb
    ),
    'total', (select total from summary),
    'filtered_total', (select count(*) from filtered),
    'summary', (select to_jsonb(summary) from summary),
    'districts',
    coalesce(
      (
        select jsonb_agg(to_jsonb(district_summary) order by name collate "default")
        from district_summary
      ),
      '[]'::jsonb
    ),
    'campuses',
    coalesce(
      (
        select jsonb_agg(to_jsonb(campus_summary) order by name collate "default")
        from campus_summary
      ),
      '[]'::jsonb
    )
  )
  into v_result;

  return v_result;
end;
$$;


ALTER FUNCTION "public"."get_admin_personal_ticket_page"("p_page" integer, "p_page_size" integer, "p_search" "text", "p_status" "text", "p_ticket" "text", "p_admin_role" "text", "p_campus_issue" "text", "p_campus" "text", "p_district" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_all_campus_payment_accounts"() RETURNS TABLE("campus_id" "uuid", "bank_name" "text", "account_number" "text", "account_holder" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can view all campus payment accounts.';
  end if;

  return query
  select account.campus_id, account.bank_name, account.account_number,
    account.account_holder
  from public.campus_payment_accounts account;
end;
$$;


ALTER FUNCTION "public"."get_all_campus_payment_accounts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_allocation_optimization_job"("p_job_id" "uuid") RETURNS TABLE("id" "uuid", "optimization_scope" "text", "source_job_id" "uuid", "resume_from_job_id" "uuid", "detailed_settings" "jsonb", "status" "text", "requested_at" timestamp with time zone, "started_at" timestamp with time zone, "completed_at" timestamp with time zone, "progress" integer, "current_phase" "text", "elapsed_seconds" integer, "best_known_bus_count" integer, "proven_bus_count" integer, "result_reused" boolean, "result" "jsonb", "diagnostics" "jsonb", "error_message" "text", "reservations_changed" boolean, "snapshot_active_reservation_count" integer, "current_active_reservation_count" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_current_state jsonb;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can view allocation optimization jobs.';
  end if;

  v_current_state := public.get_active_reservation_optimization_state();

  return query
  select job.id, job.optimization_scope, job.source_job_id, job.resume_from_job_id,
    job.detailed_settings, job.status, job.requested_at, job.started_at,
    job.completed_at, job.progress, job.current_phase, job.elapsed_seconds,
    job.best_known_bus_count, job.proven_bus_count, job.result_reused,
    job.result, job.diagnostics, job.error_message,
    coalesce(job.input_snapshot ->> 'active_reservations_hash', '')
      <> coalesce(v_current_state ->> 'hash', ''),
    (job.input_snapshot ->> 'active_reservation_count')::integer,
    (v_current_state ->> 'count')::integer
  from public.allocation_optimization_jobs job
  where job.id = p_job_id;
end;
$$;


ALTER FUNCTION "public"."get_allocation_optimization_job"("p_job_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_allocation_optimizer_config"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_config jsonb;
  v_maximum_buses integer;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can view allocation optimizer configuration.';
  end if;

  select value
  into v_config
  from public.app_settings
  where key = 'allocation_optimizer_config';

  select max_count
  into v_maximum_buses
  from public.bus_options
  order by created_at desc, id desc
  limit 1;

  v_config := coalesce(
    v_config,
    jsonb_build_object(
      'capacity', 45,
      'price', 0,
      'recommended_minimum_passengers', 36
    )
  );

  return jsonb_set(
    v_config,
    '{maximum_buses}',
    to_jsonb(coalesce(v_maximum_buses, 999)),
    true
  );
end;
$$;


ALTER FUNCTION "public"."get_allocation_optimizer_config"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_allocation_workspace_version_snapshot"("p_version_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_snapshot jsonb;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can view allocation versions.';
  end if;

  select version.snapshot
  into v_snapshot
  from public.allocation_workspace_versions version
  where version.id = p_version_id;

  if v_snapshot is null then
    raise exception 'Allocation workspace version not found.';
  end if;

  return v_snapshot;
end;
$$;


ALTER FUNCTION "public"."get_allocation_workspace_version_snapshot"("p_version_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_allocation_workspace_versions"("p_allocation_id" "uuid") RETURNS TABLE("id" "text", "created_at" timestamp with time zone, "actor_id" "text", "label" "text", "changes" "jsonb")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can view allocation versions.';
  end if;

  return query
  select
    version.id,
    version.created_at,
    version.actor_id,
    version.label,
    version.changes
  from public.allocation_workspace_versions version
  where version.allocation_id = p_allocation_id
  order by version.created_at desc, version.id desc;
end;
$$;


ALTER FUNCTION "public"."get_allocation_workspace_versions"("p_allocation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_available_remaining_seats"() RETURNS TABLE("allocation_id" "uuid", "allocation_name" "text", "bus_id" "text", "bus_label" "text", "destination" "text", "departure_time" "text", "boarding_place" "text", "capacity" integer, "remaining_seats" integer, "price" integer, "transfer_account" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_actor_id uuid := auth.uid();
  v_deadline_at timestamptz;
  v_sales_setting jsonb := '{"enabled": true, "hidden_bus_ids": []}'::jsonb;
  v_price integer := 0;
  v_transfer_account text := '';
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.';
  end if;

  select nullif(value ->> 'deadline_at', '')::timestamptz
  into v_deadline_at
  from public.app_settings
  where key = 'first_reservation_deadline';

  select value into v_sales_setting
  from public.app_settings
  where key = 'remaining_seat_sales';

  select greatest(coalesce((value ->> 'price')::integer, 0), 0)
  into v_price
  from public.app_settings
  where key = 'bus_ticket_price';

  select coalesce(value ->> 'account_number', '')
  into v_transfer_account
  from public.app_settings
  where key = 'seoul_district_transfer_account';

  if v_deadline_at is null
    or v_deadline_at > clock_timestamp()
    or not coalesce((v_sales_setting ->> 'enabled')::boolean, true) then
    return;
  end if;

  if exists (
    select 1
    from public.reservations
    where user_id = v_actor_id
      and status <> 'cancelled'
  ) then
    return;
  end if;

  return query
  select
    allocation.id,
    allocation.allocation_name,
    bus ->> 'id',
    bus ->> 'label',
    bus ->> 'destination',
    bus ->> 'departureTime',
    bus ->> 'boardingPlace',
    (bus ->> 'capacity')::integer,
    (bus ->> 'capacity')::integer - (
      select count(*)::integer
      from jsonb_array_elements(coalesce(allocation.allocation_data -> 'passengers', '[]'::jsonb)) passenger
      where passenger ->> 'busId' = bus ->> 'id'
    ),
    v_price,
    v_transfer_account
  from public.bus_allocations allocation
  cross join lateral jsonb_array_elements(coalesce(allocation.allocation_data -> 'buses', '[]'::jsonb)) bus
  where allocation.allocation_data ->> 'status' = 'confirmed'
    and coalesce(bus ->> 'capacity', '') ~ '^[1-9][0-9]*$'
    and not (coalesce(v_sales_setting -> 'hidden_bus_ids', '[]'::jsonb) ? (bus ->> 'id'))
    and (bus ->> 'capacity')::integer > (
      select count(*)::integer
      from jsonb_array_elements(coalesce(allocation.allocation_data -> 'passengers', '[]'::jsonb)) passenger
      where passenger ->> 'busId' = bus ->> 'id'
    )
  order by bus ->> 'destination', bus ->> 'label';
end;
$_$;


ALTER FUNCTION "public"."get_available_remaining_seats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_boarding_exception_archive_snapshot"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_is_global_admin boolean := false;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding administrators can view boarding exception archives';
  end if;

  v_is_global_admin := public.is_global_admin();

  return jsonb_build_object(
    'archivedKeys',
    (
      select coalesce(jsonb_agg(archive.record_key), '[]'::jsonb)
      from public.boarding_exception_archives archive
      where v_is_global_admin
        or public.can_manage_boarding_bus(
          archive.allocation_id,
          archive.record_data ->> 'busId'
        )
    ),
    'records',
    case
      when v_is_global_admin then (
        select coalesce(
          jsonb_agg(
            archive.record_data || jsonb_build_object(
              'archivedAt', archive.archived_at,
              'archivedByName', coalesce(actor.name, '전체 관리자')
            )
            order by archive.archived_at desc
          ),
          '[]'::jsonb
        )
        from public.boarding_exception_archives archive
        left join public.profiles actor on actor.id = archive.archived_by
      )
      else '[]'::jsonb
    end
  );
end;
$$;


ALTER FUNCTION "public"."get_boarding_exception_archive_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_boarding_exception_reason_edit_snapshot"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding administrators can view boarding exception reason edits';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'recordKey', edit.record_key,
          'reason', edit.reason,
          'updatedAt', edit.updated_at,
          'updatedByName', coalesce(actor.name, '탑승 관리자')
        )
        order by edit.updated_at desc
      )
      from public.boarding_exception_reason_edits edit
      left join public.profiles actor on actor.id = edit.updated_by
      where public.can_manage_boarding_bus(edit.allocation_id, edit.bus_id)
    ),
    '[]'::jsonb
  );
end;
$$;


ALTER FUNCTION "public"."get_boarding_exception_reason_edit_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_boarding_management_snapshot"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_allocation public.bus_allocations%rowtype;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can view boarding management.';
  end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';
  if not found then return null; end if;

  return jsonb_build_object(
    'allocationId', v_allocation.id,
    'allocationName', v_allocation.allocation_name,
    'buses', (
      select coalesce(jsonb_agg(
        bus || jsonb_build_object(
          'departedAt', departure.departed_at,
          'departedBy', departure.departed_by,
          'checkInCode', case when code.expires_at > clock_timestamp() then code.check_in_code else null end,
          'checkInCodeExpiresAt', code.expires_at
        ) order by bus ->> 'label'
      ), '[]'::jsonb)
      from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
      left join public.boarding_bus_departures departure
        on departure.allocation_id = v_allocation.id
       and departure.bus_id = bus ->> 'id'
       and departure.cancelled_at is null
      left join public.boarding_check_in_codes code
        on code.allocation_id = v_allocation.id
       and code.bus_id = bus ->> 'id'
      where public.can_manage_boarding_bus(v_allocation.id, bus ->> 'id')
    ),
    'passengers', (
      select coalesce(jsonb_agg(passenger order by passenger ->> 'busNumber', passenger ->> 'seatNumber'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'reservationId', reservation.id,
          'passengerKind', 'reservation',
          'busId', public.get_confirmed_ticket_bus_id(reservation.id, reservation.confirmed_ticket),
          'name', reservation.name,
          'phone', reservation.phone,
          'district', reservation.district,
          'team', reservation.team,
          'campus', reservation.campus,
          'busNumber', reservation.confirmed_ticket ->> 'busNumber',
          'seatNumber', reservation.confirmed_ticket ->> 'seatNumber',
          'stationPreferences', (
            select coalesce(jsonb_agg(preference_name order by preference_position), '[]'::jsonb)
            from (
              select
                coalesce(
                  nullif(preference.value #>> '{station,name}', ''),
                  nullif(preference.value ->> 'name', ''),
                  nullif(preference.value #>> '{}', '')
                ) as preference_name,
                preference.position as preference_position
              from jsonb_array_elements(
                case
                  when jsonb_typeof(reservation.station_preferences) = 'array' then
                    case
                      when jsonb_array_length(reservation.station_preferences) > 0
                        then reservation.station_preferences
                      when jsonb_typeof(reservation.data -> 'stationPreferences') = 'array'
                        then reservation.data -> 'stationPreferences'
                      else '[]'::jsonb
                    end
                  when jsonb_typeof(reservation.data -> 'stationPreferences') = 'array'
                    then reservation.data -> 'stationPreferences'
                  else '[]'::jsonb
                end
              ) with ordinality as preference(value, position)
            ) normalized_preferences
            where nullif(preference_name, '') is not null
          ),
          'assignedDestination', coalesce(
            nullif(reservation.confirmed_ticket ->> 'dropoffStation', ''),
            (
              select bus ->> 'destination'
              from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
              where bus ->> 'id' = public.get_confirmed_ticket_bus_id(
                reservation.id,
                reservation.confirmed_ticket
              )
              limit 1
            )
          ),
          'boardingStatus', reservation.boarding_status,
          'boardingNote', reservation.boarding_note,
          'boardingNoteUpdatedAt', reservation.boarding_note_updated_at,
          'boardingNoteUpdatedByName', note_actor.name,
          'updatedAt', reservation.boarding_status_updated_at,
          'updatedByName', status_actor.name
        ) passenger
        from public.reservations reservation
        left join public.profiles status_actor on status_actor.id = reservation.boarding_status_updated_by
        left join public.profiles note_actor on note_actor.id = reservation.boarding_note_updated_by
        where reservation.status = 'confirmed'
          and reservation.confirmed_ticket is not null
          and public.can_manage_boarding_reservation(reservation.id)
        union all
        select jsonb_build_object(
          'reservationId', walk_in.id,
          'passengerKind', 'walk_in',
          'busId', walk_in.bus_id,
          'name', walk_in.name,
          'phone', walk_in.phone,
          'district', '',
          'team', '',
          'campus', walk_in.campus,
          'busNumber', bus ->> 'label',
          'seatNumber', walk_in.seat_number::text,
          'stationPreferences', '[]'::jsonb,
          'assignedDestination', bus ->> 'destination',
          'boardingStatus', walk_in.boarding_status,
          'boardingNote', walk_in.boarding_note,
          'fieldExceptionReason', walk_in.reason,
          'updatedAt', walk_in.boarding_status_updated_at
        ) passenger
        from public.boarding_walk_in_passengers walk_in
        join lateral jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
          on bus ->> 'id' = walk_in.bus_id
        where walk_in.allocation_id = v_allocation.id
          and public.can_manage_boarding_bus(v_allocation.id, walk_in.bus_id)
      ) scoped
    ),
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', event.id,
        'reservationId', event.reservation_id,
        'fromStatus', event.from_status,
        'toStatus', event.to_status,
        'actorType', case
          when event.note in ('탑승 확인', 'passenger_check_in_code') then 'passenger'
          when event.note = 'bus_departed_auto_no_show' or event.note like '호차 출발%' then 'automatic'
          else 'boarding_manager'
        end,
        'actorName', actor.name,
        'createdAt', event.created_at,
        'note', event.note
      ) order by event.created_at desc), '[]'::jsonb)
      from public.boarding_status_events event
      left join public.profiles actor on actor.id = event.actor_id
      join public.reservations reservation on reservation.id = event.reservation_id
      where reservation.status = 'confirmed'
        and public.can_manage_boarding_reservation(reservation.id)
        and event.created_at >= coalesce(
          nullif(reservation.confirmed_ticket ->> 'confirmedAt', '')::timestamptz,
          '-infinity'::timestamptz
        )
    )
  );
end;
$$;


ALTER FUNCTION "public"."get_boarding_management_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_boarding_manager_assignment_options"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_allocation public.bus_allocations%rowtype;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can manage boarding manager assignments.';
  end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';

  if not found then
    return jsonb_build_object(
      'allocationId', null,
      'allocationName', null,
      'buses', '[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'allocationId', v_allocation.id,
    'allocationName', v_allocation.allocation_name,
    'buses', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', bus ->> 'id',
        'label', bus ->> 'label',
        'destination', bus ->> 'destination'
      ) order by bus ->> 'label'), '[]'::jsonb)
      from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
    )
  );
end;
$$;


ALTER FUNCTION "public"."get_boarding_manager_assignment_options"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_boarding_manager_users"("p_search" "text" DEFAULT ''::"text") RETURNS TABLE("user_id" "uuid", "name" "text", "email" "text", "phone" "text", "district" "text", "team" "text", "campus" "text", "is_boarding_manager" boolean, "assigned_bus_ids" "text"[])
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can manage boarding managers.';
  end if;

  return query
  select
    profile.id,
    coalesce(profile.name, '이름 없음'),
    profile.email,
    profile.phone,
    profile.district,
    profile.team,
    profile.campus,
    exists (
      select 1 from public.admin_roles role
      where role.user_id = profile.id and role.role = 'boarding_manager'
    ),
    coalesce((
      select array_agg(assignment.bus_id order by assignment.bus_id)
      from public.boarding_manager_bus_assignments assignment
      join public.bus_allocations allocation on allocation.id = assignment.allocation_id
      where assignment.manager_user_id = profile.id
        and allocation.allocation_data ->> 'status' = 'confirmed'
    ), array[]::text[])
  from public.profiles profile
  where nullif(trim(p_search), '') is null
    or concat_ws(' ', profile.name, profile.email, profile.phone, profile.campus)
      ilike '%' || trim(p_search) || '%'
  order by
    exists (
      select 1 from public.admin_roles role
      where role.user_id = profile.id and role.role = 'boarding_manager'
    ) desc,
    profile.name asc nulls last
  limit 200;
end;
$$;


ALTER FUNCTION "public"."get_boarding_manager_users"("p_search" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_boarding_move_request_snapshot"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_allocation public.bus_allocations%rowtype;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can view passenger move requests.';
  end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';
  if not found then return jsonb_build_object('targetBuses', '[]'::jsonb, 'requests', '[]'::jsonb); end if;

  return jsonb_build_object(
    'targetBuses', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', bus ->> 'id',
        'label', bus ->> 'label',
        'destination', bus ->> 'destination',
        'capacity', (bus ->> 'capacity')::integer,
        'remainingCapacity', greatest(
          0,
          (bus ->> 'capacity')::integer
          - (
              select count(*) from jsonb_array_elements(v_allocation.allocation_data -> 'passengers') passenger
              where passenger ->> 'busId' = bus ->> 'id'
            )
          - (
              select count(*) from public.boarding_walk_in_passengers walk_in
              where walk_in.allocation_id = v_allocation.id and walk_in.bus_id = bus ->> 'id'
            )
        ),
        'departedAt', departure.departed_at,
        'canManage', public.can_manage_boarding_bus(v_allocation.id, bus ->> 'id')
      ) order by bus ->> 'label'), '[]'::jsonb)
      from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
      left join public.boarding_bus_departures departure
        on departure.allocation_id = v_allocation.id
       and departure.bus_id = bus ->> 'id'
       and departure.cancelled_at is null
    ),
    'requests', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', request.id,
        'reservationId', request.reservation_id,
        'passengerName', reservation.name,
        'passengerPhone', reservation.phone,
        'sourceBusId', request.source_bus_id,
        'sourceBusLabel', source_bus ->> 'label',
        'targetBusId', request.target_bus_id,
        'targetBusLabel', target_bus ->> 'label',
        'reason', request.reason,
        'status', request.status,
        'requestedByName', requester.name,
        'requestedAt', request.requested_at,
        'respondedByName', responder.name,
        'respondedAt', request.responded_at,
        'responseReason', request.response_reason,
        'canRespond', request.status = 'pending'
          and public.can_manage_boarding_bus(request.allocation_id, request.target_bus_id),
        'isMine', request.requested_by = auth.uid()
      ) order by (request.status = 'pending') desc, request.requested_at desc), '[]'::jsonb)
      from public.boarding_move_requests request
      join public.reservations reservation on reservation.id = request.reservation_id
      join lateral jsonb_array_elements(v_allocation.allocation_data -> 'buses') source_bus
        on source_bus ->> 'id' = request.source_bus_id
      join lateral jsonb_array_elements(v_allocation.allocation_data -> 'buses') target_bus
        on target_bus ->> 'id' = request.target_bus_id
      left join public.profiles requester on requester.id = request.requested_by
      left join public.profiles responder on responder.id = request.responded_by
      where request.allocation_id = v_allocation.id
        and (
          request.requested_by = auth.uid()
          or public.can_manage_boarding_bus(request.allocation_id, request.target_bus_id)
        )
      limit 50
    )
  );
end;
$$;


ALTER FUNCTION "public"."get_boarding_move_request_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_bus_ticket_price"() RETURNS integer
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (
      select (value ->> 'price')::integer
      from app_settings
      where key = 'bus_ticket_price'
    ),
    0
  );
$$;


ALTER FUNCTION "public"."get_bus_ticket_price"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_campus_admin_manage_users_page"("p_district" "text" DEFAULT NULL::"text", "p_team" "text" DEFAULT NULL::"text", "p_campus" "text" DEFAULT NULL::"text", "p_query" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0) RETURNS TABLE("user_id" "uuid", "email" "text", "name" "text", "phone" "text", "district" "text", "team" "text", "campus" "text", "role" "text", "admin_role_id" "uuid", "managed_campuses" "jsonb", "total_count" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can manage campus administrators.';
  end if;

  return query
  with candidate_ids as (
    select profile.id
    from public.profiles profile
    where nullif(trim(p_query), '') is null
      or concat_ws(
        ' ',
        profile.name,
        profile.email,
        profile.phone,
        profile.district,
        profile.team,
        profile.campus
      ) ilike '%' || trim(p_query) || '%'

    union

    select admin_role.user_id
    from public.admin_roles admin_role
    where admin_role.role = 'campus_admin'
      and (nullif(trim(p_district), '') is null or admin_role.district = trim(p_district))
      and (nullif(trim(p_team), '') is null or admin_role.team = trim(p_team))
      and (nullif(trim(p_campus), '') is null or admin_role.campus = trim(p_campus))
  ),
  candidates as (
    select
      profile.id,
      profile.email,
      profile.name,
      profile.phone,
      profile.district,
      profile.team,
      profile.campus,
      case
        when exists (
          select 1
          from public.admin_roles matching_role
          where matching_role.user_id = profile.id
            and matching_role.role = 'campus_admin'
            and (nullif(trim(p_district), '') is null or matching_role.district = trim(p_district))
            and (nullif(trim(p_team), '') is null or matching_role.team = trim(p_team))
            and (nullif(trim(p_campus), '') is null or matching_role.campus = trim(p_campus))
        ) then 0
        else 1
      end as campus_admin_priority,
      count(*) over () as total_count
    from public.profiles profile
    join candidate_ids candidate on candidate.id = profile.id
    order by campus_admin_priority, profile.name asc nulls last, profile.email asc nulls last, profile.id
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select
    candidate.id as user_id,
    candidate.email,
    coalesce(candidate.name, '이름 없음') as name,
    candidate.phone,
    candidate.district,
    candidate.team,
    candidate.campus,
    selected_role.role,
    selected_role.id as admin_role_id,
    coalesce(managed_roles.scopes, '[]'::jsonb) as managed_campuses,
    candidate.total_count
  from candidates candidate
  left join lateral (
    select admin_role.id, admin_role.role, admin_role.district, admin_role.team, admin_role.campus
    from public.admin_roles admin_role
    where admin_role.user_id = candidate.id
    order by
      case
        when admin_role.role = 'global_admin' then 0
        when admin_role.role = 'campus_admin'
          and admin_role.district is not distinct from nullif(trim(p_district), '')
          and admin_role.team is not distinct from nullif(trim(p_team), '')
          and admin_role.campus is not distinct from nullif(trim(p_campus), '')
          then 1
        else 2
      end,
      admin_role.updated_at desc nulls last,
      admin_role.created_at desc nulls last
    limit 1
  ) selected_role on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', admin_role.id,
        'district', admin_role.district,
        'team', admin_role.team,
        'campus', admin_role.campus
      )
      order by admin_role.district, admin_role.team, admin_role.campus
    ) as scopes
    from public.admin_roles admin_role
    where admin_role.user_id = candidate.id
      and admin_role.role = 'campus_admin'
  ) managed_roles on true
  order by
    candidate.campus_admin_priority,
    candidate.name asc nulls last,
    candidate.email asc nulls last,
    candidate.id;
end;
$$;


ALTER FUNCTION "public"."get_campus_admin_manage_users_page"("p_district" "text", "p_team" "text", "p_campus" "text", "p_query" "text", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_campus_payment_account"("p_campus_id" "uuid") RETURNS TABLE("campus_id" "uuid", "bank_name" "text", "account_number" "text", "account_holder" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  return query
  select account.campus_id, account.bank_name, account.account_number,
    account.account_holder
  from public.campus_payment_accounts account
  join public.campuses campus on campus.id = account.campus_id
  where account.campus_id = p_campus_id
    and campus.is_active = true;
end;
$$;


ALTER FUNCTION "public"."get_campus_payment_account"("p_campus_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_campus_request_summary"() RETURNS TABLE("total" bigint, "notices" bigint, "open" bigint, "in_progress" bigint, "resolved" bigint, "on_hold" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select
    count(*) filter (where not request.is_global_notice) as total,
    count(*) filter (where request.is_global_notice) as notices,
    count(*) filter (
      where not request.is_global_notice and request.status = 'open'
    ) as open,
    count(*) filter (
      where not request.is_global_notice and request.status = 'in_progress'
    ) as in_progress,
    count(*) filter (
      where not request.is_global_notice and request.status = 'resolved'
    ) as resolved,
    count(*) filter (
      where not request.is_global_notice and request.status = 'on_hold'
    ) as on_hold
  from public.campus_requests request;
$$;


ALTER FUNCTION "public"."get_campus_request_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_confirmed_allocation_summaries"() RETURNS TABLE("id" "uuid", "allocation_name" "text", "total_cost" integer, "total_capacity" integer, "created_at" timestamp with time zone, "bus_count" integer, "passenger_count" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can view allocation summaries.';
  end if;

  return query
  select
    allocation.id,
    allocation.allocation_name,
    allocation.total_cost,
    allocation.total_capacity,
    coalesce(
      nullif(allocation.allocation_data ->> 'confirmedAt', '')::timestamptz,
      allocation.created_at
    ) as created_at,
    case
      when jsonb_typeof(allocation.allocation_data -> 'buses') = 'array'
        then jsonb_array_length(allocation.allocation_data -> 'buses')
      else 0
    end as bus_count,
    case
      when jsonb_typeof(allocation.allocation_data -> 'passengers') = 'array'
        then jsonb_array_length(allocation.allocation_data -> 'passengers')
      else 0
    end as passenger_count
  from public.bus_allocations allocation
  where allocation.allocation_data ->> 'status' = 'confirmed'
  order by coalesce(
    nullif(allocation.allocation_data ->> 'confirmedAt', '')::timestamptz,
    allocation.created_at
  ) desc;
end;
$$;


ALTER FUNCTION "public"."get_confirmed_allocation_summaries"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_confirmed_ticket_bus_id"("p_reservation_id" "uuid", "p_ticket" "jsonb") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    nullif(btrim(p_ticket ->> 'busId'), ''),
    (
      select nullif(btrim(passenger ->> 'busId'), '')
      from public.bus_allocations allocation
      cross join lateral jsonb_array_elements(allocation.allocation_data -> 'passengers')
        passenger
      where allocation.allocation_data ->> 'status' = 'confirmed'
        and passenger ->> 'reservationId' = p_reservation_id::text
      limit 1
    ),
    (
      select nullif(btrim(bus ->> 'id'), '')
      from public.bus_allocations allocation
      cross join lateral jsonb_array_elements(allocation.allocation_data -> 'buses') bus
      where allocation.allocation_data ->> 'status' = 'confirmed'
        and btrim(bus ->> 'label') = btrim(p_ticket ->> 'busNumber')
      limit 1
    )
  );
$$;


ALTER FUNCTION "public"."get_confirmed_ticket_bus_id"("p_reservation_id" "uuid", "p_ticket" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_deletable_user_count"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
begin
  if not exists (
    select 1 from public.admin_roles
    where user_id = auth.uid() and role = 'global_admin'
  ) then
    raise exception 'Only global admins can view deletable user count.';
  end if;

  return (select count(*)::integer from auth.users where id <> auth.uid());
end;
$$;


ALTER FUNCTION "public"."get_deletable_user_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_deployment_compatibility_version"() RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select 186;
$$;


ALTER FUNCTION "public"."get_deployment_compatibility_version"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_deployment_compatibility_version"() IS 'Returns the minimum frontend-compatible database deployment version without exposing schema details.';



CREATE OR REPLACE FUNCTION "public"."get_destination_stats"() RETURNS TABLE("station_name" "text", "rank1" bigint, "rank2" bigint, "total" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can view destination statistics.';
  end if;

  return query
  select
    demand.station_name,
    demand.rank1,
    demand.rank2,
    demand.total
  from (
    select
      preference -> 'station' ->> 'name' as station_name,
      count(*) filter (where (preference ->> 'rank')::integer = 1) as rank1,
      count(*) filter (where (preference ->> 'rank')::integer = 2) as rank2,
      count(*) as total
    from public.reservations
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(reservations.station_preferences) = 'array'
          then reservations.station_preferences
        else '[]'::jsonb
      end
    ) as preference
    where reservations.status is distinct from 'cancelled'
      and nullif(trim(preference -> 'station' ->> 'name'), '') is not null
      and (preference ->> 'rank') ~ '^[12]$'
    group by preference -> 'station' ->> 'name'
  ) as demand
  order by
    demand.rank1 desc,
    demand.rank2 desc,
    demand.station_name;
end;
$_$;


ALTER FUNCTION "public"."get_destination_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_draft_allocation_summaries"() RETURNS TABLE("id" "uuid", "allocation_name" "text", "total_cost" integer, "total_capacity" integer, "created_at" timestamp with time zone, "bus_count" integer, "passenger_count" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can view allocation summaries.';
  end if;

  return query
  select
    allocation.id,
    allocation.allocation_name,
    allocation.total_cost,
    allocation.total_capacity,
    allocation.created_at,
    case
      when jsonb_typeof(allocation.allocation_data -> 'buses') = 'array'
        then jsonb_array_length(allocation.allocation_data -> 'buses')
      else 0
    end as bus_count,
    case
      when jsonb_typeof(allocation.allocation_data -> 'passengers') = 'array'
        then jsonb_array_length(allocation.allocation_data -> 'passengers')
      else 0
    end as passenger_count
  from public.bus_allocations allocation
  where allocation.allocation_data ->> 'status' = 'draft'
  order by allocation.created_at desc;
end;
$$;


ALTER FUNCTION "public"."get_draft_allocation_summaries"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_global_campus_notices"() RETURNS SETOF "public"."campus_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (
    select 1 from public.admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role in ('global_admin', 'campus_admin')
  ) then
    raise exception 'Only admins can view campus notices.';
  end if;

  return query
  select notice.*
  from public.campus_requests notice
  where notice.is_global_notice = true
    and (
      public.is_global_admin()
      or (
        notice.is_archived = false
        and exists (
          select 1
          from public.campus_notice_targets target
          join public.admin_roles role
            on role.user_id = auth.uid()
           and role.role = 'campus_admin'
           and role.district = target.district
           and role.team = target.team
           and role.campus = target.campus
          where target.notice_id = notice.id
        )
      )
    )
  order by notice.created_at desc;
end;
$$;


ALTER FUNCTION "public"."get_global_campus_notices"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_global_campus_transfer_stats"() RETURNS TABLE("id" "uuid", "district" "text", "team" "text", "campus" "text", "campus_admin_name" "text", "campus_admin_phone" "text", "current_total_people" integer, "current_paid_people" integer, "current_total_amount" integer, "reported_total_people" integer, "reported_paid_people" integer, "reported_total_amount" integer, "actual_confirmed_amount" integer, "additional_amount_due" integer, "has_additional_settlement" boolean, "status" "text", "sent_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with active_campuses as (
    select distinct
      campus_options.district,
      campus_options.team,
      campus_options.campus
    from campus_options
  ),
  current_stats as (
    select
      reservations.district,
      reservations.team,
      reservations.campus,
      count(reservations.id)::integer as current_total_people,
      count(payments.id) filter (where payments.status = 'completed')::integer
        as current_paid_people,
      (
        count(reservations.id) * get_bus_ticket_price()
      )::integer as current_total_amount
    from reservations
    left join payments on payments.reservation_id = reservations.id
    where coalesce(reservations.status, 'requested') <> 'cancelled'
    group by reservations.district, reservations.team, reservations.campus
  ),
  campus_admins as (
    select distinct on (admin_roles.district, admin_roles.team, admin_roles.campus)
      admin_roles.district,
      admin_roles.team,
      admin_roles.campus,
      profiles.name as campus_admin_name,
      profiles.phone as campus_admin_phone
    from admin_roles
    left join profiles on profiles.id = admin_roles.user_id
    where admin_roles.role = 'campus_admin'
    order by
      admin_roles.district,
      admin_roles.team,
      admin_roles.campus,
      admin_roles.updated_at desc nulls last,
      admin_roles.created_at desc nulls last
  )
  select
    campus_transfers.id,
    active_campuses.district,
    active_campuses.team,
    active_campuses.campus,
    campus_admins.campus_admin_name,
    campus_admins.campus_admin_phone,
    coalesce(current_stats.current_total_people, 0) as current_total_people,
    coalesce(current_stats.current_paid_people, 0) as current_paid_people,
    coalesce(current_stats.current_total_amount, 0) as current_total_amount,
    coalesce(campus_transfers.total_people, 0) as reported_total_people,
    coalesce(campus_transfers.paid_people, 0) as reported_paid_people,
    coalesce(campus_transfers.total_amount, 0) as reported_total_amount,
    campus_transfers.actual_confirmed_amount,
    greatest(
      coalesce(current_stats.current_total_amount, 0)
        - coalesce(campus_transfers.total_amount, 0),
      0
    )::integer as additional_amount_due,
    (
      campus_transfers.id is not null
      and campus_transfers.status in ('sent', 'confirmed')
      and (
        coalesce(current_stats.current_total_people, 0)
          > coalesce(campus_transfers.total_people, 0)
        or coalesce(current_stats.current_paid_people, 0)
          > coalesce(campus_transfers.paid_people, 0)
        or coalesce(current_stats.current_total_amount, 0)
          > coalesce(campus_transfers.total_amount, 0)
      )
    ) as has_additional_settlement,
    coalesce(campus_transfers.status, 'pending') as status,
    campus_transfers.sent_at
  from active_campuses
  left join current_stats
    on current_stats.district = active_campuses.district
   and current_stats.team = active_campuses.team
   and current_stats.campus = active_campuses.campus
  left join campus_transfers
    on campus_transfers.district = active_campuses.district
   and campus_transfers.team = active_campuses.team
   and campus_transfers.campus = active_campuses.campus
  left join campus_admins
    on campus_admins.district = active_campuses.district
   and campus_admins.team = active_campuses.team
   and campus_admins.campus = active_campuses.campus
  where exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
  order by active_campuses.district, active_campuses.team, active_campuses.campus;
$$;


ALTER FUNCTION "public"."get_global_campus_transfer_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_manual_boarding_exception_records"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding administrators can view manual boarding exception records';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', record.id,
          'allocationId', record.allocation_id,
          'busId', record.bus_id,
          'reservationId', record.reservation_id,
          'passengerName', record.passenger_name,
          'passengerPhone', record.passenger_phone,
          'campus', record.campus,
          'seatNumber', record.seat_number,
          'reason', record.reason,
          'createdAt', record.created_at,
          'createdByName', coalesce(actor.name, '탑승 관리자')
        )
        order by record.created_at desc
      )
      from public.manual_boarding_exception_records record
      left join public.profiles actor on actor.id = record.created_by
      where public.can_manage_boarding_bus(record.allocation_id, record.bus_id)
    ),
    '[]'::jsonb
  );
end;
$$;


ALTER FUNCTION "public"."get_manual_boarding_exception_records"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_admin_roles"() RETURNS SETOF "public"."admin_roles"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select role.*
  from public.admin_roles role
  where role.user_id = auth.uid()
  order by role.role desc, role.updated_at desc nulls last, role.created_at desc nulls last;
$$;


ALTER FUNCTION "public"."get_my_admin_roles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_personal_inquiries"() RETURNS SETOF "public"."personal_inquiries"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select inquiry.*
  from public.personal_inquiries inquiry
  where inquiry.user_id = auth.uid()
  order by inquiry.created_at desc;
$$;


ALTER FUNCTION "public"."get_my_personal_inquiries"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_personal_inquiry_messages"() RETURNS SETOF "public"."personal_inquiry_messages"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select message.*
  from public.personal_inquiry_messages message
  join public.personal_inquiries inquiry on inquiry.id = message.inquiry_id
  where inquiry.user_id = auth.uid()
  order by message.created_at, message.id;
$$;


ALTER FUNCTION "public"."get_my_personal_inquiry_messages"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_operation_closeout"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_value jsonb;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can view operation closeout.';
  end if;

  select value into v_value
  from public.app_settings
  where key = 'operation_closeout';

  return coalesce(v_value, '{"closed":false}'::jsonb);
end;
$$;


ALTER FUNCTION "public"."get_operation_closeout"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_payment_scope_lock_key"("p_campus_id" "uuid", "p_district" "text", "p_team" "text", "p_campus" "text") RETURNS bigint
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  select hashtextextended(
    'campus-payment:' || coalesce(
      p_campus_id::text,
      coalesce(p_district, '') || '|' || coalesce(p_team, '') || '|' || coalesce(p_campus, '')
    ),
    0
  );
$$;


ALTER FUNCTION "public"."get_payment_scope_lock_key"("p_campus_id" "uuid", "p_district" "text", "p_team" "text", "p_campus" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_personal_inquiries_as_global_admin"() RETURNS TABLE("id" "uuid", "user_id" "uuid", "user_name" "text", "user_email" "text", "user_phone" "text", "category" "text", "status" "text", "title" "text", "content" "text", "admin_response" "text", "handled_by" "uuid", "handled_at" timestamp with time zone, "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."get_personal_inquiries_as_global_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_personal_inquiries_page_as_global_admin"("p_page" integer DEFAULT 1, "p_page_size" integer DEFAULT 15, "p_status" "text" DEFAULT 'all'::"text", "p_search" "text" DEFAULT ''::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."get_personal_inquiries_page_as_global_admin"("p_page" integer, "p_page_size" integer, "p_status" "text", "p_search" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personal_inquiry_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inquiry_id" "uuid" NOT NULL,
    "message_id" "uuid",
    "actor_id" "uuid",
    "action" "text" NOT NULL,
    "before_data" "jsonb",
    "after_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    CONSTRAINT "personal_inquiry_audit_logs_action_check" CHECK (("action" = ANY (ARRAY['status_changed'::"text", 'response_changed'::"text", 'message_created'::"text"])))
);


ALTER TABLE "public"."personal_inquiry_audit_logs" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_personal_inquiry_audit_logs"("p_inquiry_id" "uuid") RETURNS SETOF "public"."personal_inquiry_audit_logs"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."get_personal_inquiry_audit_logs"("p_inquiry_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_contact_info"() RETURNS TABLE("email" "text", "phone" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    coalesce(value ->> 'email', ''),
    coalesce(value ->> 'phone', '')
  from public.app_settings
  where key = 'public_contact_info'
  union all
  select '', ''
  where not exists (
    select 1 from public.app_settings where key = 'public_contact_info'
  )
  limit 1;
$$;


ALTER FUNCTION "public"."get_public_contact_info"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_recent_allocation_optimization_jobs"("p_limit" integer DEFAULT 20) RETURNS TABLE("id" "uuid", "optimization_scope" "text", "source_job_id" "uuid", "resume_from_job_id" "uuid", "detailed_settings" "jsonb", "status" "text", "requested_at" timestamp with time zone, "started_at" timestamp with time zone, "completed_at" timestamp with time zone, "progress" integer, "current_phase" "text", "elapsed_seconds" integer, "best_known_bus_count" integer, "proven_bus_count" integer, "result_reused" boolean, "error_message" "text", "reservations_changed" boolean, "snapshot_active_reservation_count" integer, "current_active_reservation_count" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_current_state jsonb;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can view allocation optimization jobs.';
  end if;

  v_current_state := public.get_active_reservation_optimization_state();

  return query
  select job.id, job.optimization_scope, job.source_job_id, job.resume_from_job_id,
    job.detailed_settings, job.status, job.requested_at, job.started_at,
    job.completed_at, job.progress, job.current_phase, job.elapsed_seconds,
    job.best_known_bus_count, job.proven_bus_count, job.result_reused,
    job.error_message,
    coalesce(job.input_snapshot ->> 'active_reservations_hash', '')
      <> coalesce(v_current_state ->> 'hash', ''),
    (job.input_snapshot ->> 'active_reservation_count')::integer,
    (v_current_state ->> 'count')::integer
  from public.allocation_optimization_jobs job
  order by job.requested_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;


ALTER FUNCTION "public"."get_recent_allocation_optimization_jobs"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_reusable_allocation_optimization_job"("p_job_id" "uuid", "p_input_hash" "text", "p_input_snapshot" "jsonb", "p_optimization_scope" "text", "p_detailed_settings" "jsonb") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
    'id', reusable.id,
    'result', reusable.result,
    'diagnostics', reusable.diagnostics,
    'best_known_bus_count', reusable.best_known_bus_count,
    'proven_bus_count', reusable.proven_bus_count
  )
  from public.allocation_optimization_jobs reusable
  where public.allocation_optimization_snapshot_is_current(p_input_snapshot)
    and reusable.id <> p_job_id
    and reusable.status = 'OPTIMAL'
    and reusable.input_hash = p_input_hash
    and reusable.input_snapshot = p_input_snapshot
    and reusable.optimization_scope = p_optimization_scope
    and coalesce(reusable.detailed_settings, '{}'::jsonb)
      = coalesce(p_detailed_settings, '{}'::jsonb)
    and jsonb_typeof(reusable.result) = 'object'
  order by reusable.completed_at desc
  limit 1;
$$;


ALTER FUNCTION "public"."get_reusable_allocation_optimization_job"("p_job_id" "uuid", "p_input_hash" "text", "p_input_snapshot" "jsonb", "p_optimization_scope" "text", "p_detailed_settings" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_unread_campus_request_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select distinct request.id
  from public.campus_requests request
  join public.admin_roles role on role.user_id = auth.uid()
  left join public.campus_request_reads read_state
    on read_state.user_id = auth.uid()
   and read_state.request_id = request.id
  where request.is_global_notice = false
    and (
      role.role = 'global_admin'
      or (
        role.role = 'campus_admin'
        and role.district = request.district
        and role.team = request.team
        and role.campus = request.campus
      )
    )
    and exists (
      select 1
      from public.campus_request_messages message
      where message.request_id = request.id
        and message.created_at > coalesce(read_state.read_at, '-infinity'::timestamptz)
        and (
          (role.role = 'global_admin' and message.sender_role = 'campus_admin')
          or (role.role = 'campus_admin' and message.sender_role = 'global_admin')
        )
    );
$$;


ALTER FUNCTION "public"."get_unread_campus_request_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_unread_personal_inquiry_count"() RETURNS integer
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."get_unread_personal_inquiry_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_auth_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_affiliation_type text :=
    case
      when v_metadata ->> 'affiliation_type' = 'external'
        then 'external'
      else 'seoul'
    end;
  v_invitation_codes text[] := array[]::text[];
begin
  insert into public.profiles (
    id, email, name, phone,
    district_id, district, team_id, team, campus_id, campus,
    affiliation_type, coordinator_name, coordinator_phone,
    account_source, updated_at
  )
  values (
    new.id,
    lower(new.email),
    coalesce(
      nullif(v_metadata ->> 'name', ''),
      nullif(v_metadata ->> 'full_name', ''),
      nullif(v_metadata ->> 'user_name', ''),
      ''
    ),
    coalesce(v_metadata ->> 'phone', ''),
    case when v_affiliation_type = 'seoul'
      then nullif(v_metadata ->> 'district_id', '')::uuid end,
    v_metadata ->> 'district',
    case when v_affiliation_type = 'seoul'
      then nullif(v_metadata ->> 'team_id', '')::uuid end,
    case when v_affiliation_type = 'seoul'
      then v_metadata ->> 'team' else '' end,
    case when v_affiliation_type = 'seoul'
      then nullif(v_metadata ->> 'campus_id', '')::uuid end,
    v_metadata ->> 'campus',
    v_affiliation_type,
    case when v_affiliation_type = 'external'
      then v_metadata ->> 'coordinator_name' end,
    case when v_affiliation_type = 'external'
      then v_metadata ->> 'coordinator_phone' end,
    'self_signup',
    now()
  )
  on conflict (id) do update
  set
    email = excluded.email,
    name = excluded.name,
    phone = excluded.phone,
    district_id = excluded.district_id,
    district = excluded.district,
    team_id = excluded.team_id,
    team = excluded.team,
    campus_id = excluded.campus_id,
    campus = excluded.campus,
    affiliation_type = excluded.affiliation_type,
    coordinator_name = excluded.coordinator_name,
    coordinator_phone = excluded.coordinator_phone,
    updated_at = now();

  if jsonb_typeof(v_metadata -> 'invitation_codes') = 'array' then
    select coalesce(array_agg(value), array[]::text[])
    into v_invitation_codes
    from jsonb_array_elements_text(v_metadata -> 'invitation_codes') value;
  end if;

  if cardinality(v_invitation_codes) > 0 then
    perform public.redeem_admin_invitation_codes_for_user(
      new.id,
      v_invitation_codes
    );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_auth_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_admin_permission"("p_required_role" "text", "p_district" "text" DEFAULT NULL::"text", "p_team" "text" DEFAULT NULL::"text", "p_campus" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.admin_roles admin_role
    where admin_role.user_id = auth.uid()
      and (
        admin_role.role = 'global_admin'
        or (
          admin_role.role = p_required_role
          and (p_district is null or admin_role.district = p_district)
          and (p_team is null or admin_role.team = p_team)
          and (p_campus is null or admin_role.campus = p_campus)
        )
      )
  );
$$;


ALTER FUNCTION "public"."has_admin_permission"("p_required_role" "text", "p_district" "text", "p_team" "text", "p_campus" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_boarding_manager"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.has_admin_permission('boarding_manager');
$$;


ALTER FUNCTION "public"."is_boarding_manager"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_campus_admin_for_scope"("p_district" "text", "p_team" "text", "p_campus" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.has_admin_permission(
    'campus_admin',
    p_district,
    p_team,
    p_campus
  );
$$;


ALTER FUNCTION "public"."is_campus_admin_for_scope"("p_district" "text", "p_team" "text", "p_campus" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_global_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.has_admin_permission('global_admin');
$$;


ALTER FUNCTION "public"."is_global_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_initial_campus_request_message"("p_message_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.campus_request_messages target
    where target.id = p_message_id
      and target.id = (
        select first_message.id
        from public.campus_request_messages first_message
        where first_message.request_id = target.request_id
        order by first_message.created_at, first_message.id
        limit 1
      )
  );
$$;


ALTER FUNCTION "public"."is_initial_campus_request_message"("p_message_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lock_allocation_optimization_job_creation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.assert_allocation_planning_unlocked();
  return new;
end;
$$;


ALTER FUNCTION "public"."lock_allocation_optimization_job_creation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lock_allocation_planning_writes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if current_setting('app.allocation_confirmation_write', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if exists (
    select 1 from public.bus_allocations
    where allocation_data ->> 'status' = 'confirmed'
  ) then
    if tg_op = 'UPDATE' and old.allocation_data ->> 'status' = 'confirmed' then
      return new;
    end if;
    raise exception 'Cancel the confirmed allocation before using allocation planning.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."lock_allocation_planning_writes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."manage_personal_reservation_status"("p_reservation_id" "uuid", "p_next_status" "text", "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_before public.reservations%rowtype;
  v_payment public.payments%rowtype;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can manage personal reservations.';
  end if;
  if p_next_status not in ('requested', 'cancelled') then
    raise exception 'Invalid reservation status.';
  end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'A reason is required.'; end if;

  select * into v_before from public.reservations where id = p_reservation_id for update;
  if not found then raise exception 'Reservation not found.'; end if;
  select * into v_payment from public.payments where reservation_id = p_reservation_id for update;

  perform public.update_personal_ticket_as_admin(p_reservation_id, p_next_status, null);

  if p_next_status = 'cancelled' and v_payment.status = 'completed' then
    update public.payments
    set status = 'refund_required', notes = btrim(p_reason), updated_at = clock_timestamp()
    where id = v_payment.id;
  end if;

  insert into public.personal_user_action_logs (
    target_user_id, reservation_id, actor_id, action, reason,
    before_data, after_data, reversible
  )
  select
    v_before.user_id, v_before.id, auth.uid(),
    case when p_next_status = 'cancelled' then 'reservation_cancelled' else 'reservation_restored' end,
    btrim(p_reason),
    jsonb_build_object(
      'reservationStatus', v_before.status,
      'confirmedTicket', v_before.confirmed_ticket,
      'paymentStatus', v_payment.status
    ),
    jsonb_build_object(
      'reservationStatus', reservation.status,
      'confirmedTicket', reservation.confirmed_ticket,
      'paymentStatus', (select status from public.payments where reservation_id = reservation.id)
    ),
    false
  from public.reservations reservation where reservation.id = p_reservation_id;
end;
$$;


ALTER FUNCTION "public"."manage_personal_reservation_status"("p_reservation_id" "uuid", "p_next_status" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."manage_personal_user_payment"("p_reservation_id" "uuid", "p_status" "text", "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_reservation public.reservations%rowtype;
  v_before_status text;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can manage personal payments.'; end if;
  if p_status not in ('pending', 'completed', 'refund_required', 'refunded') then raise exception 'Invalid payment status.'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'A reason is required.'; end if;

  select * into v_reservation from public.reservations where id = p_reservation_id for update;
  if not found then raise exception 'Reservation not found.'; end if;
  select status into v_before_status from public.payments where reservation_id = p_reservation_id for update;

  insert into public.payments (user_id, reservation_id, amount, status, paid_at, verified_by, verified_at, notes)
  values (
    v_reservation.user_id, v_reservation.id, 0, p_status,
    case when p_status = 'completed' then clock_timestamp() end,
    auth.uid(), clock_timestamp(), btrim(p_reason)
  )
  on conflict (reservation_id) where reservation_id is not null do update set
    status = excluded.status,
    paid_at = case when excluded.status = 'completed' then clock_timestamp() else payments.paid_at end,
    verified_by = auth.uid(), verified_at = clock_timestamp(),
    notes = btrim(p_reason), updated_at = clock_timestamp();

  insert into public.personal_user_action_logs (
    target_user_id, reservation_id, actor_id, action, reason,
    before_data, after_data, reversible
  ) values (
    v_reservation.user_id, v_reservation.id, auth.uid(), 'payment_' || p_status, btrim(p_reason),
    jsonb_build_object('paymentStatus', v_before_status),
    jsonb_build_object('paymentStatus', p_status),
    true
  );
end;
$$;


ALTER FUNCTION "public"."manage_personal_user_payment"("p_reservation_id" "uuid", "p_status" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_allocation_job_result_reused"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.event_type = 'JOB_RESULT_REUSED' then
    update public.allocation_optimization_jobs
    set result_reused = true
    where id = new.job_id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."mark_allocation_job_result_reused"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_boarding_bus_departed"("p_bus_id" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_allocation public.bus_allocations%rowtype;
  v_bus jsonb;
  v_departure_id uuid;
  v_unchecked_count integer := 0;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can mark departure.';
  end if;

  select * into v_allocation from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed'
  for update;
  if not found then raise exception 'Confirmed allocation not found.'; end if;
  if not public.can_manage_boarding_bus(v_allocation.id, p_bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;

  select bus into v_bus
  from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
  where bus ->> 'id' = p_bus_id;
  if v_bus is null then raise exception 'Bus not found.'; end if;

  select
    (
      select count(*)
      from public.reservations reservation
      where reservation.status = 'confirmed'
        and reservation.boarding_status = 'unchecked'
        and public.get_confirmed_ticket_bus_id(
          reservation.id,
          reservation.confirmed_ticket
        ) = p_bus_id
    )
    +
    (
      select count(*)
      from public.boarding_walk_in_passengers walk_in
      where walk_in.allocation_id = v_allocation.id
        and walk_in.bus_id = p_bus_id
        and walk_in.boarding_status = 'unchecked'
    )
  into v_unchecked_count;

  if v_unchecked_count > 0 then
    raise exception 'Resolve all unchecked passengers before marking departure.';
  end if;

  insert into public.boarding_bus_departures (
    allocation_id, bus_id, bus_label, departed_at, departed_by
  ) values (
    v_allocation.id, p_bus_id, v_bus ->> 'label', v_now, auth.uid()
  ) returning id into v_departure_id;

  return v_departure_id;
end;
$$;


ALTER FUNCTION "public"."mark_boarding_bus_departed"("p_bus_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_campus_request_read"("p_request_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if not exists (
    select 1
    from public.campus_requests request
    join public.admin_roles role on role.user_id = auth.uid()
    where request.id = p_request_id
      and (
        role.role = 'global_admin'
        or (
          role.role = 'campus_admin'
          and role.district = request.district
          and role.team = request.team
          and role.campus = request.campus
        )
      )
  ) then
    raise exception 'Campus request not found or inaccessible.';
  end if;

  insert into public.campus_request_reads (user_id, request_id, read_at)
  values (auth.uid(), p_request_id, clock_timestamp())
  on conflict (user_id, request_id)
  do update set read_at = excluded.read_at;
end;
$$;


ALTER FUNCTION "public"."mark_campus_request_read"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_campus_transfer_sent"("p_district" "text", "p_team" "text", "p_campus" "text", "p_total_people" integer, "p_paid_people" integer, "p_total_amount" integer, "p_sent_by" "uuid") RETURNS "public"."campus_transfers"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_transfer public.campus_transfers;
  v_existing public.campus_transfers;
  v_scope record;
  v_total_people integer;
  v_paid_people integer;
  v_total_amount integer;
  v_deadline_at timestamptz;
begin
  select district_id, team_id, campus_id
  into v_scope
  from public.campus_options
  where district = p_district
    and team = p_team
    and campus = p_campus
  limit 1;

  if not found then
    raise exception 'Campus transfer scope is invalid.';
  end if;

  if auth.uid() is null or not exists (
    select 1
    from public.admin_roles admin_role
    where admin_role.user_id = auth.uid()
      and (
        admin_role.role = 'global_admin'
        or (
          admin_role.role = 'campus_admin'
          and (
            admin_role.campus_id = v_scope.campus_id
            or (
              admin_role.district = p_district
              and admin_role.team = p_team
              and admin_role.campus = p_campus
            )
          )
        )
      )
  ) then
    raise exception 'Not authorized to report this campus transfer.';
  end if;

  select nullif(value ->> 'deadline_at', '')::timestamptz
  into v_deadline_at
  from public.app_settings
  where key = 'first_reservation_deadline';

  if v_deadline_at is null or v_deadline_at > clock_timestamp() then
    raise exception 'Campus transfer reports are available only after the reservation deadline.';
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where exists (
        select 1
        from public.payments payment
        where payment.reservation_id = reservation.id
          and payment.status = 'completed'
      )
    )::integer
  into v_total_people, v_paid_people
  from public.reservations reservation
  where reservation.status is distinct from 'cancelled'
    and (
      reservation.campus_id = v_scope.campus_id
      or (
        reservation.district = p_district
        and reservation.team = p_team
        and reservation.campus = p_campus
      )
    );

  v_total_amount := v_total_people * public.get_bus_ticket_price();

  if v_total_people <= 0 then
    raise exception 'No active reservations are available for this campus transfer.';
  end if;
  if v_paid_people <> v_total_people then
    raise exception 'Every active reservation must be paid before reporting a campus transfer.';
  end if;
  if p_total_people is distinct from v_total_people
    or p_paid_people is distinct from v_paid_people
    or p_total_amount is distinct from v_total_amount then
    raise exception 'Campus transfer totals changed. Refresh and try again.';
  end if;

  select *
  into v_existing
  from public.campus_transfers transfer
  where transfer.district = p_district
    and transfer.team = p_team
    and transfer.campus = p_campus
  for update;

  if v_existing.id is not null
    and v_existing.status = 'confirmed'
    and v_total_people <= v_existing.total_people
    and v_paid_people <= v_existing.paid_people
    and v_total_amount <= v_existing.total_amount then
    raise exception 'A confirmed campus transfer can only be reported again for additional settlement.';
  end if;

  insert into public.campus_transfers (
    district_id,
    team_id,
    campus_id,
    district,
    team,
    campus,
    total_people,
    paid_people,
    total_amount,
    status,
    sent_by,
    sent_at,
    confirmed_by,
    confirmed_at,
    actual_confirmed_amount,
    updated_at
  )
  values (
    v_scope.district_id,
    v_scope.team_id,
    v_scope.campus_id,
    p_district,
    p_team,
    p_campus,
    v_total_people,
    v_paid_people,
    v_total_amount,
    'sent',
    auth.uid(),
    clock_timestamp(),
    null,
    null,
    null,
    clock_timestamp()
  )
  on conflict (district, team, campus)
  do update set
    district_id = excluded.district_id,
    team_id = excluded.team_id,
    campus_id = excluded.campus_id,
    total_people = excluded.total_people,
    paid_people = excluded.paid_people,
    total_amount = excluded.total_amount,
    status = 'sent',
    sent_by = excluded.sent_by,
    sent_at = excluded.sent_at,
    confirmed_by = null,
    confirmed_at = null,
    actual_confirmed_amount = null,
    updated_at = excluded.updated_at
  returning * into v_transfer;

  return v_transfer;
end;
$$;


ALTER FUNCTION "public"."mark_campus_transfer_sent"("p_district" "text", "p_team" "text", "p_campus" "text", "p_total_people" integer, "p_paid_people" integer, "p_total_amount" integer, "p_sent_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_personal_inquiry_read"("p_inquiry_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."mark_personal_inquiry_read"("p_inquiry_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_personal_notification_read"("p_notification_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.personal_notifications
  set read_at = coalesce(read_at, clock_timestamp())
  where id = p_notification_id and target_user_id = auth.uid();
end;
$$;


ALTER FUNCTION "public"."mark_personal_notification_read"("p_notification_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."move_boarding_passenger_as_global_admin"("p_reservation_id" "uuid", "p_target_bus_id" "text", "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_allocation_id uuid;
  v_source_bus_id text;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can move boarding passengers.';
  end if;

  select allocation.id, public.get_confirmed_ticket_bus_id(reservation.id, reservation.confirmed_ticket)
  into v_allocation_id, v_source_bus_id
  from public.bus_allocations allocation
  join public.reservations reservation on reservation.id = p_reservation_id
  where allocation.allocation_data ->> 'status' = 'confirmed'
    and reservation.status = 'confirmed'
    and reservation.confirmed_ticket is not null;
  if v_allocation_id is null then raise exception 'Confirmed passenger not found.'; end if;

  if not public.can_manage_boarding_bus(v_allocation_id, v_source_bus_id) then
    raise exception 'You are not assigned to the source bus.';
  end if;
  if not public.can_manage_boarding_bus(v_allocation_id, p_target_bus_id) then
    raise exception 'You are not assigned to the target bus.';
  end if;

  perform public.execute_boarding_passenger_move(
    p_reservation_id, v_source_bus_id, p_target_bus_id, p_reason, auth.uid()
  );
end;
$$;


ALTER FUNCTION "public"."move_boarding_passenger_as_global_admin"("p_reservation_id" "uuid", "p_target_bus_id" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_admin_invitation_code"("p_code" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^a-zA-Z0-9]', '', 'g'));
$$;


ALTER FUNCTION "public"."normalize_admin_invitation_code"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_allocation_remaining_seat_passengers"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_passengers jsonb;
begin
  if jsonb_typeof(new.allocation_data -> 'passengers') <> 'array' then
    return new;
  end if;

  select coalesce(
    jsonb_agg(
      case
        when reservation.data ? 'remainingSeatClaim' then
          entry.passenger || jsonb_build_object(
            'source', 'remaining_seat',
            'remainingSeatStatus',
              coalesce(
                reservation.data #>> '{remainingSeatClaim,status}',
                entry.passenger ->> 'remainingSeatStatus',
                'pending_payment'
              ),
            'preferences',
              jsonb_build_array(
                coalesce(
                  reservation.data #>> '{remainingSeatClaim,destination}',
                  entry.passenger #>> '{preferences,0}'
                )
              )
          )
        else entry.passenger
      end
      order by entry.ordinality
    ),
    '[]'::jsonb
  )
  into v_passengers
  from jsonb_array_elements(new.allocation_data -> 'passengers')
    with ordinality as entry(passenger, ordinality)
  left join public.reservations reservation
    on reservation.id::text = entry.passenger ->> 'reservationId';

  new.allocation_data := jsonb_set(
    new.allocation_data,
    '{passengers}',
    v_passengers,
    true
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."normalize_allocation_remaining_seat_passengers"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_confirmed_allocation_name"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.allocation_data ->> 'status' = 'confirmed' then
    new.allocation_name := '확정 배차안';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."normalize_confirmed_allocation_name"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."boarding_bus_departures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "allocation_id" "uuid" NOT NULL,
    "bus_id" "text" NOT NULL,
    "bus_label" "text" NOT NULL,
    "departed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "departed_by" "uuid",
    "cancelled_at" timestamp with time zone,
    "cancelled_by" "uuid",
    "cancellation_reason" "text"
);


ALTER TABLE "public"."boarding_bus_departures" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_boarding_managers_of_departure_cancel"("p_departure" "public"."boarding_bus_departures", "p_reason" "text", "p_restored_count" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_notified integer := 0;
begin
  insert into public.personal_notifications (
    target_user_id,
    title,
    content,
    category,
    created_by
  )
  select distinct
    assignment.manager_user_id,
    p_departure.bus_label || ' 출발 완료 취소',
    p_departure.bus_label || ' 출발 완료가 취소되었습니다. 자동 미탑승 '
      || greatest(p_restored_count, 0)::text || '명이 복구되었습니다. 취소 사유: '
      || p_reason,
    'boarding',
    auth.uid()
  from public.boarding_manager_bus_assignments assignment
  where assignment.allocation_id = p_departure.allocation_id
    and assignment.bus_id = p_departure.bus_id;

  get diagnostics v_notified = row_count;
  return v_notified;
end;
$$;


ALTER FUNCTION "public"."notify_boarding_managers_of_departure_cancel"("p_departure" "public"."boarding_bus_departures", "p_reason" "text", "p_restored_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prepare_allocation_preference_override"("p_allocation_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select jsonb_set(
    p_allocation_data,
    '{passengers}',
    coalesce(
      (
        select jsonb_agg(
          case
            when bus is not null
              and not (
                coalesce(passenger.value -> 'preferences', '[]'::jsonb)
                  ? (bus ->> 'destination')
              )
              then jsonb_set(
                passenger.value,
                '{preferences}',
                coalesce(passenger.value -> 'preferences', '[]'::jsonb)
                  || to_jsonb(bus ->> 'destination'),
                true
              )
            else passenger.value
          end
          order by passenger.ordinality
        )
        from jsonb_array_elements(p_allocation_data -> 'passengers')
          with ordinality passenger(value, ordinality)
        left join jsonb_array_elements(p_allocation_data -> 'buses') bus
          on bus ->> 'id' = passenger.value ->> 'busId'
      ),
      '[]'::jsonb
    ),
    true
  );
$$;


ALTER FUNCTION "public"."prepare_allocation_preference_override"("p_allocation_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_allocation_cancel_after_departure"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if old.allocation_data ->> 'status' = 'confirmed'
    and new.allocation_data ->> 'status' <> 'confirmed'
    and exists (
      select 1
      from public.boarding_bus_departures departure
      where departure.allocation_id = old.id
        and departure.cancelled_at is null
    ) then
    raise exception 'Cancel all bus departures before cancelling the confirmed allocation.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_allocation_cancel_after_departure"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_departed_bus_check_in_code_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_allocation_id uuid;
  v_bus_id text;
begin
  if tg_op = 'DELETE' then
    v_allocation_id := old.allocation_id;
    v_bus_id := old.bus_id;
  else
    v_allocation_id := new.allocation_id;
    v_bus_id := new.bus_id;
  end if;

  if exists (
    select 1
    from public.boarding_bus_departures departure
    where departure.allocation_id = v_allocation_id
      and departure.bus_id = v_bus_id
      and departure.cancelled_at is null
  ) then
    raise exception 'Departed buses are read-only until departure is cancelled.';
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;


ALTER FUNCTION "public"."prevent_departed_bus_check_in_code_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_departed_bus_reservation_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_allocation_id uuid;
  v_old_bus_id text;
  v_new_bus_id text;
  v_departure_id uuid;
begin
  if old.confirmed_ticket is null then return new; end if;

  select id into v_allocation_id
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';
  if not found then return new; end if;

  v_old_bus_id := public.get_confirmed_ticket_bus_id(old.id, old.confirmed_ticket);
  v_new_bus_id := public.get_confirmed_ticket_bus_id(new.id, new.confirmed_ticket);

  select departure.id into v_departure_id
  from public.boarding_bus_departures departure
  where departure.allocation_id = v_allocation_id
    and departure.bus_id in (v_old_bus_id, v_new_bus_id)
    and departure.cancelled_at is null
  limit 1;
  if v_departure_id is null then return new; end if;

  if old.boarding_status = 'unchecked'
    and new.boarding_status = 'no_show'
    and new.boarding_no_show_departure_id = v_departure_id then
    return new;
  end if;
  if old.boarding_status = 'no_show'
    and new.boarding_status = 'unchecked'
    and old.boarding_no_show_departure_id = v_departure_id
    and new.boarding_no_show_departure_id is null then
    return new;
  end if;

  if old.confirmed_ticket is distinct from new.confirmed_ticket then
    raise exception 'Departed bus assignments are locked until departure is cancelled.';
  end if;
  if old.boarding_status is distinct from new.boarding_status
    and new.boarding_status = 'unchecked' then
    raise exception 'Departed buses cannot return passengers to unchecked status.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_departed_bus_reservation_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_departed_bus_walk_in_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_allocation_id uuid;
  v_bus_id text;
  v_departure_id uuid;
begin
  if tg_op = 'DELETE' then
    v_allocation_id := old.allocation_id;
    v_bus_id := old.bus_id;
  else
    v_allocation_id := new.allocation_id;
    v_bus_id := new.bus_id;
  end if;

  select departure.id into v_departure_id
  from public.boarding_bus_departures departure
  where departure.allocation_id = v_allocation_id
    and departure.bus_id = v_bus_id
    and departure.cancelled_at is null
  limit 1;
  if v_departure_id is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'UPDATE'
    and old.boarding_status = 'unchecked'
    and new.boarding_status = 'no_show'
    and new.boarding_no_show_departure_id = v_departure_id then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and old.boarding_status = 'no_show'
    and new.boarding_status = 'unchecked'
    and old.boarding_no_show_departure_id = v_departure_id
    and new.boarding_no_show_departure_id is null then
    return new;
  end if;

  if tg_op <> 'UPDATE' then
    raise exception 'Departed bus rosters are locked until departure is cancelled.';
  end if;
  if old.allocation_id is distinct from new.allocation_id
    or old.bus_id is distinct from new.bus_id
    or old.seat_number is distinct from new.seat_number
    or old.name is distinct from new.name
    or old.phone is distinct from new.phone
    or old.campus is distinct from new.campus
    or old.reason is distinct from new.reason then
    raise exception 'Departed bus assignments are locked until departure is cancelled.';
  end if;
  if old.boarding_status is distinct from new.boarding_status
    and new.boarding_status = 'unchecked' then
    raise exception 'Departed buses cannot return passengers to unchecked status.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_departed_bus_walk_in_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_locked_affiliation_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if (
    old.district_id is distinct from new.district_id
    or old.district is distinct from new.district
    or old.team_id is distinct from new.team_id
    or old.team is distinct from new.team
    or old.campus_id is distinct from new.campus_id
    or old.campus is distinct from new.campus
    or old.affiliation_type is distinct from new.affiliation_type
    or old.coordinator_name is distinct from new.coordinator_name
    or old.coordinator_phone is distinct from new.coordinator_phone
  )
  and exists (
    select 1 from public.reservations reservation
    where reservation.user_id = old.id
      and reservation.status = 'confirmed'
  )
  and not public.is_global_admin() then
    raise exception 'Confirmed participant affiliation can only be changed by a global admin.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_locked_affiliation_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prune_activity_event_logs"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_deleted_count integer;
begin
  delete from public.activity_event_logs activity
  where activity.occurred_at < now() - interval '90 days';

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$;


ALTER FUNCTION "public"."prune_activity_event_logs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prune_activity_event_logs_daily"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_last_pruned_on date;
begin
  if not pg_try_advisory_xact_lock(hashtext('activity_event_logs_retention')) then
    return null;
  end if;

  select nullif(value ->> 'last_pruned_on', '')::date
  into v_last_pruned_on
  from public.app_settings
  where key = 'activity_event_log_retention';

  if v_last_pruned_on is not null and v_last_pruned_on >= current_date then
    return null;
  end if;

  insert into public.app_settings (key, value, updated_at)
  values (
    'activity_event_log_retention',
    jsonb_build_object('last_pruned_on', current_date),
    now()
  )
  on conflict (key) do update
  set
    value = excluded.value,
    updated_at = excluded.updated_at;

  perform public.prune_activity_event_logs();
  return null;
end;
$$;


ALTER FUNCTION "public"."prune_activity_event_logs_daily"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prune_allocation_optimization_jobs"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_deleted_count integer;
begin
  with recursive retained_jobs(id) as (
    select job.id
    from public.allocation_optimization_jobs job
    where job.requested_at >= now() - interval '90 days'
      or job.status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED')

    union

    select recent_optimal.id
    from (
      select job.id
      from public.allocation_optimization_jobs job
      where job.status = 'OPTIMAL'
      order by job.completed_at desc nulls last, job.requested_at desc, job.id
      limit 5
    ) recent_optimal

    union

    select dependency.id
    from retained_jobs retained
    join public.allocation_optimization_jobs retained_job
      on retained_job.id = retained.id
    join public.allocation_optimization_jobs dependency
      on dependency.id in (
        retained_job.source_job_id,
        retained_job.resume_from_job_id
      )
  ),
  deleted as (
    delete from public.allocation_optimization_jobs job
    where job.id not in (select retained.id from retained_jobs retained)
    returning 1
  )
  select count(*)::integer into v_deleted_count from deleted;

  return v_deleted_count;
end;
$$;


ALTER FUNCTION "public"."prune_allocation_optimization_jobs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prune_allocation_optimization_jobs_after_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.prune_allocation_optimization_jobs();
  return null;
end;
$$;


ALTER FUNCTION "public"."prune_allocation_optimization_jobs_after_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prune_allocation_workspace_versions"("p_allocation_id" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_deleted_count integer;
begin
  with ranked_versions as (
    select
      version.id,
      row_number() over (
        partition by version.allocation_id
        order by version.created_at desc, version.id desc
      ) as recent_rank
    from public.allocation_workspace_versions version
    where p_allocation_id is null
      or version.allocation_id = p_allocation_id
  ),
  deleted as (
    delete from public.allocation_workspace_versions version
    using ranked_versions ranked
    where version.id = ranked.id
      and ranked.recent_rank > 20
      and version.created_at < now() - interval '90 days'
    returning 1
  )
  select count(*)::integer into v_deleted_count from deleted;

  return v_deleted_count;
end;
$$;


ALTER FUNCTION "public"."prune_allocation_workspace_versions"("p_allocation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_activity_event"("p_event_name" "text", "p_category" "text" DEFAULT 'interaction'::"text", "p_route" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id uuid;
  v_metadata jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if exists (
    select 1
    from public.admin_roles admin_role
    where admin_role.user_id = auth.uid()
      and admin_role.role = 'global_admin'
  ) then
    return null;
  end if;

  if length(trim(coalesce(p_event_name, ''))) = 0
     or length(p_event_name) > 100 then
    raise exception 'Invalid event name.';
  end if;

  if length(trim(coalesce(p_category, ''))) = 0
     or length(p_category) > 50 then
    raise exception 'Invalid event category.';
  end if;

  select coalesce(jsonb_object_agg(item.key, item.value), '{}'::jsonb)
  into v_metadata
  from jsonb_each(coalesce(p_metadata, '{}'::jsonb)) item
  where item.key in (
    'source',
    'outcome',
    'duration_ms',
    'resource_type',
    'resource_id',
    'error_code',
    'page_title'
  );

  insert into public.activity_event_logs (
    actor_id,
    actor_kind,
    event_name,
    category,
    route,
    metadata
  )
  values (
    auth.uid(),
    case
      when exists (
        select 1
        from public.admin_roles admin_role
        where admin_role.user_id = auth.uid()
      ) then 'admin'
      else 'user'
    end,
    trim(p_event_name),
    trim(p_category),
    left(nullif(trim(coalesce(p_route, '')), ''), 300),
    v_metadata
  )
  returning id into v_id;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."record_activity_event"("p_event_name" "text", "p_category" "text", "p_route" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_personal_user_action"("p_target_user_id" "uuid", "p_reservation_id" "uuid", "p_action" "text", "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can record personal user actions.';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'A reason is required.';
  end if;

  insert into public.personal_user_action_logs (
    target_user_id, reservation_id, actor_id, action, reason
  )
  values (
    p_target_user_id, p_reservation_id, auth.uid(), p_action, btrim(p_reason)
  );
end;
$$;


ALTER FUNCTION "public"."record_personal_user_action"("p_target_user_id" "uuid", "p_reservation_id" "uuid", "p_action" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."redeem_admin_invitation_codes"("p_codes" "text"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'Login is required.';
  end if;

  return public.redeem_admin_invitation_codes_for_user(auth.uid(), p_codes);
end;
$$;


ALTER FUNCTION "public"."redeem_admin_invitation_codes"("p_codes" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."redeem_admin_invitation_codes_for_user"("p_user_id" "uuid", "p_codes" "text"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_validation jsonb;
  v_code text;
  v_normalized text;
  v_invitation public.admin_invitation_codes%rowtype;
  v_campus record;
  v_granted jsonb := '[]'::jsonb;
begin
  if p_user_id is null or not exists (
    select 1 from auth.users where id = p_user_id
  ) then
    raise exception 'Invitation code user was not found.';
  end if;

  if cardinality(coalesce(p_codes, array[]::text[])) = 0 then
    return jsonb_build_object('granted', v_granted);
  end if;

  perform 1
  from public.admin_invitation_codes invitation
  where invitation.code_hash in (
    select digest(public.normalize_admin_invitation_code(code), 'sha256')
    from unnest(p_codes) code
  )
  order by invitation.id
  for update;

  v_validation := public.validate_admin_invitation_codes(p_codes);
  if not coalesce((v_validation ->> 'valid')::boolean, false) then
    raise exception '%', v_validation ->> 'errorMessage';
  end if;

  foreach v_code in array p_codes loop
    v_normalized := public.normalize_admin_invitation_code(v_code);

    select * into strict v_invitation
    from public.admin_invitation_codes invitation
    where invitation.code_hash = digest(v_normalized, 'sha256');

    if v_invitation.role = 'campus_admin' then
      select
        district.id as district_id,
        district.name as district,
        team.id as team_id,
        team.name as team,
        campus.id as campus_id,
        campus.name as campus
      into strict v_campus
      from public.campuses campus
      join public.teams team on team.id = campus.team_id
      join public.districts district on district.id = team.district_id
      where campus.id = v_invitation.campus_id;

      insert into public.admin_roles (
        user_id, role,
        district_id, district, team_id, team, campus_id, campus,
        granted_by, updated_at
      )
      values (
        p_user_id, 'campus_admin',
        v_campus.district_id, v_campus.district,
        v_campus.team_id, v_campus.team,
        v_campus.campus_id, v_campus.campus,
        v_invitation.created_by, clock_timestamp()
      );
    else
      if exists (
        select 1 from public.admin_roles role
        where role.user_id = p_user_id
          and role.role = 'boarding_manager'
      ) then
        raise exception 'This user is already a boarding manager.';
      end if;

      insert into public.admin_roles (
        user_id, role, granted_by, updated_at
      )
      values (
        p_user_id, 'boarding_manager',
        v_invitation.created_by, clock_timestamp()
      );
    end if;

    update public.admin_invitation_codes
    set used_by = p_user_id, used_at = clock_timestamp()
    where id = v_invitation.id;

    v_granted := v_granted || jsonb_build_array(jsonb_build_object(
      'role', v_invitation.role,
      'campusId', v_invitation.campus_id
    ));
  end loop;

  return jsonb_build_object('granted', v_granted);
end;
$$;


ALTER FUNCTION "public"."redeem_admin_invitation_codes_for_user"("p_user_id" "uuid", "p_codes" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_admin_role_organization_scope"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_table_name = 'districts' then
    update public.admin_roles admin_role
    set campus_id = admin_role.campus_id
    from public.campuses campus
    join public.teams team on team.id = campus.team_id
    where admin_role.role = 'campus_admin'
      and admin_role.campus_id = campus.id
      and team.district_id = new.id;
  elsif tg_table_name = 'teams' then
    update public.admin_roles admin_role
    set campus_id = admin_role.campus_id
    from public.campuses campus
    where admin_role.role = 'campus_admin'
      and admin_role.campus_id = campus.id
      and campus.team_id = new.id;
  else
    update public.admin_roles admin_role
    set campus_id = admin_role.campus_id
    where admin_role.role = 'campus_admin'
      and admin_role.campus_id = new.id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."refresh_admin_role_organization_scope"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_campus_request_organization_scope"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_table_name = 'districts' then
    update public.campus_requests request
    set campus_id = request.campus_id
    from public.campuses campus
    join public.teams team on team.id = campus.team_id
    where request.is_global_notice = false
      and request.campus_id = campus.id and team.district_id = new.id;
  elsif tg_table_name = 'teams' then
    update public.campus_requests request
    set campus_id = request.campus_id
    from public.campuses campus
    where request.is_global_notice = false
      and request.campus_id = campus.id and campus.team_id = new.id;
  else
    update public.campus_requests request
    set campus_id = request.campus_id
    where request.is_global_notice = false and request.campus_id = new.id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."refresh_campus_request_organization_scope"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_profile_organization_scope"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_table_name = 'districts' then
    update public.profiles profile
    set campus_id = profile.campus_id
    from public.campuses campus
    join public.teams team on team.id = campus.team_id
    where profile.affiliation_type = 'seoul'
      and profile.campus_id = campus.id
      and team.district_id = new.id;
  elsif tg_table_name = 'teams' then
    update public.profiles profile
    set campus_id = profile.campus_id
    from public.campuses campus
    where profile.affiliation_type = 'seoul'
      and profile.campus_id = campus.id
      and campus.team_id = new.id;
  else
    update public.profiles profile
    set campus_id = profile.campus_id
    where profile.affiliation_type = 'seoul'
      and profile.campus_id = new.id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."refresh_profile_organization_scope"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_reservation_organization_scope"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_table_name = 'districts' then
    update public.reservations reservation
    set campus_id = reservation.campus_id
    from public.campuses campus
    join public.teams team on team.id = campus.team_id
    where reservation.affiliation_type = 'seoul'
      and reservation.campus_id = campus.id
      and team.district_id = new.id;
  elsif tg_table_name = 'teams' then
    update public.reservations reservation
    set campus_id = reservation.campus_id
    from public.campuses campus
    where reservation.affiliation_type = 'seoul'
      and reservation.campus_id = campus.id
      and campus.team_id = new.id;
  else
    update public.reservations reservation
    set campus_id = reservation.campus_id
    where reservation.affiliation_type = 'seoul'
      and reservation.campus_id = new.id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."refresh_reservation_organization_scope"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_cancelled_passenger_from_confirmed_allocations"("p_reservation_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_now timestamptz := clock_timestamp();
  v_actor_id uuid := auth.uid();
  v_current public.bus_allocations%rowtype;
  v_passenger jsonb;
  v_updated_count integer := 0;
begin
  if v_actor_id is null or not public.is_global_admin() then
    raise exception 'Only global admins can edit allocations.';
  end if;

  for v_current in
    select allocation.*
    from public.bus_allocations allocation
    where allocation.allocation_data ->> 'status' = 'confirmed'
      and exists (
        select 1
        from jsonb_array_elements(allocation.allocation_data -> 'passengers') passenger
        where passenger ->> 'reservationId' = p_reservation_id::text
      )
    for update
  loop
    select passenger
    into v_passenger
    from jsonb_array_elements(v_current.allocation_data -> 'passengers') passenger
    where passenger ->> 'reservationId' = p_reservation_id::text
    limit 1;

    update public.bus_allocations
    set
      allocation_data = jsonb_set(
        jsonb_set(
          v_current.allocation_data,
          '{passengers}',
          coalesce((
            select jsonb_agg(passenger)
            from jsonb_array_elements(v_current.allocation_data -> 'passengers') passenger
            where passenger ->> 'reservationId' <> p_reservation_id::text
          ), '[]'::jsonb),
          true
        ),
        '{history}',
        coalesce(v_current.allocation_data -> 'history', '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object(
            'id', 'history-' || floor(extract(epoch from v_now) * 1000)::bigint
              || '-' || substr(md5(random()::text), 1, 7),
            'at', v_now::text,
            'actorId', v_actor_id::text,
            'action', 'passenger_cancelled',
            'detail', coalesce(v_passenger ->> 'name', p_reservation_id::text)
              || ' cancelled; the assigned seat was released.'
          )),
        true
      ),
      updated_at = v_now,
      revision = revision + 1
    where id = v_current.id;

    v_updated_count := v_updated_count + 1;
  end loop;

  return v_updated_count;
end;
$$;


ALTER FUNCTION "public"."remove_cancelled_passenger_from_confirmed_allocations"("p_reservation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_boarding_passenger_move"("p_reservation_id" "uuid", "p_target_bus_id" "text", "p_reason" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_allocation_id uuid;
  v_source_bus_id text;
  v_request_id uuid;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can request passenger moves.';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A move reason is required.';
  end if;

  select allocation.id, public.get_confirmed_ticket_bus_id(reservation.id, reservation.confirmed_ticket)
  into v_allocation_id, v_source_bus_id
  from public.bus_allocations allocation
  join public.reservations reservation on reservation.id = p_reservation_id
  where allocation.allocation_data ->> 'status' = 'confirmed'
    and reservation.status = 'confirmed'
    and reservation.confirmed_ticket is not null;
  if v_allocation_id is null then raise exception 'Confirmed passenger not found.'; end if;
  if not public.can_manage_boarding_bus(v_allocation_id, v_source_bus_id) then
    raise exception 'You are not assigned to the source bus.';
  end if;
  if v_source_bus_id = p_target_bus_id then
    raise exception 'The passenger is already assigned to the target bus.';
  end if;
  if not exists (
    select 1 from public.bus_allocations allocation
    cross join lateral jsonb_array_elements(allocation.allocation_data -> 'buses') bus
    where allocation.id = v_allocation_id and bus ->> 'id' = p_target_bus_id
  ) then
    raise exception 'Target bus not found.';
  end if;
  if exists (
    select 1 from public.boarding_bus_departures
    where allocation_id = v_allocation_id
      and bus_id in (v_source_bus_id, p_target_bus_id)
      and cancelled_at is null
  ) then
    raise exception 'Departed buses cannot receive passenger moves.';
  end if;

  insert into public.boarding_move_requests (
    allocation_id, reservation_id, source_bus_id, target_bus_id, reason, requested_by
  ) values (
    v_allocation_id, p_reservation_id, v_source_bus_id, p_target_bus_id, btrim(p_reason), auth.uid()
  )
  returning id into v_request_id;
  return v_request_id;
exception
  when unique_violation then
    raise exception 'A pending move request already exists for this passenger.';
end;
$$;


ALTER FUNCTION "public"."request_boarding_passenger_move"("p_reservation_id" "uuid", "p_target_bus_id" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."require_closed_reservation_deadline_for_bus_allocation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_deadline_at timestamptz;
begin
  if tg_op = 'UPDATE'
    and (to_jsonb(new) - 'allocation_data' - 'updated_at' - 'revision')
      = (to_jsonb(old) - 'allocation_data' - 'updated_at' - 'revision')
    and (new.allocation_data - 'editLock') = (old.allocation_data - 'editLock')
    and new.revision = old.revision + 1 then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.allocation_data ->> 'status' = 'confirmed'
    and new.allocation_data ->> 'status' = 'draft'
    and new.revision = old.revision + 1 then
    return new;
  end if;

  select nullif(value ->> 'deadline_at', '')::timestamptz
  into v_deadline_at
  from public.app_settings
  where key = 'first_reservation_deadline'
  for share;

  if v_deadline_at is null or v_deadline_at > clock_timestamp() then
    raise exception 'Allocation is available only after the reservation deadline.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."require_closed_reservation_deadline_for_bus_allocation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."require_closed_reservation_deadline_for_optimization_job"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_deadline_at timestamptz;
begin
  select nullif(value ->> 'deadline_at', '')::timestamptz
  into v_deadline_at
  from public.app_settings
  where key = 'first_reservation_deadline'
  for share;

  if v_deadline_at is null or v_deadline_at > clock_timestamp() then
    raise exception 'Allocation is available only after the reservation deadline.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."require_closed_reservation_deadline_for_optimization_job"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_allocation_optimization_jobs"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_deleted_count integer;
  v_status_counts jsonb;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can reset allocation optimization jobs.';
  end if;

  lock table public.allocation_optimization_jobs in share row exclusive mode;

  if exists (
    select 1
    from public.allocation_optimization_jobs
    where status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED')
  ) then
    raise exception 'Cancel the active allocation optimization job before resetting.';
  end if;

  select
    coalesce(sum(status_counts.job_count), 0)::integer,
    coalesce(jsonb_object_agg(status_counts.status, status_counts.job_count), '{}'::jsonb)
  into v_deleted_count, v_status_counts
  from (
    select status, count(*)::integer as job_count
    from public.allocation_optimization_jobs
    group by status
  ) status_counts;

  update public.allocation_optimization_jobs
  set
    source_job_id = null,
    resume_from_job_id = null
  where source_job_id is not null
    or resume_from_job_id is not null;

  delete from public.allocation_optimization_jobs
  where id is not null;

  if to_regclass('public.admin_action_audit_logs') is not null then
    insert into public.admin_action_audit_logs (
      actor_id,
      action,
      resource_type,
      before_data,
      after_data
    )
    values (
      auth.uid(),
      'reset',
      'allocation_optimization_jobs',
      jsonb_build_object(
        'deleted_count', v_deleted_count,
        'status_counts', v_status_counts
      ),
      jsonb_build_object('remaining_count', 0)
    );
  end if;

  return v_deleted_count;
exception
  when others then
    if sqlerrm in (
      'Only global admins can reset allocation optimization jobs.',
      'Cancel the active allocation optimization job before resetting.'
    ) then
      raise;
    end if;
    raise exception 'Allocation optimization reset failed [%]: %', sqlstate, sqlerrm;
end;
$$;


ALTER FUNCTION "public"."reset_allocation_optimization_jobs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_boarding_confirmation_on_ticket_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if old.status is distinct from new.status
    or old.confirmed_ticket is distinct from new.confirmed_ticket then
    new.boarding_confirmed_at := null;
    new.boarding_status := 'unchecked';
    new.boarding_status_updated_at := null;
    new.boarding_status_updated_by := null;
    new.boarding_no_show_departure_id := null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."reset_boarding_confirmation_on_ticket_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_bus_departures_on_allocation_cancel"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if old.allocation_data ->> 'status' = 'confirmed'
    and new.allocation_data ->> 'status' <> 'confirmed' then
    update public.boarding_bus_departures
    set cancelled_at = clock_timestamp(), cancelled_by = auth.uid()
    where allocation_id = new.id and cancelled_at is null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."reset_bus_departures_on_allocation_cancel"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_reservation_data"("p_reset_reservations" boolean DEFAULT true, "p_reset_payments" boolean DEFAULT true, "p_reset_campus_transfers" boolean DEFAULT true, "p_reset_bus_allocations" boolean DEFAULT true, "p_reset_campus_requests" boolean DEFAULT true, "p_reset_stations" boolean DEFAULT false, "p_reset_bus_options" boolean DEFAULT false, "p_reset_app_settings" boolean DEFAULT false, "p_reset_home_announcements" boolean DEFAULT false, "p_reset_campus_admin_roles" boolean DEFAULT false, "p_reset_organization" boolean DEFAULT false, "p_reset_user_accounts" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_deleted_reservations integer := 0;
  v_deleted_payments integer := 0;
  v_deleted_campus_transfers integer := 0;
  v_deleted_bus_allocations integer := 0;
  v_deleted_campus_requests integer := 0;
  v_deleted_campus_request_messages integer := 0;
  v_deleted_stations integer := 0;
  v_deleted_bus_options integer := 0;
  v_deleted_app_settings integer := 0;
  v_deleted_home_announcements integer := 0;
  v_deleted_campus_admin_roles integer := 0;
  v_deleted_districts integer := 0;
  v_deleted_teams integer := 0;
  v_deleted_campuses integer := 0;
  v_deleted_user_accounts integer := 0;
begin
  if not exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  ) then
    raise exception 'Only global admins can reset data.';
  end if;

  if p_reset_organization or p_reset_user_accounts then
    p_reset_reservations := true;
    p_reset_payments := true;
    p_reset_campus_transfers := true;
    p_reset_bus_allocations := true;
    p_reset_campus_requests := true;
    p_reset_campus_admin_roles := true;
  end if;

  if p_reset_campus_requests then
    delete from campus_request_messages where true;
    get diagnostics v_deleted_campus_request_messages = row_count;

    delete from campus_requests where true;
    get diagnostics v_deleted_campus_requests = row_count;
  end if;

  if p_reset_campus_transfers then
    delete from campus_transfers where true;
    get diagnostics v_deleted_campus_transfers = row_count;
  end if;

  if p_reset_bus_allocations then
    delete from bus_allocations where true;
    get diagnostics v_deleted_bus_allocations = row_count;
  end if;

  if p_reset_payments or p_reset_reservations then
    delete from payments where true;
    get diagnostics v_deleted_payments = row_count;
  end if;

  if p_reset_reservations then
    delete from reservations where true;
    get diagnostics v_deleted_reservations = row_count;
  end if;

  if p_reset_home_announcements then
    delete from home_announcements where true;
    get diagnostics v_deleted_home_announcements = row_count;
  end if;

  if p_reset_stations then
    delete from stations where true;
    get diagnostics v_deleted_stations = row_count;
  end if;

  if p_reset_bus_options then
    delete from bus_options where true;
    get diagnostics v_deleted_bus_options = row_count;
  end if;

  if p_reset_app_settings then
    delete from app_settings where true;
    get diagnostics v_deleted_app_settings = row_count;

    insert into app_settings (key, value)
    values
      ('bus_ticket_price', '{"price": 0}'::jsonb),
      ('first_reservation_deadline', '{"deadline_at": null}'::jsonb),
      ('seoul_district_transfer_account', '{"account_number": ""}'::jsonb),
      ('participation_targets', '{"rows": [], "targets": {}}'::jsonb),
      ('global_scenario_checklist', '{"checked_step_ids": []}'::jsonb)
    on conflict (key) do update set
      value = excluded.value,
      updated_at = now();
  end if;

  if p_reset_campus_admin_roles then
    delete from admin_roles where role = 'campus_admin';
    get diagnostics v_deleted_campus_admin_roles = row_count;
  end if;

  if p_reset_organization then
    update admin_roles
    set
      district_id = null,
      team_id = null,
      campus_id = null,
      district = null,
      team = null,
      campus = null,
      updated_at = now()
    where role = 'global_admin';

    update profiles
    set
      district_id = null,
      team_id = null,
      campus_id = null,
      district = null,
      team = null,
      campus = null,
      updated_at = now()
    where
      district_id is not null
      or team_id is not null
      or campus_id is not null
      or district is not null
      or team is not null
      or campus is not null;

    select count(*) into v_deleted_districts from districts;
    select count(*) into v_deleted_teams from teams;
    select count(*) into v_deleted_campuses from campuses;

    delete from districts where true;
  end if;

  if p_reset_user_accounts then
    update admin_roles set granted_by = null where granted_by is not null;

    delete from auth.users where id <> auth.uid();
    get diagnostics v_deleted_user_accounts = row_count;
  end if;

  return jsonb_build_object(
    'reservations', v_deleted_reservations,
    'payments', v_deleted_payments,
    'campusTransfers', v_deleted_campus_transfers,
    'busAllocations', v_deleted_bus_allocations,
    'campusRequests', v_deleted_campus_requests,
    'campusRequestMessages', v_deleted_campus_request_messages,
    'stations', v_deleted_stations,
    'busOptions', v_deleted_bus_options,
    'appSettings', v_deleted_app_settings,
    'homeAnnouncements', v_deleted_home_announcements,
    'campusAdminRoles', v_deleted_campus_admin_roles,
    'organization', v_deleted_districts + v_deleted_teams + v_deleted_campuses,
    'userAccounts', v_deleted_user_accounts
  );
end;
$$;


ALTER FUNCTION "public"."reset_reservation_data"("p_reset_reservations" boolean, "p_reset_payments" boolean, "p_reset_campus_transfers" boolean, "p_reset_bus_allocations" boolean, "p_reset_campus_requests" boolean, "p_reset_stations" boolean, "p_reset_bus_options" boolean, "p_reset_app_settings" boolean, "p_reset_home_announcements" boolean, "p_reset_campus_admin_roles" boolean, "p_reset_organization" boolean, "p_reset_user_accounts" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."respond_to_boarding_move_request"("p_request_id" "uuid", "p_approve" boolean, "p_response_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_request public.boarding_move_requests%rowtype;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can respond to passenger move requests.';
  end if;

  select * into v_request
  from public.boarding_move_requests
  where id = p_request_id
  for update;
  if not found then raise exception 'Move request not found.'; end if;
  if v_request.status <> 'pending' then raise exception 'Move request is no longer pending.'; end if;
  if not public.can_manage_boarding_bus(v_request.allocation_id, v_request.target_bus_id) then
    raise exception 'You are not assigned to the target bus.';
  end if;
  if not p_approve and nullif(btrim(coalesce(p_response_reason, '')), '') is null then
    raise exception 'A rejection reason is required.';
  end if;

  if p_approve then
    perform public.execute_boarding_passenger_move(
      v_request.reservation_id,
      v_request.source_bus_id,
      v_request.target_bus_id,
      v_request.reason,
      auth.uid()
    );
  end if;

  update public.boarding_move_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      responded_by = auth.uid(),
      responded_at = clock_timestamp(),
      response_reason = nullif(btrim(coalesce(p_response_reason, '')), '')
  where id = p_request_id;
end;
$$;


ALTER FUNCTION "public"."respond_to_boarding_move_request"("p_request_id" "uuid", "p_approve" boolean, "p_response_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."respond_to_personal_inquiry"("p_inquiry_id" "uuid", "p_status" "text", "p_admin_response" "text") RETURNS "public"."personal_inquiries"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."respond_to_personal_inquiry"("p_inquiry_id" "uuid", "p_status" "text", "p_admin_response" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restore_boarding_exception_as_global_admin"("p_record_key" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global administrators can restore boarding exceptions';
  end if;

  delete from public.boarding_exception_archives
  where record_key = btrim(p_record_key);
end;
$$;


ALTER FUNCTION "public"."restore_boarding_exception_as_global_admin"("p_record_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revert_campus_transfer_confirmation_as_global_admin"("p_transfer_id" "uuid") RETURNS "public"."campus_transfers"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_transfer public.campus_transfers;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can revert campus transfers.';
  end if;

  update public.campus_transfers
  set status = 'sent',
      confirmed_by = null,
      confirmed_at = null,
      actual_confirmed_amount = null,
      updated_at = now()
  where id = p_transfer_id
  returning * into v_transfer;

  if v_transfer.id is null then raise exception 'Campus transfer not found.'; end if;
  return v_transfer;
end;
$$;


ALTER FUNCTION "public"."revert_campus_transfer_confirmation_as_global_admin"("p_transfer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revert_personal_user_action"("p_action_log_id" "uuid", "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_log public.personal_user_action_logs%rowtype;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can revert personal user actions.'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'A reason is required.'; end if;
  select * into v_log from public.personal_user_action_logs where id = p_action_log_id for update;
  if not found or not v_log.reversible or v_log.reverted_at is not null then raise exception 'This action cannot be reverted.'; end if;

  if v_log.action like 'payment_%' then
    update public.payments
    set status = coalesce(v_log.before_data ->> 'paymentStatus', 'pending'),
        notes = '되돌리기: ' || btrim(p_reason), updated_at = clock_timestamp()
    where reservation_id = v_log.reservation_id;
  elsif v_log.action = 'organization_updated' then
    update public.profiles set campus_id = nullif(v_log.before_data ->> 'campusId', '')::uuid
    where id = v_log.target_user_id;
    update public.reservations set campus_id = nullif(v_log.before_data ->> 'campusId', '')::uuid
    where id = v_log.reservation_id;
  else
    raise exception 'This action cannot be reverted.';
  end if;

  update public.personal_user_action_logs
  set reverted_at = clock_timestamp(), reverted_by = auth.uid()
  where id = v_log.id;

  insert into public.personal_user_action_logs (
    target_user_id, reservation_id, actor_id, action, reason, before_data, after_data, reversible
  ) values (
    v_log.target_user_id, v_log.reservation_id, auth.uid(), 'action_reverted', btrim(p_reason),
    v_log.after_data, v_log.before_data, false
  );
end;
$$;


ALTER FUNCTION "public"."revert_personal_user_action"("p_action_log_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rotate_boarding_check_in_code"("p_bus_id" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_allocation public.bus_allocations%rowtype;
  v_bus jsonb;
  v_code text;
begin
  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';

  if not found then raise exception 'Confirmed allocation not found.'; end if;
  if not public.can_manage_boarding_bus(v_allocation.id, p_bus_id) then
    raise exception 'You cannot manage this bus.';
  end if;

  select bus into v_bus
  from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
  where bus ->> 'id' = p_bus_id;
  if v_bus is null then raise exception 'Bus not found.'; end if;

  if exists (
    select 1 from public.boarding_bus_departures
    where allocation_id = v_allocation.id
      and bus_id = p_bus_id
      and cancelled_at is null
  ) then
    raise exception 'A departed bus cannot issue a check-in code.';
  end if;

  v_code := lpad(floor(random() * 10000)::integer::text, 4, '0');

  insert into public.boarding_check_in_codes (
    allocation_id, bus_id, bus_label, check_in_code, created_at, created_by, expires_at
  )
  values (
    v_allocation.id, p_bus_id, v_bus ->> 'label', v_code,
    clock_timestamp(), auth.uid(), clock_timestamp() + interval '12 hours'
  )
  on conflict (allocation_id, bus_id) do update
  set bus_label = excluded.bus_label,
      check_in_code = excluded.check_in_code,
      created_at = excluded.created_at,
      created_by = excluded.created_by,
      expires_at = excluded.expires_at;

  return v_code;
end;
$$;


ALTER FUNCTION "public"."rotate_boarding_check_in_code"("p_bus_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_allocation_optimizer_config"("p_capacity" integer, "p_price" integer, "p_recommended_minimum_passengers" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.assert_allocation_planning_unlocked();
  perform public.save_allocation_optimizer_config_unlocked(
    p_capacity, p_price, p_recommended_minimum_passengers
  );
  return public.get_allocation_optimizer_config();
end;
$$;


ALTER FUNCTION "public"."save_allocation_optimizer_config"("p_capacity" integer, "p_price" integer, "p_recommended_minimum_passengers" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_allocation_optimizer_config_unlocked"("p_capacity" integer, "p_price" integer, "p_recommended_minimum_passengers" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_config jsonb;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can update allocation optimizer configuration.';
  end if;
  if p_capacity <= 0 then
    raise exception 'Bus capacity must be positive.';
  end if;
  if p_price < 0 then
    raise exception 'Bus price cannot be negative.';
  end if;
  if p_recommended_minimum_passengers <= 0
    or p_recommended_minimum_passengers > p_capacity then
    raise exception 'Recommended minimum passengers must be between 1 and capacity.';
  end if;
  if exists (
    select 1
    from public.allocation_optimization_jobs
    where status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED')
  ) then
    raise exception 'Allocation optimizer configuration cannot change during an active job.';
  end if;

  v_config := jsonb_build_object(
    'capacity', p_capacity,
    'price', p_price,
    'recommended_minimum_passengers', p_recommended_minimum_passengers
  );

  insert into public.app_settings (key, value)
  values ('allocation_optimizer_config', v_config)
  on conflict (key) do update
  set value = excluded.value;

  return v_config;
end;
$$;


ALTER FUNCTION "public"."save_allocation_optimizer_config_unlocked"("p_capacity" integer, "p_price" integer, "p_recommended_minimum_passengers" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_confirmed_allocation_workspace"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer) RETURNS SETOF "public"."bus_allocations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_now timestamptz := clock_timestamp();
  v_actor_id uuid := auth.uid();
  v_current_status text;
  v_current_revision bigint;
  v_lock_actor text;
  v_lock_expires_at timestamptz;
  v_passenger_count integer;
  v_updated_count integer;
begin
  if v_actor_id is null or not public.is_global_admin() then
    raise exception 'Only global admins can confirm allocations.';
  end if;

  if jsonb_typeof(p_allocation_data) <> 'object'
    or jsonb_typeof(p_allocation_data -> 'buses') <> 'array'
    or jsonb_typeof(p_allocation_data -> 'passengers') <> 'array'
    or p_allocation_data ->> 'status' <> 'confirmed' then
    raise exception 'Invalid confirmed allocation payload.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('allocation-confirmation', 0));

  select
    allocation_data ->> 'status',
    revision,
    allocation_data #>> '{editLock,actorId}',
    nullif(allocation_data #>> '{editLock,expiresAt}', '')::timestamptz
  into v_current_status, v_current_revision, v_lock_actor, v_lock_expires_at
  from public.bus_allocations
  where id = p_allocation_id
  for update;

  if v_current_status is null or v_current_status not in ('draft', 'confirmed') then
    raise exception 'Only draft or confirmed allocations can be saved as confirmed.';
  end if;
  if v_current_revision <> p_expected_revision then
    raise exception 'Allocation workspace changed. Reload before saving.';
  end if;
  if v_lock_actor is distinct from v_actor_id::text then
    raise exception 'Allocation workspace lock is owned by another administrator.';
  end if;
  if coalesce(v_lock_expires_at, '-infinity'::timestamptz) <= v_now then
    raise exception 'Allocation workspace lock expired. Reopen the workspace.';
  end if;

  v_passenger_count := jsonb_array_length(p_allocation_data -> 'passengers');

  if v_passenger_count = 0
    or jsonb_array_length(p_allocation_data -> 'buses') = 0 then
    raise exception 'Confirmed allocations need at least one bus and passenger.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_allocation_data -> 'buses') bus
    where nullif(btrim(bus ->> 'id'), '') is null
      or nullif(btrim(bus ->> 'label'), '') is null
      or nullif(btrim(bus ->> 'destination'), '') is null
      or nullif(btrim(bus ->> 'departureTime'), '') is null
      or nullif(btrim(bus ->> 'boardingPlace'), '') is null
      or coalesce(bus ->> 'capacity', '') !~ '^[1-9][0-9]*$'
  ) then
    raise exception 'Every bus needs valid required details.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
    where nullif(passenger ->> 'reservationId', '') is null
      or nullif(passenger ->> 'busId', '') is null
      or coalesce(passenger ->> 'seatNumber', '') !~ '^[1-9][0-9]*$'
  ) then
    raise exception 'Every passenger needs a bus and valid seat number.';
  end if;

  if (
    select count(distinct passenger ->> 'reservationId')
    from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
  ) <> v_passenger_count then
    raise exception 'Duplicate reservation IDs exist in the allocation.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
    left join jsonb_array_elements(p_allocation_data -> 'buses') bus
      on bus ->> 'id' = passenger ->> 'busId'
    where bus is null
      or (passenger ->> 'seatNumber')::integer > (bus ->> 'capacity')::integer
      or not (
        coalesce(passenger -> 'preferences', '[]'::jsonb)
          ? (bus ->> 'destination')
      )
  ) then
    raise exception 'Invalid bus, seat, or destination assignment exists.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
    group by passenger ->> 'busId', passenger ->> 'seatNumber'
    having count(*) > 1
  ) then
    raise exception 'Duplicate seat assignments exist.';
  end if;

  if (
    select count(*)
    from public.reservations
    where status is distinct from 'cancelled'
  ) <> v_passenger_count
    or exists (
      select 1
      from public.reservations reservation
      where reservation.status is distinct from 'cancelled'
        and not exists (
          select 1
          from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
          where passenger ->> 'reservationId' = reservation.id::text
        )
    )
    or exists (
      select 1
      from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
      where not exists (
        select 1
        from public.reservations reservation
        where reservation.id = (passenger ->> 'reservationId')::uuid
          and reservation.status is distinct from 'cancelled'
      )
    ) then
    raise exception 'Active reservations changed after the draft was created.';
  end if;

  with assignments as (
    select
      (passenger ->> 'reservationId')::uuid as reservation_id,
      jsonb_build_object(
        'busNumber', bus ->> 'label',
        'seatNumber', passenger ->> 'seatNumber',
        'departureTime', bus ->> 'departureTime',
        'boardingPlace', bus ->> 'boardingPlace',
        'dropoffStation', bus ->> 'destination',
        'confirmedAt', v_now::text
      ) as ticket
    from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
    join jsonb_array_elements(p_allocation_data -> 'buses') bus
      on bus ->> 'id' = passenger ->> 'busId'
  )
  update public.reservations reservation
  set
    status = 'confirmed',
    confirmed_ticket = assignments.ticket,
    data = coalesce(reservation.data, '{}'::jsonb) || jsonb_build_object(
      'status', 'confirmed',
      'confirmedTicket', assignments.ticket,
      'updatedAt', v_now::text
    ),
    updated_at = v_now
  from assignments
  where reservation.id = assignments.reservation_id
    and reservation.status is distinct from 'cancelled';

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> v_passenger_count then
    raise exception 'Not every active reservation was confirmed.';
  end if;

  update public.bus_allocations
  set
    allocation_data = jsonb_set(
      p_allocation_data,
      '{editLock}',
      jsonb_build_object(
        'actorId', v_actor_id::text,
        'expiresAt', (v_now + interval '15 minutes')::text
      ),
      true
    ),
    total_cost = p_total_cost,
    total_capacity = p_total_capacity,
    updated_at = v_now,
    revision = revision + 1
  where id = p_allocation_id;

  if v_current_status = 'draft' then
    update public.bus_allocations allocation
    set
      allocation_data = jsonb_set(
        jsonb_set(
          jsonb_set(
            allocation.allocation_data,
            '{status}',
            to_jsonb('archived'::text),
            true
          ),
          '{passengers}',
          coalesce(
            (
              select jsonb_agg(
                passenger.value || jsonb_build_object(
                  'reservationId', 'anonymous-' || passenger.ordinality,
                  'name', '탑승자 A-' || lpad(passenger.ordinality::text, 3, '0'),
                  'campus', '',
                  'team', ''
                )
                order by passenger.ordinality
              )
              from jsonb_array_elements(allocation.allocation_data -> 'passengers')
                with ordinality passenger(value, ordinality)
            ),
            '[]'::jsonb
          ),
          true
        ),
        '{versions}',
        '[]'::jsonb,
        true
      ) || jsonb_build_object(
        'history',
        coalesce(allocation.allocation_data -> 'history', '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object(
            'id', 'history-' || floor(extract(epoch from v_now) * 1000)::bigint
              || '-' || substr(md5(random()::text), 1, 7),
            'at', v_now::text,
            'actorId', v_actor_id::text,
            'action', 'archived',
            'detail', '새 배차 확정에 따라 탑승자 정보를 익명화하고 과거 기록으로 보관했습니다.'
          ))
      ),
      updated_at = v_now,
      revision = revision + 1
    where allocation.id <> p_allocation_id
      and allocation.allocation_data ->> 'status' = 'confirmed';

    delete from public.bus_allocations allocation
    where allocation.id <> p_allocation_id
      and allocation.allocation_data ->> 'status' = 'draft';
  end if;

  return query
  select *
  from public.bus_allocations
  where id = p_allocation_id;
end;
$_$;


ALTER FUNCTION "public"."save_confirmed_allocation_workspace"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_confirmed_allocation_workspace_v2"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") RETURNS SETOF "public"."bus_allocations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_saved public.bus_allocations%rowtype;
begin
  select *
  into v_saved
  from public.save_confirmed_allocation_workspace(
    p_allocation_id,
    p_expected_revision,
    p_allocation_data - 'versions',
    p_total_cost,
    p_total_capacity
  );

  perform public.store_allocation_workspace_version(
    p_allocation_id,
    v_saved.revision,
    p_allocation_data,
    p_version_id,
    p_version_label,
    p_version_changes
  );

  return next v_saved;
end;
$$;


ALTER FUNCTION "public"."save_confirmed_allocation_workspace_v2"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_confirmed_allocation_workspace_v3"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") RETURNS SETOF "public"."bus_allocations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "statement_timeout" TO '5min'
    AS $$
begin
  if exists (
    select 1 from public.bus_allocations
    where id = p_allocation_id and allocation_data ->> 'status' = 'confirmed'
  ) then
    raise exception 'Confirmed allocation is locked until confirmation is cancelled.';
  end if;

  perform set_config('app.allocation_confirmation_write', 'on', true);

  return query select *
  from public.save_confirmed_allocation_workspace_v3_unlocked(
    p_allocation_id, p_expected_revision, p_allocation_data, p_total_cost,
    p_total_capacity, p_version_id, p_version_label, p_version_changes
  );
end;
$$;


ALTER FUNCTION "public"."save_confirmed_allocation_workspace_v3"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_confirmed_allocation_workspace_v3_unlocked"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") RETURNS SETOF "public"."bus_allocations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_saved public.bus_allocations%rowtype;
  v_final_data jsonb;
  v_sanitized_data jsonb;
  v_out_of_preference_ids jsonb := '[]'::jsonb;
  v_has_out_of_preference boolean := false;
  v_now timestamptz := clock_timestamp();
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can confirm allocations.';
  end if;

  select
    coalesce(jsonb_agg(to_jsonb(passenger ->> 'reservationId')), '[]'::jsonb),
    count(*) > 0
  into v_out_of_preference_ids, v_has_out_of_preference
  from jsonb_array_elements(coalesce(p_allocation_data -> 'passengers', '[]'::jsonb))
    passenger
  left join jsonb_array_elements(coalesce(p_allocation_data -> 'buses', '[]'::jsonb))
    bus on bus ->> 'id' = passenger ->> 'busId'
  where bus is not null
    and not (
      coalesce(passenger -> 'preferences', '[]'::jsonb)
        ? (bus ->> 'destination')
    );

  if v_has_out_of_preference
    and coalesce((p_allocation_data ->> 'allowOutOfPreferenceOverride')::boolean, false)
      is not true then
    raise exception 'Out-of-preference assignments require explicit global-admin acknowledgement.';
  end if;

  v_final_data := p_allocation_data - 'versions';
  if v_has_out_of_preference then
    v_final_data := jsonb_set(
      v_final_data,
      '{outOfPreferenceAcknowledgement}',
      jsonb_build_object(
        'actorId', auth.uid()::text,
        'at', v_now,
        'passengerIds', v_out_of_preference_ids
      ),
      true
    );
    v_final_data := jsonb_set(
      v_final_data,
      '{history}',
      coalesce(v_final_data -> 'history', '[]'::jsonb)
        || jsonb_build_array(
          jsonb_build_object(
            'id', 'history-' || replace(gen_random_uuid()::text, '-', ''),
            'at', v_now,
            'actorId', auth.uid()::text,
            'action', 'out_of_preference_acknowledged',
            'detail',
              jsonb_array_length(v_out_of_preference_ids)::text
                || '명의 1·2지망 외 배정을 확인하고 승인했습니다.'
          )
        ),
      true
    );
  else
    v_final_data := v_final_data - 'outOfPreferenceAcknowledgement';
  end if;

  v_sanitized_data := public.prepare_allocation_preference_override(v_final_data);

  select *
  into v_saved
  from public.save_confirmed_allocation_workspace_v2(
    p_allocation_id,
    p_expected_revision,
    v_sanitized_data,
    p_total_cost,
    p_total_capacity,
    p_version_id,
    p_version_label,
    p_version_changes
  );

  v_final_data := jsonb_set(
    v_final_data,
    '{editLock}',
    coalesce(v_saved.allocation_data -> 'editLock', '{}'::jsonb),
    true
  );

  update public.bus_allocations
  set allocation_data = v_final_data
  where id = p_allocation_id
  returning * into v_saved;

  update public.allocation_workspace_versions
  set snapshot = jsonb_build_object(
    'buses', coalesce(v_final_data -> 'buses', '[]'::jsonb),
    'passengers', coalesce(v_final_data -> 'passengers', '[]'::jsonb)
  )
  where id = p_version_id
    and allocation_id = p_allocation_id;

  return next v_saved;
exception
  when invalid_text_representation then
    raise exception 'Out-of-preference acknowledgement value is invalid.';
end;
$$;


ALTER FUNCTION "public"."save_confirmed_allocation_workspace_v3_unlocked"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_draft_allocation_workspace"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer) RETURNS SETOF "public"."bus_allocations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_now timestamptz := clock_timestamp();
  v_actor_id uuid := auth.uid();
  v_current public.bus_allocations%rowtype;
  v_lock_actor text;
  v_lock_expires_at timestamptz;
  v_next_data jsonb;
begin
  if v_actor_id is null or not public.is_global_admin() then
    raise exception 'Only global admins can edit allocations.';
  end if;

  if jsonb_typeof(p_allocation_data) <> 'object'
    or p_allocation_data ->> 'status' <> 'draft' then
    raise exception 'Invalid draft allocation payload.';
  end if;

  select *
  into v_current
  from public.bus_allocations
  where id = p_allocation_id
  for update;

  if not found then
    raise exception 'Allocation workspace not found.';
  end if;
  if v_current.revision <> p_expected_revision then
    raise exception 'Allocation workspace changed. Reload before saving.';
  end if;

  v_lock_actor := v_current.allocation_data #>> '{editLock,actorId}';
  v_lock_expires_at := nullif(
    v_current.allocation_data #>> '{editLock,expiresAt}',
    ''
  )::timestamptz;

  if v_lock_actor is distinct from v_actor_id::text then
    raise exception 'Allocation workspace lock is owned by another administrator.';
  end if;
  if coalesce(v_lock_expires_at, '-infinity'::timestamptz) <= v_now then
    raise exception 'Allocation workspace lock expired. Reopen the workspace.';
  end if;

  v_next_data := jsonb_set(
    p_allocation_data,
    '{editLock}',
    jsonb_build_object(
      'actorId', v_actor_id::text,
      'expiresAt', (v_now + interval '15 minutes')::text
    ),
    true
  );

  update public.bus_allocations
  set
    allocation_data = v_next_data,
    total_cost = p_total_cost,
    total_capacity = p_total_capacity,
    updated_at = v_now,
    revision = revision + 1
  where id = p_allocation_id;

  return query
  select *
  from public.bus_allocations
  where id = p_allocation_id;
end;
$$;


ALTER FUNCTION "public"."save_draft_allocation_workspace"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_draft_allocation_workspace_v2"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") RETURNS SETOF "public"."bus_allocations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_saved public.bus_allocations%rowtype;
begin
  select *
  into v_saved
  from public.save_draft_allocation_workspace(
    p_allocation_id,
    p_expected_revision,
    p_allocation_data - 'versions',
    p_total_cost,
    p_total_capacity
  );

  perform public.store_allocation_workspace_version(
    p_allocation_id,
    v_saved.revision,
    p_allocation_data,
    p_version_id,
    p_version_label,
    p_version_changes
  );

  return next v_saved;
end;
$$;


ALTER FUNCTION "public"."save_draft_allocation_workspace_v2"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_user_reservation"("p_name" "text", "p_phone" "text", "p_district" "text", "p_team" "text", "p_campus" "text", "p_station_preferences" "jsonb", "p_data" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_opens_at timestamptz;
begin
  select nullif(value ->> 'opens_at', '')::timestamptz
  into v_opens_at
  from public.app_settings
  where key = 'first_reservation_deadline'
  for share;

  if v_opens_at is not null and v_opens_at > clock_timestamp() then
    raise exception 'Reservation window has not opened yet.';
  end if;

  return public.save_user_reservation_without_opening_check(
    p_name,
    p_phone,
    p_district,
    p_team,
    p_campus,
    p_station_preferences,
    p_data
  );
end;
$$;


ALTER FUNCTION "public"."save_user_reservation"("p_name" "text", "p_phone" "text", "p_district" "text", "p_team" "text", "p_campus" "text", "p_station_preferences" "jsonb", "p_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_user_reservation_without_opening_check"("p_name" "text", "p_phone" "text", "p_district" "text", "p_team" "text", "p_campus" "text", "p_station_preferences" "jsonb", "p_data" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz;
  v_deadline_value jsonb;
  v_deadline_at timestamptz;
  v_district_id uuid;
  v_team_id uuid;
  v_campus_id uuid;
  v_affiliation_type text :=
    case when p_data ->> 'affiliationType' = 'external' then 'external' else 'seoul' end;
  v_coordinator_name text := nullif(trim(p_data ->> 'coordinatorName'), '');
  v_coordinator_phone text := nullif(trim(p_data ->> 'coordinatorPhone'), '');
  v_data jsonb;
  v_reservation_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication failed.';
  end if;

  if nullif(trim(p_name), '') is null
    or nullif(trim(p_phone), '') is null
    or nullif(trim(p_district), '') is null
    or nullif(trim(p_campus), '') is null
    or (v_affiliation_type = 'seoul' and nullif(trim(p_team), '') is null)
    or (v_affiliation_type = 'external' and (
      v_coordinator_name is null or v_coordinator_phone is null
    )) then
    raise exception 'Reservation fields are required.';
  end if;

  if jsonb_typeof(coalesce(p_station_preferences, 'null'::jsonb)) <> 'array' then
    raise exception 'Station preferences must be a JSON array.';
  end if;

  if jsonb_array_length(p_station_preferences) <> 2
    or p_station_preferences -> 0 ->> 'rank' <> '1'
    or p_station_preferences -> 1 ->> 'rank' <> '2' then
    raise exception 'Station preferences must contain first and second choices.';
  end if;

  if nullif(p_station_preferences -> 0 -> 'station' ->> 'id', '') is null
    or nullif(p_station_preferences -> 1 -> 'station' ->> 'id', '') is null
    or p_station_preferences -> 0 -> 'station' ->> 'id'
      = p_station_preferences -> 1 -> 'station' ->> 'id'
    or (
      select count(*)
      from public.stations
      where stations.is_active = true
        and (
          (stations.id::text = p_station_preferences -> 0 -> 'station' ->> 'id'
            and stations.name = p_station_preferences -> 0 -> 'station' ->> 'name')
          or
          (stations.id::text = p_station_preferences -> 1 -> 'station' ->> 'id'
            and stations.name = p_station_preferences -> 1 -> 'station' ->> 'name')
        )
    ) <> 2 then
    raise exception 'Station preferences contain invalid or duplicate stations.';
  end if;

  if jsonb_typeof(coalesce(p_data, 'null'::jsonb)) <> 'object' then
    raise exception 'Reservation data must be a JSON object.';
  end if;

  select value into v_deadline_value
  from public.app_settings
  where key = 'first_reservation_deadline'
  for share;

  if v_deadline_value is null then
    raise exception 'Reservation deadline setting is missing.';
  end if;

  v_now := clock_timestamp();
  v_deadline_at := nullif(v_deadline_value ->> 'deadline_at', '')::timestamptz;

  if v_deadline_at is not null and v_deadline_at <= v_now then
    raise exception 'Reservation deadline has passed.';
  end if;

  if v_affiliation_type = 'seoul' then
    select district_id, team_id, campus_id
    into v_district_id, v_team_id, v_campus_id
    from public.campus_options
    where district = trim(p_district)
      and team = trim(p_team)
      and campus = trim(p_campus)
    limit 1;

    if v_campus_id is null then
      raise exception 'Invalid reservation organization scope.';
    end if;
  end if;

  v_data := p_data || jsonb_build_object(
    'name', trim(p_name),
    'phone', trim(p_phone),
    'district', trim(p_district),
    'team', case when v_affiliation_type = 'external' then '' else trim(p_team) end,
    'campus', trim(p_campus),
    'affiliationType', v_affiliation_type,
    'coordinatorName', v_coordinator_name,
    'coordinatorPhone', v_coordinator_phone,
    'stationPreferences', p_station_preferences,
    'status', 'requested',
    'confirmedTicket', null,
    'requestedAt', v_now::text
  );

  insert into public.reservations as target (
    user_id, name, phone,
    district_id, district, team_id, team, campus_id, campus,
    affiliation_type, coordinator_name, coordinator_phone,
    station_preferences, status, confirmed_ticket, data, created_at, updated_at
  )
  values (
    v_user_id, trim(p_name), trim(p_phone),
    v_district_id, trim(p_district), v_team_id,
    case when v_affiliation_type = 'external' then '' else trim(p_team) end,
    v_campus_id, trim(p_campus),
    v_affiliation_type, v_coordinator_name, v_coordinator_phone,
    p_station_preferences, 'requested', null, v_data, v_now, v_now
  )
  on conflict (user_id)
  do update set
    name = excluded.name,
    phone = excluded.phone,
    district_id = excluded.district_id,
    district = excluded.district,
    team_id = excluded.team_id,
    team = excluded.team,
    campus_id = excluded.campus_id,
    campus = excluded.campus,
    affiliation_type = excluded.affiliation_type,
    coordinator_name = excluded.coordinator_name,
    coordinator_phone = excluded.coordinator_phone,
    station_preferences = excluded.station_preferences,
    status = 'requested',
    confirmed_ticket = null,
    data = jsonb_set(
      jsonb_set(
        excluded.data,
        '{requestedAt}',
        case
          when target.status = 'cancelled' then to_jsonb(v_now::text)
          else coalesce(target.data -> 'requestedAt', to_jsonb(target.created_at::text))
        end,
        true
      ),
      '{updatedAt}',
      to_jsonb(v_now::text),
      true
    ),
    updated_at = v_now
  where target.status in ('requested', 'cancelled')
  returning id into v_reservation_id;

  if v_reservation_id is null then
    raise exception 'Confirmed reservations cannot be changed.';
  end if;

  update public.profiles
  set
    name = trim(p_name),
    phone = trim(p_phone),
    district_id = v_district_id,
    district = trim(p_district),
    team_id = v_team_id,
    team = case when v_affiliation_type = 'external' then '' else trim(p_team) end,
    campus_id = v_campus_id,
    campus = trim(p_campus),
    affiliation_type = v_affiliation_type,
    coordinator_name = v_coordinator_name,
    coordinator_phone = v_coordinator_phone,
    updated_at = v_now
  where id = v_user_id;

  return v_reservation_id;
end;
$$;


ALTER FUNCTION "public"."save_user_reservation_without_opening_check"("p_name" "text", "p_phone" "text", "p_district" "text", "p_team" "text", "p_campus" "text", "p_station_preferences" "jsonb", "p_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_personal_notification"("p_target_user_id" "uuid", "p_title" "text", "p_content" "text", "p_category" "text" DEFAULT 'general'::"text", "p_reason" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_notification_id uuid;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can send personal notifications.';
  end if;

  if nullif(btrim(p_title), '') is null or nullif(btrim(p_content), '') is null then
    raise exception 'Notification title and content are required.';
  end if;

  insert into public.personal_notifications (
    target_user_id, title, content, category, created_by
  )
  values (
    p_target_user_id,
    btrim(p_title),
    btrim(p_content),
    coalesce(nullif(btrim(p_category), ''), 'general'),
    auth.uid()
  )
  returning id into v_notification_id;

  perform public.record_personal_user_action(
    p_target_user_id,
    null,
    'notification_sent',
    coalesce(nullif(btrim(p_reason), ''), btrim(p_title))
  );

  return v_notification_id;
end;
$$;


ALTER FUNCTION "public"."send_personal_notification"("p_target_user_id" "uuid", "p_title" "text", "p_content" "text", "p_category" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_admin_role_scope_ids"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.district_id is null
    or new.team_id is null
    or new.campus_id is null
  then
    select
      campus_options.district_id,
      campus_options.team_id,
      campus_options.campus_id
    into
      new.district_id,
      new.team_id,
      new.campus_id
    from campus_options
    where campus_options.district = new.district
      and campus_options.team = new.team
      and campus_options.campus = new.campus
    limit 1;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."set_admin_role_scope_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_allocation_optimization_job_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_allocation_optimization_job_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_app_settings_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_app_settings_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_boarding_manager_bus_assignments_as_global_admin"("p_user_id" "uuid", "p_bus_ids" "text"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_allocation public.bus_allocations%rowtype;
  v_requested_count integer;
  v_valid_count integer;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can manage boarding manager assignments.';
  end if;
  if not exists (
    select 1 from public.admin_roles
    where user_id = p_user_id and role = 'boarding_manager'
  ) then
    raise exception 'The selected user is not a boarding manager.';
  end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';
  if not found then
    raise exception 'Confirmed allocation not found.';
  end if;

  select count(distinct bus_id)
  into v_requested_count
  from unnest(coalesce(p_bus_ids, array[]::text[])) bus_id;

  select count(distinct bus ->> 'id')
  into v_valid_count
  from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
  where bus ->> 'id' = any(coalesce(p_bus_ids, array[]::text[]));

  if v_requested_count <> v_valid_count then
    raise exception 'One or more selected buses do not belong to the confirmed allocation.';
  end if;

  delete from public.boarding_manager_bus_assignments
  where allocation_id = v_allocation.id
    and manager_user_id = p_user_id;

  insert into public.boarding_manager_bus_assignments (
    allocation_id, manager_user_id, bus_id, assigned_by
  )
  select v_allocation.id, p_user_id, bus_id, auth.uid()
  from (
    select distinct bus_id
    from unnest(coalesce(p_bus_ids, array[]::text[])) bus_id
  ) requested;
end;
$$;


ALTER FUNCTION "public"."set_boarding_manager_bus_assignments_as_global_admin"("p_user_id" "uuid", "p_bus_ids" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_bus_allocation_canonical_totals"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_items jsonb;
begin
  if jsonb_typeof(new.allocation_data) <> 'object' then
    raise exception 'Allocation data must be a JSON object.';
  end if;

  if jsonb_typeof(new.allocation_data -> 'buses') = 'array' then
    v_items := new.allocation_data -> 'buses';
  elsif jsonb_typeof(new.allocation_data -> 'routePlan') = 'array' then
    v_items := new.allocation_data -> 'routePlan';
  else
    raise exception 'Allocation data must contain buses or routePlan.';
  end if;

  select
    coalesce(sum(greatest(coalesce((item ->> 'price')::integer, 0), 0)), 0),
    coalesce(sum(greatest(coalesce((item ->> 'capacity')::integer, 0), 0)), 0)
  into new.total_cost, new.total_capacity
  from jsonb_array_elements(v_items) item;

  return new;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Allocation bus price and capacity must be valid integers.';
end;
$$;


ALTER FUNCTION "public"."set_bus_allocation_canonical_totals"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_campus_request_scope_ids"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.district_id is null
    or new.team_id is null
    or new.campus_id is null
  then
    select
      campus_options.district_id,
      campus_options.team_id,
      campus_options.campus_id
    into
      new.district_id,
      new.team_id,
      new.campus_id
    from campus_options
    where campus_options.district = new.district
      and campus_options.team = new.team
      and campus_options.campus = new.campus
    limit 1;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."set_campus_request_scope_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_campus_requests_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_campus_requests_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_campus_transfer_scope_ids"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.district_id is null
    or new.team_id is null
    or new.campus_id is null
  then
    select
      campus_options.district_id,
      campus_options.team_id,
      campus_options.campus_id
    into
      new.district_id,
      new.team_id,
      new.campus_id
    from campus_options
    where campus_options.district = new.district
      and campus_options.team = new.team
      and campus_options.campus = new.campus
    limit 1;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."set_campus_transfer_scope_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_passenger_boarding_status"("p_reservation_id" "uuid", "p_status" "text", "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_current public.reservations%rowtype;
  v_allocation_id uuid;
  v_bus_id text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can update boarding status.';
  end if;
  if p_status not in ('unchecked', 'boarded', 'no_show') then
    raise exception 'Invalid boarding status.';
  end if;
  if char_length(coalesce(v_reason, '')) > 500 then
    raise exception 'Boarding transition reasons must be 500 characters or fewer.';
  end if;

  select id into v_allocation_id
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';
  if not found then raise exception 'Confirmed allocation not found.'; end if;

  select * into v_current
  from public.reservations
  where id = p_reservation_id
    and status = 'confirmed'
    and confirmed_ticket is not null
  for update;
  if not found then raise exception 'Confirmed passenger not found.'; end if;

  v_bus_id := public.get_confirmed_ticket_bus_id(v_current.id, v_current.confirmed_ticket);
  if not public.can_manage_boarding_bus(v_allocation_id, v_bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;
  if v_current.boarding_status = p_status then return; end if;
  if p_status = 'unchecked' and exists (
    select 1
    from public.boarding_bus_departures departure
    where departure.allocation_id = v_allocation_id
      and departure.bus_id = v_bus_id
      and departure.cancelled_at is null
  ) then
    raise exception 'Departed buses cannot return passengers to unchecked status.';
  end if;
  if v_current.boarding_status = 'no_show' and p_status = 'boarded' and v_reason is null then
    raise exception 'A boarding transition reason is required.';
  end if;
  if p_status = 'no_show' and v_reason is null then
    raise exception 'A no-show reason is required.';
  end if;

  update public.reservations
  set boarding_status = p_status,
      boarding_confirmed_at = case when p_status = 'boarded' then v_now else null end,
      boarding_status_updated_at = v_now,
      boarding_status_updated_by = auth.uid(),
      boarding_no_show_departure_id = null
  where id = p_reservation_id;

  insert into public.boarding_status_events (
    reservation_id, from_status, to_status, actor_id, note
  ) values (
    p_reservation_id,
    v_current.boarding_status,
    p_status,
    auth.uid(),
    case
      when v_reason is not null then 'boarding_status_changed: ' || v_reason
      else 'boarding_status_changed'
    end
  );
end;
$$;


ALTER FUNCTION "public"."set_passenger_boarding_status"("p_reservation_id" "uuid", "p_status" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_reservation_confirmed_ticket_bus_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_bus_id text;
begin
  if new.status <> 'confirmed' or new.confirmed_ticket is null then
    return new;
  end if;

  v_bus_id := public.get_confirmed_ticket_bus_id(new.id, new.confirmed_ticket);
  if v_bus_id is null then
    return new;
  end if;

  new.confirmed_ticket := jsonb_set(
    new.confirmed_ticket,
    '{busId}',
    to_jsonb(v_bus_id),
    true
  );
  new.data := jsonb_set(
    coalesce(new.data, '{}'::jsonb),
    '{confirmedTicket}',
    new.confirmed_ticket,
    true
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."set_reservation_confirmed_ticket_bus_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_walk_in_boarding_status"("p_walk_in_id" "uuid", "p_status" "text", "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_walk_in public.boarding_walk_in_passengers%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can update boarding status.';
  end if;
  if p_status not in ('unchecked', 'boarded', 'no_show') then
    raise exception 'Invalid boarding status.';
  end if;
  if char_length(coalesce(v_reason, '')) > 500 then
    raise exception 'Boarding transition reasons must be 500 characters or fewer.';
  end if;

  select * into v_walk_in
  from public.boarding_walk_in_passengers
  where id = p_walk_in_id
  for update;
  if not found then raise exception 'Walk-in passenger not found.'; end if;
  if not public.can_manage_boarding_bus(v_walk_in.allocation_id, v_walk_in.bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;
  if v_walk_in.boarding_status = p_status then return; end if;
  if p_status = 'unchecked' and exists (
    select 1
    from public.boarding_bus_departures departure
    where departure.allocation_id = v_walk_in.allocation_id
      and departure.bus_id = v_walk_in.bus_id
      and departure.cancelled_at is null
  ) then
    raise exception 'Departed buses cannot return passengers to unchecked status.';
  end if;
  if v_walk_in.boarding_status = 'no_show' and p_status = 'boarded' and v_reason is null then
    raise exception 'A boarding transition reason is required.';
  end if;
  if p_status = 'no_show' and v_reason is null then
    raise exception 'A no-show reason is required.';
  end if;

  update public.boarding_walk_in_passengers
  set boarding_status = p_status,
      boarding_status_updated_by = auth.uid(),
      boarding_status_updated_at = v_now,
      boarding_no_show_departure_id = null,
      boarding_note = case
        when v_reason is not null then concat_ws(
          E'\n',
          nullif(boarding_note, ''),
          '[탑승 전환 사유] ' || v_reason
        )
        else boarding_note
      end,
      updated_at = v_now
  where id = p_walk_in_id;
end;
$$;


ALTER FUNCTION "public"."set_walk_in_boarding_status"("p_walk_in_id" "uuid", "p_status" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."store_allocation_workspace_version"("p_allocation_id" "uuid", "p_revision" bigint, "p_allocation_data" "jsonb", "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.allocation_workspace_versions (
    id,
    allocation_id,
    revision,
    label,
    actor_id,
    changes,
    snapshot
  )
  values (
    p_version_id,
    p_allocation_id,
    p_revision,
    p_version_label,
    auth.uid()::text,
    coalesce(p_version_changes, '[]'::jsonb),
    jsonb_build_object(
      'buses', coalesce(p_allocation_data -> 'buses', '[]'::jsonb),
      'passengers', coalesce(p_allocation_data -> 'passengers', '[]'::jsonb)
    )
  );

  perform public.prune_allocation_workspace_versions(p_allocation_id);
end;
$$;


ALTER FUNCTION "public"."store_allocation_workspace_version"("p_allocation_id" "uuid", "p_revision" bigint, "p_allocation_data" "jsonb", "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_boarding_check_in_code"("p_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_user_id uuid := auth.uid();
  v_code text := trim(coalesce(p_code, ''));
  v_reservation public.reservations%rowtype;
  v_allocation public.bus_allocations%rowtype;
  v_attempt public.boarding_check_in_attempts%rowtype;
  v_bus_id text;
  v_failed_attempts integer;
  v_locked_until timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;

  select * into v_reservation
  from public.reservations
  where user_id = v_user_id
    and status = 'confirmed'
    and confirmed_ticket is not null
  for update;
  if not found then raise exception 'A confirmed ticket is required before check-in.'; end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';
  if not found then raise exception 'Confirmed allocation not found.'; end if;

  v_bus_id := public.get_confirmed_ticket_bus_id(
    v_reservation.id,
    v_reservation.confirmed_ticket
  );
  if v_bus_id is null then raise exception 'Assigned bus not found.'; end if;

  if exists (
    select 1 from public.boarding_bus_departures
    where allocation_id = v_allocation.id
      and bus_id = v_bus_id
      and cancelled_at is null
  ) then
    raise exception 'This bus has already departed.';
  end if;

  insert into public.boarding_check_in_attempts (
    allocation_id, reservation_id
  ) values (
    v_allocation.id, v_reservation.id
  )
  on conflict (allocation_id, reservation_id) do nothing;

  select * into v_attempt
  from public.boarding_check_in_attempts
  where allocation_id = v_allocation.id
    and reservation_id = v_reservation.id
  for update;

  if v_attempt.locked_until is not null and v_attempt.locked_until > v_now then
    return jsonb_build_object(
      'success', false,
      'errorCode', 'LOCKED',
      'message', 'Too many incorrect check-in code attempts. Try again later.',
      'lockedUntil', v_attempt.locked_until
    );
  end if;

  if v_code !~ '^[0-9]{4}$' or not exists (
    select 1 from public.boarding_check_in_codes
    where allocation_id = v_allocation.id
      and bus_id = v_bus_id
      and check_in_code = v_code
      and expires_at > v_now
  ) then
    v_failed_attempts := case
      when v_attempt.locked_until is not null and v_attempt.locked_until <= v_now then 1
      else v_attempt.failed_attempts + 1
    end;
    v_locked_until := case
      when v_failed_attempts >= 5 then v_now + interval '15 minutes'
      else null
    end;

    update public.boarding_check_in_attempts
    set
      failed_attempts = v_failed_attempts,
      locked_until = v_locked_until,
      last_failed_at = v_now,
      updated_at = v_now
    where allocation_id = v_allocation.id
      and reservation_id = v_reservation.id;

    return jsonb_build_object(
      'success', false,
      'errorCode', case when v_locked_until is null then 'INVALID_CODE' else 'LOCKED' end,
      'message', case
        when v_locked_until is null then 'The check-in code is incorrect or expired.'
        else 'Too many incorrect check-in code attempts. Try again later.'
      end,
      'remainingAttempts', greatest(0, 5 - v_failed_attempts),
      'lockedUntil', v_locked_until
    );
  end if;

  delete from public.boarding_check_in_attempts
  where allocation_id = v_allocation.id
    and reservation_id = v_reservation.id;

  if v_reservation.boarding_status <> 'boarded' then
    update public.reservations
    set boarding_status = 'boarded',
        boarding_confirmed_at = v_now,
        boarding_status_updated_at = v_now,
        boarding_status_updated_by = v_user_id,
        boarding_no_show_departure_id = null
    where id = v_reservation.id;

    insert into public.boarding_status_events (
      reservation_id, from_status, to_status, actor_id, note
    ) values (
      v_reservation.id, v_reservation.boarding_status, 'boarded', v_user_id,
      'passenger_check_in_code'
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'confirmedAt', coalesce(v_reservation.boarding_confirmed_at, v_now)
  );
end;
$_$;


ALTER FUNCTION "public"."submit_boarding_check_in_code"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_admin_role_organization_scope"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.role <> 'campus_admin' then
    new.district_id := null;
    new.district := null;
    new.team_id := null;
    new.team := null;
    new.campus_id := null;
    new.campus := null;
    return new;
  end if;

  select
    district.id,
    district.name,
    team.id,
    team.name,
    campus.name
  into
    new.district_id,
    new.district,
    new.team_id,
    new.team,
    new.campus
  from public.campuses campus
  join public.teams team on team.id = campus.team_id
  join public.districts district on district.id = team.district_id
  where campus.id = new.campus_id;

  if not found then
    raise exception 'Campus admin roles require a valid campus_id.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_admin_role_organization_scope"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_campus_request_organization_scope"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.is_global_notice then
    new.district_id := null;
    new.district := '';
    new.team_id := null;
    new.team := '';
    new.campus_id := null;
    new.campus := '';
    return new;
  end if;

  select district.id, district.name, team.id, team.name, campus.name
  into new.district_id, new.district, new.team_id, new.team, new.campus
  from public.campuses campus
  join public.teams team on team.id = campus.team_id
  join public.districts district on district.id = team.district_id
  where campus.id = new.campus_id;

  if not found then
    raise exception 'Campus requests require a valid campus_id.';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."sync_campus_request_organization_scope"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_profile_organization_scope"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.affiliation_type = 'external' then
    new.district_id := null;
    new.team_id := null;
    new.campus_id := null;
    return new;
  end if;

  if new.district_id is null
    and nullif(trim(new.district), '') is null
    and new.team_id is null
    and nullif(trim(new.team), '') is null
    and new.campus_id is null
    and nullif(trim(new.campus), '') is null then
    return new;
  end if;

  select
    district.id,
    district.name,
    team.id,
    team.name,
    campus.name
  into
    new.district_id,
    new.district,
    new.team_id,
    new.team,
    new.campus
  from public.campuses campus
  join public.teams team on team.id = campus.team_id
  join public.districts district on district.id = team.district_id
  where campus.id = new.campus_id;

  if not found then
    raise exception 'Scoped Seoul profiles require a valid campus_id.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_profile_organization_scope"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_reservation_canonical_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.status <> 'confirmed' then
    new.confirmed_ticket := null;
  end if;

  new.data := jsonb_set(
    coalesce(new.data, '{}'::jsonb),
    '{status}',
    to_jsonb(new.status),
    true
  );

  if new.confirmed_ticket is null then
    new.data := new.data - 'confirmedTicket';
  else
    new.data := jsonb_set(
      new.data,
      '{confirmedTicket}',
      new.confirmed_ticket,
      true
    );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_reservation_canonical_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_reservation_data_from_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.data := (
    case
      when jsonb_typeof(new.data) = 'object' then new.data
      else '{}'::jsonb
    end
  ) || jsonb_build_object(
    'id', new.id::text,
    'name', new.name,
    'phone', new.phone,
    'district', new.district,
    'team', new.team,
    'campus', new.campus,
    'affiliationType', new.affiliation_type,
    'coordinatorName', new.coordinator_name,
    'coordinatorPhone', new.coordinator_phone,
    'stationPreferences', coalesce(new.station_preferences, '[]'::jsonb),
    'status', new.status,
    'confirmedTicket', new.confirmed_ticket,
    'boardingConfirmedAt', new.boarding_confirmed_at,
    'requestedAt', new.created_at::text,
    'updatedAt', new.updated_at::text
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_reservation_data_from_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_reservation_organization_scope"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.affiliation_type = 'external'
    or (
      new.campus_id is null
      and exists (
        select 1
        from public.profiles profile
        where profile.id = new.user_id
          and profile.affiliation_type = 'external'
      )
    ) then
    new.affiliation_type := 'external';
    new.district_id := null;
    new.team_id := null;
    new.campus_id := null;
    return new;
  end if;

  select
    district.id,
    district.name,
    team.id,
    team.name,
    campus.name
  into
    new.district_id,
    new.district,
    new.team_id,
    new.team,
    new.campus
  from public.campuses campus
  join public.teams team on team.id = campus.team_id
  join public.districts district on district.id = team.district_id
  where campus.id = new.campus_id;

  if not found then
    raise exception 'Seoul reservations require a valid campus_id.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_reservation_organization_scope"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_report_log_settings" (
    "id" boolean DEFAULT true NOT NULL,
    "include_navigation" boolean DEFAULT true NOT NULL,
    "include_authentication" boolean DEFAULT true NOT NULL,
    "include_data_changes" boolean DEFAULT true NOT NULL,
    "include_admin_audit" boolean DEFAULT true NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    CONSTRAINT "ai_report_log_settings_id_check" CHECK ("id")
);


ALTER TABLE "public"."ai_report_log_settings" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_ai_report_log_settings"("p_include_navigation" boolean, "p_include_authentication" boolean, "p_include_data_changes" boolean, "p_include_admin_audit" boolean) RETURNS "public"."ai_report_log_settings"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_settings public.ai_report_log_settings;
begin
  if not public.is_global_admin() then
    raise exception 'Global administrator access is required.';
  end if;

  insert into public.ai_report_log_settings (
    id,
    include_navigation,
    include_authentication,
    include_data_changes,
    include_admin_audit,
    updated_by,
    updated_at
  )
  values (
    true,
    coalesce(p_include_navigation, false),
    coalesce(p_include_authentication, false),
    coalesce(p_include_data_changes, false),
    coalesce(p_include_admin_audit, false),
    auth.uid(),
    clock_timestamp()
  )
  on conflict (id) do update
  set include_navigation = excluded.include_navigation,
      include_authentication = excluded.include_authentication,
      include_data_changes = excluded.include_data_changes,
      include_admin_audit = excluded.include_admin_audit,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  returning * into v_settings;

  return v_settings;
end;
$$;


ALTER FUNCTION "public"."update_ai_report_log_settings"("p_include_navigation" boolean, "p_include_authentication" boolean, "p_include_data_changes" boolean, "p_include_admin_audit" boolean) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "key" "text" NOT NULL,
    "value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_app_setting_as_global_admin"("p_key" "text", "p_value" "jsonb") RETURNS "public"."app_settings"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row public.app_settings;
  v_opens_at timestamptz;
  v_deadline_at timestamptz;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can update app settings.'; end if;
  if p_key not in (
    'first_reservation_deadline',
    'seoul_district_transfer_account',
    'participation_targets',
    'global_scenario_checklist',
    'simulation_enabled',
    'public_contact_info'
  ) then raise exception 'Setting key is not editable through this RPC.'; end if;
  if jsonb_typeof(p_value) <> 'object' then raise exception 'Setting value must be a JSON object.'; end if;

  if p_key = 'first_reservation_deadline' then
    v_opens_at := nullif(p_value ->> 'opens_at', '')::timestamptz;
    v_deadline_at := nullif(p_value ->> 'deadline_at', '')::timestamptz;

    if v_opens_at is not null and v_deadline_at is not null and v_opens_at >= v_deadline_at then
      raise exception 'Reservation opening time must be before the deadline.';
    end if;

    perform pg_advisory_xact_lock(hashtextextended('allocation-confirmation', 0));
    if (v_deadline_at is null or v_deadline_at > clock_timestamp())
      and exists (
        select 1
        from public.bus_allocations
        where allocation_data ->> 'status' = 'confirmed'
      ) then
      raise exception 'Cancel the confirmed allocation before reopening reservations.';
    end if;
  elsif p_key = 'seoul_district_transfer_account'
    and jsonb_typeof(p_value -> 'account_number') <> 'string' then
    raise exception 'Account number must be a string.';
  elsif p_key = 'participation_targets'
    and (jsonb_typeof(p_value -> 'rows') <> 'array' or jsonb_typeof(p_value -> 'targets') <> 'object') then
    raise exception 'Invalid participation targets.';
  elsif p_key = 'global_scenario_checklist'
    and jsonb_typeof(p_value -> 'checked_step_ids') <> 'array' then
    raise exception 'Invalid scenario checklist.';
  elsif p_key = 'simulation_enabled'
    and jsonb_typeof(p_value -> 'enabled') <> 'boolean' then
    raise exception 'Simulation enabled must be boolean.';
  elsif p_key = 'public_contact_info'
    and (
      jsonb_typeof(p_value -> 'email') <> 'string'
      or jsonb_typeof(p_value -> 'phone') <> 'string'
      or length(p_value ->> 'email') > 254
      or length(p_value ->> 'phone') > 50
    ) then
    raise exception 'Invalid public contact info.';
  end if;

  insert into public.app_settings (key, value, updated_at)
  values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;


ALTER FUNCTION "public"."update_app_setting_as_global_admin"("p_key" "text", "p_value" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_boarding_exception_reason"("p_record_key" "text", "p_allocation_id" "uuid", "p_bus_id" "text", "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_previous_reason text;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding administrators can update boarding exception reasons';
  end if;
  if nullif(btrim(coalesce(p_record_key, '')), '') is null
    or nullif(btrim(coalesce(p_bus_id, '')), '') is null
    or nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A boarding exception record and reason are required';
  end if;
  if not public.can_manage_boarding_bus(p_allocation_id, p_bus_id) then
    raise exception 'You are not assigned to this bus';
  end if;
  if not (
    (
      p_record_key like p_allocation_id::text || ':walk-in:%'
      and exists (
        select 1 from public.boarding_walk_in_passengers walk_in
        where walk_in.id::text = split_part(p_record_key, ':walk-in:', 2)
          and walk_in.allocation_id = p_allocation_id
          and walk_in.bus_id = p_bus_id
      )
    )
    or (
      p_record_key like p_allocation_id::text || ':event:%'
      and exists (
        select 1
        from public.boarding_status_events event
        join public.reservations reservation on reservation.id = event.reservation_id
        where event.id::text = split_part(p_record_key, ':event:', 2)
          and public.get_confirmed_ticket_bus_id(
            reservation.id, reservation.confirmed_ticket
          ) = p_bus_id
          and exists (
            select 1
            from public.bus_allocations allocation
            cross join lateral jsonb_array_elements(
              allocation.allocation_data -> 'passengers'
            ) passenger
            where allocation.id = p_allocation_id
              and passenger ->> 'reservationId' = reservation.id::text
              and passenger ->> 'busId' = p_bus_id
          )
      )
    )
    or (
      p_record_key like p_allocation_id::text || ':current-no-show:%'
      and exists (
        select 1
        from public.reservations reservation
        where reservation.id::text = split_part(p_record_key, ':current-no-show:', 2)
          and reservation.boarding_status = 'no_show'
          and public.get_confirmed_ticket_bus_id(
            reservation.id, reservation.confirmed_ticket
          ) = p_bus_id
          and exists (
            select 1
            from public.bus_allocations allocation
            cross join lateral jsonb_array_elements(
              allocation.allocation_data -> 'passengers'
            ) passenger
            where allocation.id = p_allocation_id
              and passenger ->> 'reservationId' = reservation.id::text
              and passenger ->> 'busId' = p_bus_id
          )
      )
    )
    or (
      p_record_key like p_allocation_id::text || ':manual:%'
      and exists (
        select 1
        from public.manual_boarding_exception_records record
        where record.id::text = split_part(p_record_key, ':manual:', 2)
          and record.allocation_id = p_allocation_id
          and record.bus_id = p_bus_id
      )
    )
  ) then
    raise exception 'The boarding exception record does not belong to this bus';
  end if;

  select reason into v_previous_reason
  from public.boarding_exception_reason_edits
  where record_key = btrim(p_record_key)
  for update;

  insert into public.boarding_exception_reason_edits (
    record_key, allocation_id, bus_id, reason, updated_by
  ) values (
    btrim(p_record_key), p_allocation_id, btrim(p_bus_id), btrim(p_reason), auth.uid()
  )
  on conflict (record_key) do update
  set allocation_id = excluded.allocation_id,
      bus_id = excluded.bus_id,
      reason = excluded.reason,
      updated_at = clock_timestamp(),
      updated_by = auth.uid();

  insert into public.boarding_exception_reason_edit_logs (
    record_key, allocation_id, bus_id, previous_reason, next_reason, edited_by
  ) values (
    btrim(p_record_key), p_allocation_id, btrim(p_bus_id),
    v_previous_reason, btrim(p_reason), auth.uid()
  );
end;
$$;


ALTER FUNCTION "public"."update_boarding_exception_reason"("p_record_key" "text", "p_allocation_id" "uuid", "p_bus_id" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_bus_ticket_price"("p_price" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_price integer := greatest(coalesce(p_price, 0), 0);
begin
  if not exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  ) then
    raise exception 'Only global admins can update bus ticket price.';
  end if;

  insert into app_settings (key, value, updated_at)
  values ('bus_ticket_price', jsonb_build_object('price', v_price), now())
  on conflict (key)
  do update set
    value = excluded.value,
    updated_at = now();

  return v_price;
end;
$$;


ALTER FUNCTION "public"."update_bus_ticket_price"("p_price" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_campus_request_status_with_response"("p_request_id" "uuid", "p_status" "text", "p_admin_response" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_previous_response text;
  v_response text := nullif(btrim(coalesce(p_admin_response, '')), '');
  v_request public.campus_requests%rowtype;
  v_message public.campus_request_messages%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.';
  end if;
  if not public.is_global_admin() then
    raise exception 'Only global administrators can process campus requests.';
  end if;
  if p_status not in ('open', 'in_progress', 'resolved', 'on_hold') then
    raise exception 'Campus request status is invalid.';
  end if;

  select request.admin_response
  into v_previous_response
  from public.campus_requests request
  where request.id = p_request_id
    and request.is_global_notice = false
  for update;

  if not found then
    raise exception 'Campus request not found.';
  end if;
  if p_status = 'resolved'
    and v_response is null
    and not exists (
      select 1
      from public.campus_request_messages message
      where message.request_id = p_request_id
        and message.sender_role = 'global_admin'
    )
  then
    raise exception 'A global administrator response is required before resolving a request.';
  end if;

  update public.campus_requests
  set
    status = p_status,
    admin_response = v_response,
    handled_by = v_actor_id,
    handled_at = case when p_status = 'resolved' then clock_timestamp() else null end,
    updated_at = clock_timestamp()
  where id = p_request_id
  returning * into v_request;

  if v_request.status is distinct from p_status then
    raise exception 'Campus request status update failed.';
  end if;

  if v_response is not null
    and v_response is distinct from nullif(btrim(coalesce(v_previous_response, '')), '')
  then
    insert into public.campus_request_messages (
      request_id,
      sender_id,
      sender_role,
      message
    )
    values (
      p_request_id,
      v_actor_id,
      'global_admin',
      v_response
    )
    returning * into v_message;
  end if;

  return jsonb_build_object(
    'request', to_jsonb(v_request),
    'message', case when v_message.id is null then null else to_jsonb(v_message) end
  );
end;
$$;


ALTER FUNCTION "public"."update_campus_request_status_with_response"("p_request_id" "uuid", "p_status" "text", "p_admin_response" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_home_announcement_as_global_admin"("p_id" "uuid", "p_title" "text", "p_content" "text", "p_is_published" boolean, "p_is_archived" boolean, "p_is_pinned" boolean, "p_publish_start_at" timestamp with time zone, "p_publish_end_at" timestamp with time zone) RETURNS "public"."home_announcements"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_row public.home_announcements;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can update home announcements.'; end if;
  update public.home_announcements
  set title = trim(p_title),
      content = trim(p_content),
      is_published = p_is_published,
      is_archived = p_is_archived,
      is_pinned = p_is_pinned,
      publish_start_at = p_publish_start_at,
      publish_end_at = p_publish_end_at,
      updated_at = now()
  where id = p_id
  returning * into v_row;
  if v_row.id is null then raise exception 'Home announcement not found.'; end if;
  return v_row;
end;
$$;


ALTER FUNCTION "public"."update_home_announcement_as_global_admin"("p_id" "uuid", "p_title" "text", "p_content" "text", "p_is_published" boolean, "p_is_archived" boolean, "p_is_pinned" boolean, "p_publish_start_at" timestamp with time zone, "p_publish_end_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_operation_closeout"("p_closed" boolean, "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_before jsonb;
  v_after jsonb;
  v_actor_name text;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can update operation closeout.';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'A closeout reason is required.';
  end if;

  select value into v_before
  from public.app_settings
  where key = 'operation_closeout'
  for update;

  select coalesce(nullif(trim(profile.name), ''), profile.email, '관리자')
  into v_actor_name
  from public.profiles profile
  where profile.id = auth.uid();

  if p_closed then
    v_after := jsonb_build_object(
      'closed', true,
      'closed_at', clock_timestamp(),
      'closed_by', auth.uid(),
      'closed_by_name', coalesce(v_actor_name, '관리자'),
      'reason', trim(p_reason),
      'reopened_at', null,
      'reopened_by', null,
      'reopened_by_name', null
    );
  else
    v_after := jsonb_build_object(
      'closed', false,
      'closed_at', v_before -> 'closed_at',
      'closed_by', v_before -> 'closed_by',
      'closed_by_name', v_before -> 'closed_by_name',
      'reason', trim(p_reason),
      'reopened_at', clock_timestamp(),
      'reopened_by', auth.uid(),
      'reopened_by_name', coalesce(v_actor_name, '관리자')
    );
  end if;

  insert into public.app_settings (key, value, updated_at)
  values ('operation_closeout', v_after, clock_timestamp())
  on conflict (key) do update
  set value = excluded.value, updated_at = excluded.updated_at;

  insert into public.admin_action_audit_logs (
    actor_id, action, resource_type, resource_id, before_data, after_data
  )
  values (
    auth.uid(), 'update', 'operation_closeout', null,
    coalesce(v_before, '{"closed":false}'::jsonb), v_after
  );

  return v_after;
end;
$$;


ALTER FUNCTION "public"."update_operation_closeout"("p_closed" boolean, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_passenger_boarding_note"("p_reservation_id" "uuid", "p_note" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can update boarding notes.';
  end if;
  if char_length(coalesce(v_note, '')) > 500 then
    raise exception 'Boarding notes must be 500 characters or fewer.';
  end if;
  if not public.can_manage_boarding_reservation(p_reservation_id) then
    raise exception 'You are not assigned to this bus.';
  end if;

  update public.reservations
  set boarding_note = v_note,
      boarding_note_updated_at = clock_timestamp(),
      boarding_note_updated_by = auth.uid()
  where id = p_reservation_id
    and status = 'confirmed'
    and confirmed_ticket is not null;

  if not found then raise exception 'Confirmed passenger not found.'; end if;
end;
$$;


ALTER FUNCTION "public"."update_passenger_boarding_note"("p_reservation_id" "uuid", "p_note" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reservations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "district" "text" DEFAULT '서울지구'::"text",
    "team" "text" NOT NULL,
    "campus" "text" NOT NULL,
    "station_preferences" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'requested'::"text" NOT NULL,
    "confirmed_ticket" "jsonb",
    "data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "district_id" "uuid",
    "team_id" "uuid",
    "campus_id" "uuid",
    "boarding_confirmed_at" timestamp with time zone,
    "boarding_status" "text" DEFAULT 'unchecked'::"text" NOT NULL,
    "boarding_status_updated_at" timestamp with time zone,
    "boarding_status_updated_by" "uuid",
    "boarding_no_show_departure_id" "uuid",
    "boarding_note" "text",
    "boarding_note_updated_at" timestamp with time zone,
    "boarding_note_updated_by" "uuid",
    "affiliation_type" "text" DEFAULT 'seoul'::"text" NOT NULL,
    "coordinator_name" "text",
    "coordinator_phone" "text",
    CONSTRAINT "reservations_affiliation_type_check" CHECK (("affiliation_type" = ANY (ARRAY['seoul'::"text", 'external'::"text"]))),
    CONSTRAINT "reservations_boarding_status_check" CHECK (("boarding_status" = ANY (ARRAY['unchecked'::"text", 'boarded'::"text", 'no_show'::"text"]))),
    CONSTRAINT "reservations_status_check" CHECK (("status" = ANY (ARRAY['requested'::"text", 'confirmed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."reservations" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_personal_ticket_as_admin"("p_reservation_id" "uuid", "p_next_status" "text", "p_ticket" "jsonb" DEFAULT NULL::"jsonb") RETURNS SETOF "public"."reservations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_now timestamptz := clock_timestamp();
  v_actor_id uuid := auth.uid();
  v_reservation public.reservations%rowtype;
  v_allocation public.bus_allocations%rowtype;
  v_target_allocation_id uuid;
  v_target_bus jsonb;
  v_bus_match_count integer := 0;
  v_seat_number integer;
  v_preferences jsonb;
  v_passenger jsonb;
  v_passengers jsonb;
  v_ticket jsonb;
  v_action text;
begin
  if v_actor_id is null or not public.is_global_admin() then
    raise exception 'Only global admins can manage personal tickets.';
  end if;

  if p_next_status not in ('requested', 'confirmed', 'cancelled') then
    raise exception 'Invalid reservation status.';
  end if;

  select *
  into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'Reservation not found.';
  end if;

  -- Serialize all personal-ticket changes with confirmed allocation changes.
  perform 1
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed'
  for update;

  if p_next_status = 'confirmed' then
    if jsonb_typeof(coalesce(p_ticket, 'null'::jsonb)) <> 'object'
      or nullif(btrim(p_ticket ->> 'busNumber'), '') is null
      or coalesce(p_ticket ->> 'seatNumber', '') !~ '^[1-9][0-9]*$' then
      raise exception 'A valid bus and seat number are required.';
    end if;

    v_seat_number := (p_ticket ->> 'seatNumber')::integer;

    select count(*)
    into v_bus_match_count
    from public.bus_allocations allocation
    cross join lateral jsonb_array_elements(
      coalesce(allocation.allocation_data -> 'buses', '[]'::jsonb)
    ) bus
    where allocation.allocation_data ->> 'status' = 'confirmed'
      and bus ->> 'label' = btrim(p_ticket ->> 'busNumber');

    if v_bus_match_count = 0 then
      raise exception 'The selected bus does not exist in the confirmed allocation.';
    end if;
    if v_bus_match_count > 1 then
      raise exception 'The selected bus name is duplicated in confirmed allocations.';
    end if;

    select allocation.id, bus
    into v_target_allocation_id, v_target_bus
    from public.bus_allocations allocation
    cross join lateral jsonb_array_elements(
      coalesce(allocation.allocation_data -> 'buses', '[]'::jsonb)
    ) bus
    where allocation.allocation_data ->> 'status' = 'confirmed'
      and bus ->> 'label' = btrim(p_ticket ->> 'busNumber')
    limit 1;

    if coalesce(v_target_bus ->> 'capacity', '') !~ '^[1-9][0-9]*$'
      or v_seat_number > (v_target_bus ->> 'capacity')::integer then
      raise exception 'The selected seat number exceeds the bus capacity.';
    end if;

    if exists (
      select 1
      from public.bus_allocations allocation
      cross join lateral jsonb_array_elements(
        coalesce(allocation.allocation_data -> 'passengers', '[]'::jsonb)
      ) passenger
      where allocation.id = v_target_allocation_id
        and passenger ->> 'reservationId' <> p_reservation_id::text
        and passenger ->> 'busId' = v_target_bus ->> 'id'
        and passenger ->> 'seatNumber' = v_seat_number::text
    ) then
      raise exception 'The selected seat number is already assigned.';
    end if;

    select coalesce(
      jsonb_agg(preference -> 'station' ->> 'name' order by (preference ->> 'rank')::integer),
      '[]'::jsonb
    )
    into v_preferences
    from jsonb_array_elements(coalesce(v_reservation.station_preferences, '[]'::jsonb))
      preference;

    v_passenger := jsonb_build_object(
      'reservationId', p_reservation_id::text,
      'name', coalesce(v_reservation.name, '-'),
      'phone', coalesce(v_reservation.phone, '-'),
      'campus', coalesce(v_reservation.campus, '-'),
      'team', coalesce(v_reservation.team, '-'),
      'preferences', v_preferences,
      'busId', v_target_bus ->> 'id',
      'seatNumber', v_seat_number
    );

    v_ticket := jsonb_strip_nulls(jsonb_build_object(
      'busNumber', v_target_bus ->> 'label',
      'seatNumber', v_seat_number::text,
      'departureTime', v_target_bus ->> 'departureTime',
      'boardingPlace', v_target_bus ->> 'boardingPlace',
      'dropoffStation', v_target_bus ->> 'destination',
      'managerNote', nullif(btrim(p_ticket ->> 'managerNote'), ''),
      'confirmedAt', coalesce(
        nullif(v_reservation.confirmed_ticket ->> 'confirmedAt', ''),
        v_now::text
      )
    ));
    v_action := 'personal_ticket_confirmed';
  elsif p_next_status = 'cancelled' then
    v_action := 'personal_ticket_reservation_cancelled';
  else
    v_action := 'personal_ticket_cleared';
  end if;

  for v_allocation in
    select allocation.*
    from public.bus_allocations allocation
    where allocation.allocation_data ->> 'status' = 'confirmed'
      and (
        allocation.id = v_target_allocation_id
        or exists (
          select 1
          from jsonb_array_elements(
            coalesce(allocation.allocation_data -> 'passengers', '[]'::jsonb)
          ) passenger
          where passenger ->> 'reservationId' = p_reservation_id::text
        )
      )
  loop
    select coalesce(jsonb_agg(passenger.value order by passenger.ordinality), '[]'::jsonb)
    into v_passengers
    from jsonb_array_elements(
      coalesce(v_allocation.allocation_data -> 'passengers', '[]'::jsonb)
    ) with ordinality passenger(value, ordinality)
    where passenger.value ->> 'reservationId' <> p_reservation_id::text;

    if p_next_status = 'confirmed' and v_allocation.id = v_target_allocation_id then
      v_passengers := v_passengers || jsonb_build_array(v_passenger);
    end if;

    update public.bus_allocations
    set
      allocation_data = jsonb_set(
        jsonb_set(
          v_allocation.allocation_data,
          '{passengers}',
          v_passengers,
          true
        ),
        '{history}',
        coalesce(v_allocation.allocation_data -> 'history', '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object(
            'id', 'history-' || gen_random_uuid()::text,
            'at', v_now::text,
            'actorId', v_actor_id::text,
            'action', v_action,
            'detail', coalesce(v_reservation.name, p_reservation_id::text)
              || ' personal ticket was synchronized.'
          )),
        true
      ),
      updated_at = v_now,
      revision = revision + 1
    where id = v_allocation.id;
  end loop;

  update public.reservations
  set
    status = p_next_status,
    confirmed_ticket = case when p_next_status = 'confirmed' then v_ticket else null end,
    data = jsonb_set(
      coalesce(data, '{}'::jsonb),
      '{updatedAt}',
      to_jsonb(v_now::text),
      true
    ),
    updated_at = v_now
  where id = p_reservation_id;

  return query
  select *
  from public.reservations
  where id = p_reservation_id;
end;
$_$;


ALTER FUNCTION "public"."update_personal_ticket_as_admin"("p_reservation_id" "uuid", "p_next_status" "text", "p_ticket" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_personal_user_info"("p_target_user_id" "uuid", "p_reservation_id" "uuid", "p_name" "text", "p_phone" "text", "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_before jsonb;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can update personal user information.'; end if;
  if nullif(btrim(p_name), '') is null or v_phone !~ '^01[016789][0-9]{7,8}$' then raise exception 'A valid name and phone are required.'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'A reason is required.'; end if;
  if exists (
    select 1 from public.profiles
    where id <> p_target_user_id and regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = v_phone
  ) then raise exception 'Another user already uses this phone number.'; end if;

  select jsonb_build_object('name', name, 'phone', phone) into v_before
  from public.profiles where id = p_target_user_id for update;

  update public.profiles
  set name = btrim(p_name), phone = v_phone, updated_at = clock_timestamp()
  where id = p_target_user_id;
  if p_reservation_id is not null then
    update public.reservations
    set name = btrim(p_name), phone = v_phone,
      data = jsonb_set(jsonb_set(coalesce(data, '{}'::jsonb), '{name}', to_jsonb(btrim(p_name)), true), '{phone}', to_jsonb(v_phone), true),
      updated_at = clock_timestamp()
    where id = p_reservation_id and user_id = p_target_user_id;
  end if;

  insert into public.personal_user_action_logs (
    target_user_id, reservation_id, actor_id, action, reason, before_data, after_data, reversible
  ) values (
    p_target_user_id, p_reservation_id, auth.uid(), 'user_info_updated', btrim(p_reason),
    v_before, jsonb_build_object('name', btrim(p_name), 'phone', v_phone), false
  );
end;
$_$;


ALTER FUNCTION "public"."update_personal_user_info"("p_target_user_id" "uuid", "p_reservation_id" "uuid", "p_name" "text", "p_phone" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_personal_user_organization"("p_target_user_id" "uuid", "p_reservation_id" "uuid", "p_campus_id" "uuid", "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_before jsonb;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can update personal user organization.'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'A reason is required.'; end if;
  select to_jsonb(profile) into v_before from public.profiles profile where id = p_target_user_id for update;

  update public.profiles set campus_id = p_campus_id, updated_at = clock_timestamp() where id = p_target_user_id;
  if p_reservation_id is not null then
    update public.reservations set campus_id = p_campus_id, updated_at = clock_timestamp()
    where id = p_reservation_id and user_id = p_target_user_id;
  end if;

  insert into public.personal_user_action_logs (
    target_user_id, reservation_id, actor_id, action, reason, before_data, after_data, reversible
  )
  select p_target_user_id, p_reservation_id, auth.uid(), 'organization_updated', btrim(p_reason),
    jsonb_build_object('district', v_before ->> 'district', 'team', v_before ->> 'team', 'campus', v_before ->> 'campus', 'campusId', v_before ->> 'campus_id'),
    jsonb_build_object('district', profile.district, 'team', profile.team, 'campus', profile.campus, 'campusId', profile.campus_id),
    true
  from public.profiles profile where profile.id = p_target_user_id;
end;
$$;


ALTER FUNCTION "public"."update_personal_user_organization"("p_target_user_id" "uuid", "p_reservation_id" "uuid", "p_campus_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_remaining_seat_sales_settings"("p_enabled" boolean, "p_hidden_bus_ids" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_value jsonb;
begin
  if not exists (
    select 1 from public.admin_roles where user_id = auth.uid() and role = 'global_admin'
  ) then raise exception 'Only global admins can update remaining seat sales settings.'; end if;
  if jsonb_typeof(coalesce(p_hidden_bus_ids, '[]'::jsonb)) <> 'array' then
    raise exception 'Hidden bus ids must be an array.';
  end if;

  v_value := jsonb_build_object('enabled', coalesce(p_enabled, false), 'hidden_bus_ids', coalesce(p_hidden_bus_ids, '[]'::jsonb));
  insert into public.app_settings (key, value, updated_at)
  values ('remaining_seat_sales', v_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return v_value;
end;
$$;


ALTER FUNCTION "public"."update_remaining_seat_sales_settings"("p_enabled" boolean, "p_hidden_bus_ids" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_targeted_campus_notice"("p_notice_id" "uuid", "p_title" "text", "p_content" "text", "p_targets" "jsonb", "p_archived" boolean DEFAULT false) RETURNS "public"."campus_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_notice public.campus_requests;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can update campus notices.';
  end if;

  update public.campus_requests
  set title = trim(p_title),
      content = trim(p_content),
      is_archived = p_archived,
      updated_at = now()
  where id = p_notice_id and is_global_notice = true
  returning * into v_notice;

  if v_notice.id is null then raise exception 'Campus notice not found.'; end if;

  delete from public.campus_notice_targets where notice_id = p_notice_id;
  insert into public.campus_notice_targets (notice_id, district, team, campus)
  select distinct p_notice_id, trim(target ->> 'district'), trim(target ->> 'team'), trim(target ->> 'campus')
  from jsonb_array_elements(p_targets) target
  where nullif(trim(target ->> 'district'), '') is not null
    and nullif(trim(target ->> 'team'), '') is not null
    and nullif(trim(target ->> 'campus'), '') is not null;

  delete from public.campus_notice_reads where notice_id = p_notice_id;
  return v_notice;
end;
$$;


ALTER FUNCTION "public"."update_targeted_campus_notice"("p_notice_id" "uuid", "p_title" "text", "p_content" "text", "p_targets" "jsonb", "p_archived" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_walk_in_boarding_note"("p_walk_in_id" "uuid", "p_note" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_walk_in public.boarding_walk_in_passengers%rowtype;
begin
  if char_length(coalesce(p_note, '')) > 500 then
    raise exception 'Boarding notes must be 500 characters or fewer.';
  end if;
  select * into v_walk_in
  from public.boarding_walk_in_passengers
  where id = p_walk_in_id;
  if not found then raise exception 'Walk-in passenger not found.'; end if;
  if not public.can_manage_boarding_bus(v_walk_in.allocation_id, v_walk_in.bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;

  update public.boarding_walk_in_passengers
  set boarding_note = nullif(btrim(coalesce(p_note, '')), ''),
      updated_at = clock_timestamp()
  where id = p_walk_in_id;
end;
$$;


ALTER FUNCTION "public"."update_walk_in_boarding_note"("p_walk_in_id" "uuid", "p_note" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bus_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "capacity" integer NOT NULL,
    "estimated_price" integer DEFAULT 0 NOT NULL,
    "max_count" integer DEFAULT 999 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "bus_options_max_count_check" CHECK (("max_count" > 0)),
    CONSTRAINT "bus_options_max_count_positive" CHECK (("max_count" > 0))
);


ALTER TABLE "public"."bus_options" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_bus_option_as_global_admin"("p_id" "uuid", "p_capacity" integer, "p_estimated_price" integer, "p_max_count" integer, "p_notes" "text") RETURNS "public"."bus_options"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_row public.bus_options;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can manage bus options.'; end if;
  if coalesce(p_capacity, 0) < 1 then raise exception 'Capacity must be positive.'; end if;
  if coalesce(p_estimated_price, -1) < 0 then raise exception 'Estimated price cannot be negative.'; end if;
  if coalesce(p_max_count, 0) < 1 then raise exception 'Maximum count must be positive.'; end if;

  if p_id is null then
    lock table public.bus_options in share row exclusive mode;
    if exists (select 1 from public.bus_options) then
      raise exception 'Only one bus option can be registered.';
    end if;

    insert into public.bus_options (capacity, estimated_price, max_count, notes)
    values (p_capacity, p_estimated_price, p_max_count, nullif(trim(p_notes), ''))
    returning * into v_row;
  else
    update public.bus_options
    set capacity = p_capacity,
        estimated_price = p_estimated_price,
        max_count = p_max_count,
        notes = nullif(trim(p_notes), '')
    where id = p_id
    returning * into v_row;
    if v_row.id is null then raise exception 'Bus option not found.'; end if;
  end if;
  return v_row;
end;
$$;


ALTER FUNCTION "public"."upsert_bus_option_as_global_admin"("p_id" "uuid", "p_capacity" integer, "p_estimated_price" integer, "p_max_count" integer, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_campus_payment_account_as_admin"("p_campus_id" "uuid", "p_bank_name" "text", "p_account_number" "text", "p_account_holder" "text") RETURNS TABLE("campus_id" "uuid", "bank_name" "text", "account_number" "text", "account_holder" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_bank_name text := trim(coalesce(p_bank_name, ''));
  v_account_number text := trim(coalesce(p_account_number, ''));
  v_account_holder text := trim(coalesce(p_account_holder, ''));
begin
  if not public.is_global_admin()
    and not exists (
      select 1
      from public.admin_roles admin_role
      where admin_role.user_id = auth.uid()
        and admin_role.role = 'campus_admin'
        and admin_role.campus_id = p_campus_id
    )
  then
    raise exception 'Only the matching campus admin or a global admin can update this payment account.';
  end if;

  if not exists (
    select 1 from public.campuses where id = p_campus_id and is_active = true
  ) then
    raise exception 'Active campus not found.';
  end if;

  if v_bank_name = '' or v_account_number = '' or v_account_holder = '' then
    raise exception 'Bank name, account number, and account holder are required.';
  end if;

  insert into public.campus_payment_accounts (
    campus_id, bank_name, account_number, account_holder, updated_at, updated_by
  )
  values (
    p_campus_id, v_bank_name, v_account_number, v_account_holder,
    clock_timestamp(), auth.uid()
  )
  on conflict on constraint campus_payment_accounts_pkey do update
  set bank_name = excluded.bank_name,
      account_number = excluded.account_number,
      account_holder = excluded.account_holder,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;

  return query
  select account.campus_id, account.bank_name, account.account_number,
    account.account_holder
  from public.campus_payment_accounts account
  where account.campus_id = p_campus_id;
end;
$$;


ALTER FUNCTION "public"."upsert_campus_payment_account_as_admin"("p_campus_id" "uuid", "p_bank_name" "text", "p_account_number" "text", "p_account_holder" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_campus_payment_account_as_global_admin"("p_campus_id" "uuid", "p_bank_name" "text", "p_account_number" "text", "p_account_holder" "text") RETURNS TABLE("campus_id" "uuid", "bank_name" "text", "account_number" "text", "account_holder" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_bank_name text := trim(coalesce(p_bank_name, ''));
  v_account_number text := trim(coalesce(p_account_number, ''));
  v_account_holder text := trim(coalesce(p_account_holder, ''));
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can update campus payment accounts.';
  end if;

  if not exists (
    select 1 from public.campuses where id = p_campus_id and is_active = true
  ) then
    raise exception 'Active campus not found.';
  end if;

  if v_bank_name = '' or v_account_number = '' or v_account_holder = '' then
    raise exception 'Bank name, account number, and account holder are required.';
  end if;

  insert into public.campus_payment_accounts (
    campus_id, bank_name, account_number, account_holder, updated_at, updated_by
  )
  values (
    p_campus_id, v_bank_name, v_account_number, v_account_holder,
    clock_timestamp(), auth.uid()
  )
  on conflict on constraint campus_payment_accounts_pkey do update
  set bank_name = excluded.bank_name,
      account_number = excluded.account_number,
      account_holder = excluded.account_holder,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;

  return query
  select account.campus_id, account.bank_name, account.account_number,
    account.account_holder
  from public.campus_payment_accounts account
  where account.campus_id = p_campus_id;
end;
$$;


ALTER FUNCTION "public"."upsert_campus_payment_account_as_global_admin"("p_campus_id" "uuid", "p_bank_name" "text", "p_account_number" "text", "p_account_holder" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "reservation_id" "uuid",
    "amount" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "paid_at" timestamp with time zone,
    "verified_by" "uuid",
    "verified_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'refund_required'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_reservation_payment"("p_payment_id" "uuid", "p_reservation_id" "uuid", "p_user_id" "uuid", "p_amount" integer, "p_status" "text") RETURNS "public"."payments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_payment public.payments;
  v_reservation public.reservations;
  v_expected_amount integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if p_status not in ('pending', 'completed', 'refunded') then
    raise exception 'Invalid payment status: %', p_status;
  end if;

  select *
  into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if v_reservation.id is null then
    raise exception 'Reservation not found.';
  end if;

  if p_user_id is distinct from v_reservation.user_id then
    raise exception 'Payment user does not match the reservation owner.';
  end if;

  if v_reservation.data ? 'remainingSeatClaim' then
    raise exception 'Remaining seat payments must use the dedicated confirmation workflow.';
  end if;

  if not exists (
    select 1
    from public.admin_roles
    where admin_roles.user_id = auth.uid()
      and (
        admin_roles.role = 'global_admin'
        or (
          admin_roles.role = 'campus_admin'
          and (
            (
              admin_roles.district_id = v_reservation.district_id
              and admin_roles.team_id = v_reservation.team_id
              and admin_roles.campus_id = v_reservation.campus_id
            )
            or (
              admin_roles.district = v_reservation.district
              and admin_roles.team = v_reservation.team
              and admin_roles.campus = v_reservation.campus
            )
          )
        )
      )
  ) then
    raise exception 'Not authorized to manage this reservation payment.';
  end if;

  if exists (
    select 1
    from public.campus_transfers transfer
    where transfer.status in ('sent', 'confirmed')
      and (
        (
          v_reservation.campus_id is not null
          and transfer.campus_id = v_reservation.campus_id
        )
        or (
          transfer.district = v_reservation.district
          and transfer.team = v_reservation.team
          and transfer.campus = v_reservation.campus
        )
      )
  ) then
    raise exception 'Cancel or reopen the campus transfer before changing individual payments.';
  end if;

  v_expected_amount := greatest(public.get_bus_ticket_price(), 0);

  if v_expected_amount <= 0 then
    raise exception 'A positive bus ticket price is required before changing payments.';
  end if;

  if p_amount is distinct from v_expected_amount then
    raise exception 'Payment amount changed. Refresh and try again.';
  end if;

  if p_payment_id is not null then
    update public.payments
    set
      amount = v_expected_amount,
      status = p_status,
      paid_at = case
        when p_status = 'completed' then coalesce(paid_at, clock_timestamp())
        else paid_at
      end,
      verified_by = case
        when p_status = 'completed' then auth.uid()
        else null
      end,
      verified_at = case
        when p_status = 'completed' then clock_timestamp()
        else null
      end,
      updated_at = clock_timestamp()
    where id = p_payment_id
      and reservation_id = p_reservation_id
      and user_id = v_reservation.user_id
    returning * into v_payment;

    if v_payment.id is not null then
      return v_payment;
    end if;

    raise exception 'Payment does not match the selected reservation.';
  end if;

  insert into public.payments (
    user_id,
    reservation_id,
    amount,
    status,
    paid_at,
    verified_by,
    verified_at,
    updated_at
  )
  values (
    v_reservation.user_id,
    p_reservation_id,
    v_expected_amount,
    p_status,
    case when p_status = 'completed' then clock_timestamp() else null end,
    case when p_status = 'completed' then auth.uid() else null end,
    case when p_status = 'completed' then clock_timestamp() else null end,
    clock_timestamp()
  )
  on conflict (reservation_id)
  where reservation_id is not null
  do update set
    amount = excluded.amount,
    status = excluded.status,
    paid_at = case
      when excluded.status = 'completed' then coalesce(payments.paid_at, excluded.paid_at)
      else payments.paid_at
    end,
    verified_by = excluded.verified_by,
    verified_at = excluded.verified_at,
    updated_at = excluded.updated_at
  returning * into v_payment;

  return v_payment;
end;
$$;


ALTER FUNCTION "public"."upsert_reservation_payment"("p_payment_id" "uuid", "p_reservation_id" "uuid", "p_user_id" "uuid", "p_amount" integer, "p_status" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "line" "text",
    "address" "text",
    "lat" double precision,
    "lng" double precision,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."stations" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_station_as_global_admin"("p_id" "uuid", "p_name" "text", "p_line" "text", "p_address" "text", "p_lat" double precision, "p_lng" double precision) RETURNS "public"."stations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_row public.stations; v_name text := nullif(trim(p_name), '');
begin
  if not public.is_global_admin() then raise exception 'Only global admins can manage stations.'; end if;
  if v_name is null then raise exception 'Station name is required.'; end if;
  if p_lat is not null and (p_lat < -90 or p_lat > 90) then raise exception 'Invalid latitude.'; end if;
  if p_lng is not null and (p_lng < -180 or p_lng > 180) then raise exception 'Invalid longitude.'; end if;

  if p_id is null then
    insert into public.stations (name, line, address, lat, lng, is_active)
    values (v_name, nullif(trim(p_line), ''), nullif(trim(p_address), ''), p_lat, p_lng, true)
    returning * into v_row;
  else
    update public.stations
    set name = v_name, line = nullif(trim(p_line), ''), address = nullif(trim(p_address), ''), lat = p_lat, lng = p_lng
    where id = p_id
    returning * into v_row;
    if v_row.id is null then raise exception 'Station not found.'; end if;
  end if;
  return v_row;
end;
$$;


ALTER FUNCTION "public"."upsert_station_as_global_admin"("p_id" "uuid", "p_name" "text", "p_line" "text", "p_address" "text", "p_lat" double precision, "p_lng" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_admin_invitation_codes"("p_codes" "text"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_codes text[] := coalesce(p_codes, array[]::text[]);
  v_normalized text;
  v_invitation public.admin_invitation_codes%rowtype;
  v_index integer;
  v_results jsonb := '[]'::jsonb;
  v_campus_name text;
begin
  if cardinality(v_codes) > 10 then
    return jsonb_build_object(
      'valid', false,
      'errorCode', 'too_many_codes',
      'errorMessage', 'Up to 10 invitation codes can be used at once.'
    );
  end if;

  for v_index in 1..cardinality(v_codes) loop
    v_normalized := public.normalize_admin_invitation_code(v_codes[v_index]);

    if char_length(v_normalized) <> 24 then
      return jsonb_build_object(
        'valid', false,
        'errorCode', 'invalid_code',
        'errorIndex', v_index,
        'errorMessage', 'Invitation code is invalid.'
      );
    end if;

    if exists (
      select 1
      from unnest(v_codes[1:v_index - 1]) previous_code
      where public.normalize_admin_invitation_code(previous_code) = v_normalized
    ) then
      return jsonb_build_object(
        'valid', false,
        'errorCode', 'duplicate_code',
        'errorIndex', v_index,
        'errorMessage', 'The same invitation code was entered more than once.'
      );
    end if;

    select * into v_invitation
    from public.admin_invitation_codes invitation
    where invitation.code_hash = digest(v_normalized, 'sha256');

    if not found then
      return jsonb_build_object(
        'valid', false,
        'errorCode', 'invalid_code',
        'errorIndex', v_index,
        'errorMessage', 'Invitation code is invalid.'
      );
    end if;
    if v_invitation.cancelled_at is not null then
      return jsonb_build_object(
        'valid', false,
        'errorCode', 'cancelled_code',
        'errorIndex', v_index,
        'errorMessage', 'Invitation code was cancelled.'
      );
    end if;
    if v_invitation.used_at is not null then
      return jsonb_build_object(
        'valid', false,
        'errorCode', 'used_code',
        'errorIndex', v_index,
        'errorMessage', 'Invitation code was already used.'
      );
    end if;
    if v_invitation.expires_at <= clock_timestamp() then
      return jsonb_build_object(
        'valid', false,
        'errorCode', 'expired_code',
        'errorIndex', v_index,
        'errorMessage', 'Invitation code expired.'
      );
    end if;

    if v_invitation.role = 'campus_admin' and exists (
      select 1 from public.admin_roles role
      where role.role = 'campus_admin'
        and role.campus_id = v_invitation.campus_id
    ) then
      return jsonb_build_object(
        'valid', false,
        'errorCode', 'campus_already_assigned',
        'errorIndex', v_index,
        'errorMessage', 'This campus already has an active campus administrator.'
      );
    end if;

    select campus.name into v_campus_name
    from public.campuses campus
    where campus.id = v_invitation.campus_id;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'index', v_index,
      'role', v_invitation.role,
      'campusId', v_invitation.campus_id,
      'campus', v_campus_name
    ));
  end loop;

  return jsonb_build_object('valid', true, 'invitations', v_results);
end;
$$;


ALTER FUNCTION "public"."validate_admin_invitation_codes"("p_codes" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_allocation_bus_identifiers"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if jsonb_typeof(new.allocation_data -> 'buses') <> 'array' then
    return new;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(new.allocation_data -> 'buses') bus
    where nullif(btrim(bus ->> 'id'), '') is null
      or nullif(btrim(bus ->> 'label'), '') is null
  ) then
    raise exception 'Every bus needs a non-empty ID and label.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(new.allocation_data -> 'buses') bus
    group by btrim(bus ->> 'id')
    having count(*) > 1
  ) then
    raise exception 'Duplicate bus IDs exist in the allocation.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(new.allocation_data -> 'buses') bus
    group by btrim(bus ->> 'label')
    having count(*) > 1
  ) then
    raise exception 'Duplicate bus labels exist in the allocation.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_allocation_bus_identifiers"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_allocation_workspace_confirmation"("p_allocation_id" "uuid", "p_allocation_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_allocation_status text;
  v_passenger_count integer := 0;
  v_active_reservation_count integer := 0;
  v_payload_valid boolean;
  v_workspace_valid boolean;
  v_bus_details_valid boolean;
  v_assignments_valid boolean;
  v_unique_reservations_valid boolean;
  v_unique_seats_valid boolean;
  v_active_reservations_valid boolean;
  v_details jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can validate allocations.';
  end if;

  select allocation_data ->> 'status'
  into v_allocation_status
  from public.bus_allocations
  where id = p_allocation_id;

  v_payload_valid := coalesce(
    jsonb_typeof(p_allocation_data) = 'object'
    and jsonb_typeof(p_allocation_data -> 'buses') = 'array'
    and jsonb_array_length(p_allocation_data -> 'buses') > 0
    and jsonb_typeof(p_allocation_data -> 'passengers') = 'array'
    and jsonb_array_length(p_allocation_data -> 'passengers') > 0,
    false
  );
  v_workspace_valid := coalesce(
    v_allocation_status in ('draft', 'confirmed'),
    false
  );

  select count(*)
  into v_active_reservation_count
  from public.reservations
  where status is distinct from 'cancelled';

  if not v_payload_valid then
    return jsonb_build_object(
      'valid', false,
      'checked_at', clock_timestamp(),
      'allocation_status', v_allocation_status,
      'passenger_count', 0,
      'active_reservation_count', v_active_reservation_count,
      'details', '[]'::jsonb,
      'checks', jsonb_build_array(
        jsonb_build_object('key', 'workspace_status', 'valid', v_workspace_valid),
        jsonb_build_object('key', 'payload_structure', 'valid', false),
        jsonb_build_object('key', 'bus_details', 'valid', false),
        jsonb_build_object('key', 'assignments', 'valid', false),
        jsonb_build_object('key', 'unique_reservations', 'valid', false),
        jsonb_build_object('key', 'unique_seats', 'valid', false),
        jsonb_build_object('key', 'active_reservations', 'valid', false)
      )
    );
  end if;

  v_passenger_count := jsonb_array_length(p_allocation_data -> 'passengers');

  v_bus_details_valid := not exists (
    select 1
    from jsonb_array_elements(p_allocation_data -> 'buses') bus
    where nullif(btrim(bus ->> 'id'), '') is null
      or nullif(btrim(bus ->> 'label'), '') is null
      or nullif(btrim(bus ->> 'destination'), '') is null
      or nullif(btrim(bus ->> 'departureTime'), '') is null
      or nullif(btrim(bus ->> 'boardingPlace'), '') is null
      or coalesce(bus ->> 'capacity', '') !~ '^[1-9][0-9]*$'
  );

  v_assignments_valid := not exists (
    select 1
    from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
    left join jsonb_array_elements(p_allocation_data -> 'buses') bus
      on bus ->> 'id' = passenger ->> 'busId'
    where nullif(passenger ->> 'reservationId', '') is null
      or nullif(passenger ->> 'busId', '') is null
      or coalesce(passenger ->> 'seatNumber', '') !~ '^[1-9][0-9]*$'
      or bus is null
      or case
        when coalesce(passenger ->> 'seatNumber', '') ~ '^[1-9][0-9]*$'
          and coalesce(bus ->> 'capacity', '') ~ '^[1-9][0-9]*$'
          then (passenger ->> 'seatNumber')::integer > (bus ->> 'capacity')::integer
        else true
      end
      or not (
        coalesce(passenger -> 'preferences', '[]'::jsonb)
          ? (bus ->> 'destination')
      )
  );

  v_unique_reservations_valid := (
    select count(distinct passenger ->> 'reservationId')
    from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
  ) = v_passenger_count;

  v_unique_seats_valid := not exists (
    select 1
    from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
    group by passenger ->> 'busId', passenger ->> 'seatNumber'
    having count(*) > 1
  );

  v_active_reservations_valid :=
    v_active_reservation_count = v_passenger_count
    and not exists (
      select 1
      from public.reservations reservation
      where reservation.status is distinct from 'cancelled'
        and not exists (
          select 1
          from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
          where passenger ->> 'reservationId' = reservation.id::text
        )
    )
    and not exists (
      select 1
      from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
      where not exists (
        select 1
        from public.reservations reservation
        where reservation.id::text = passenger ->> 'reservationId'
          and reservation.status is distinct from 'cancelled'
      )
    );

  select coalesce(jsonb_agg(detail order by sort_order, message), '[]'::jsonb)
  into v_details
  from (
    select
      10 as sort_order,
      bus ->> 'label' as message,
      jsonb_build_object(
        'key', 'bus_details',
        'message', coalesce(nullif(bus ->> 'label', ''), '이름 없는 버스')
          || ': 필수 버스 정보가 누락되었거나 정원이 올바르지 않습니다.',
        'bus_id', bus ->> 'id'
      ) as detail
    from jsonb_array_elements(p_allocation_data -> 'buses') bus
    where nullif(btrim(bus ->> 'id'), '') is null
      or nullif(btrim(bus ->> 'label'), '') is null
      or nullif(btrim(bus ->> 'destination'), '') is null
      or nullif(btrim(bus ->> 'departureTime'), '') is null
      or nullif(btrim(bus ->> 'boardingPlace'), '') is null
      or coalesce(bus ->> 'capacity', '') !~ '^[1-9][0-9]*$'

    union all

    select
      20,
      passenger ->> 'name',
      jsonb_build_object(
        'key', 'assignments',
        'message', coalesce(nullif(passenger ->> 'name', ''), '이름 없는 탑승자')
          || ': 배차 버스, 좌석번호 또는 목적지가 올바르지 않습니다.',
        'passenger_id', passenger ->> 'reservationId',
        'bus_id', passenger ->> 'busId'
      )
    from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
    left join jsonb_array_elements(p_allocation_data -> 'buses') bus
      on bus ->> 'id' = passenger ->> 'busId'
    where nullif(passenger ->> 'reservationId', '') is null
      or nullif(passenger ->> 'busId', '') is null
      or coalesce(passenger ->> 'seatNumber', '') !~ '^[1-9][0-9]*$'
      or bus is null
      or case
        when coalesce(passenger ->> 'seatNumber', '') ~ '^[1-9][0-9]*$'
          and coalesce(bus ->> 'capacity', '') ~ '^[1-9][0-9]*$'
          then (passenger ->> 'seatNumber')::integer > (bus ->> 'capacity')::integer
        else true
      end
      or not (
        coalesce(passenger -> 'preferences', '[]'::jsonb)
          ? (bus ->> 'destination')
      )

    union all

    select
      30,
      duplicate.reservation_id,
      jsonb_build_object(
        'key', 'unique_reservations',
        'message', duplicate.passenger_name || ': 같은 예약자가 '
          || duplicate.duplicate_count || '번 포함되어 있습니다.',
        'passenger_id', duplicate.reservation_id
      )
    from (
      select
        passenger ->> 'reservationId' as reservation_id,
        max(coalesce(nullif(passenger ->> 'name', ''), '이름 없는 탑승자')) as passenger_name,
        count(*) as duplicate_count
      from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
      group by passenger ->> 'reservationId'
      having count(*) > 1
    ) duplicate

    union all

    select
      40,
      duplicate_seat.bus_label || duplicate_seat.seat_number,
      jsonb_build_object(
        'key', 'unique_seats',
        'message', duplicate_seat.bus_label || ': '
          || duplicate_seat.seat_number || '번 좌석에 '
          || duplicate_seat.duplicate_count || '명이 배정되어 있습니다.',
        'bus_id', duplicate_seat.bus_id
      )
    from (
      select
        passenger ->> 'busId' as bus_id,
        max(coalesce(nullif(bus ->> 'label', ''), '이름 없는 버스')) as bus_label,
        passenger ->> 'seatNumber' as seat_number,
        count(*) as duplicate_count
      from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
      left join jsonb_array_elements(p_allocation_data -> 'buses') bus
        on bus ->> 'id' = passenger ->> 'busId'
      group by passenger ->> 'busId', passenger ->> 'seatNumber'
      having count(*) > 1
    ) duplicate_seat

    union all

    select
      50,
      reservation.name,
      jsonb_build_object(
        'key', 'active_reservations',
        'message', reservation.name || ' · ' || reservation.campus || ' · '
          || reservation.team || ': 최신 활성 예약자이나 배차안에 없습니다.',
        'reservation_id', reservation.id::text,
        'requires_refresh', true
      )
    from public.reservations reservation
    where reservation.status is distinct from 'cancelled'
      and not exists (
        select 1
        from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
        where passenger ->> 'reservationId' = reservation.id::text
      )

    union all

    select
      60,
      passenger ->> 'name',
      jsonb_build_object(
        'key', 'active_reservations',
        'message', coalesce(nullif(passenger ->> 'name', ''), '이름 없는 탑승자')
          || ': 취소되었거나 최신 활성 예약에서 제외된 탑승자입니다.',
        'passenger_id', passenger ->> 'reservationId'
      )
    from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
    where not exists (
      select 1
      from public.reservations reservation
      where reservation.id::text = passenger ->> 'reservationId'
        and reservation.status is distinct from 'cancelled'
    )
  ) details;

  return jsonb_build_object(
    'valid',
      v_workspace_valid
      and v_payload_valid
      and v_bus_details_valid
      and v_assignments_valid
      and v_unique_reservations_valid
      and v_unique_seats_valid
      and v_active_reservations_valid,
    'checked_at', clock_timestamp(),
    'allocation_status', v_allocation_status,
    'passenger_count', v_passenger_count,
    'active_reservation_count', v_active_reservation_count,
    'details', v_details,
    'checks', jsonb_build_array(
      jsonb_build_object('key', 'workspace_status', 'valid', v_workspace_valid),
      jsonb_build_object('key', 'payload_structure', 'valid', v_payload_valid),
      jsonb_build_object('key', 'bus_details', 'valid', v_bus_details_valid),
      jsonb_build_object('key', 'assignments', 'valid', v_assignments_valid),
      jsonb_build_object('key', 'unique_reservations', 'valid', v_unique_reservations_valid),
      jsonb_build_object('key', 'unique_seats', 'valid', v_unique_seats_valid),
      jsonb_build_object('key', 'active_reservations', 'valid', v_active_reservations_valid)
    )
  );
end;
$_$;


ALTER FUNCTION "public"."validate_allocation_workspace_confirmation"("p_allocation_id" "uuid", "p_allocation_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_allocation_workspace_confirmation_v2"("p_allocation_id" "uuid", "p_allocation_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "statement_timeout" TO '5min'
    AS $$
declare
  v_has_out_of_preference boolean;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can validate allocations.';
  end if;

  select exists (
    select 1
    from jsonb_array_elements(coalesce(p_allocation_data -> 'passengers', '[]'::jsonb))
      passenger
    left join jsonb_array_elements(coalesce(p_allocation_data -> 'buses', '[]'::jsonb))
      bus on bus ->> 'id' = passenger ->> 'busId'
    where bus is not null
      and not (
        coalesce(passenger -> 'preferences', '[]'::jsonb)
          ? (bus ->> 'destination')
      )
  )
  into v_has_out_of_preference;

  if v_has_out_of_preference
    and coalesce((p_allocation_data ->> 'allowOutOfPreferenceOverride')::boolean, false)
      is not true then
    return public.validate_allocation_workspace_confirmation(
      p_allocation_id,
      p_allocation_data
    );
  end if;

  return public.validate_allocation_workspace_confirmation(
    p_allocation_id,
    public.prepare_allocation_preference_override(p_allocation_data)
  );
exception
  when invalid_text_representation then
    return public.validate_allocation_workspace_confirmation(
      p_allocation_id,
      p_allocation_data
    );
end;
$$;


ALTER FUNCTION "public"."validate_allocation_workspace_confirmation_v2"("p_allocation_id" "uuid", "p_allocation_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_boarding_walk_in_seat_conflicts"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.allocation_data ->> 'status' <> 'confirmed' then
    return new;
  end if;

  if exists (
    select 1
    from public.boarding_walk_in_passengers walk_in
    left join lateral (
      select bus
      from jsonb_array_elements(new.allocation_data -> 'buses') bus
      where bus ->> 'id' = walk_in.bus_id
    ) matched_bus on true
    where walk_in.allocation_id = new.id
      and (
        matched_bus.bus is null
        or walk_in.seat_number > (matched_bus.bus ->> 'capacity')::integer
        or exists (
          select 1
          from jsonb_array_elements(new.allocation_data -> 'passengers') passenger
          where passenger ->> 'busId' = walk_in.bus_id
            and (passenger ->> 'seatNumber')::integer = walk_in.seat_number
        )
      )
  ) then
    raise exception 'Confirmed allocation conflicts with a walk-in passenger seat.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_boarding_walk_in_seat_conflicts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_campus_transfer_financial_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_total_people integer;
  v_paid_people integer;
  v_total_amount integer;
  v_snapshot_change boolean := tg_op = 'INSERT';
begin
  if tg_op = 'UPDATE' then
    v_snapshot_change :=
      old.status is distinct from new.status
      or old.total_people is distinct from new.total_people
      or old.paid_people is distinct from new.paid_people
      or old.total_amount is distinct from new.total_amount;
  end if;

  if not v_snapshot_change then
    return new;
  end if;

  perform pg_advisory_xact_lock(public.get_payment_scope_lock_key(
    new.campus_id,
    new.district,
    new.team,
    new.campus
  ));

  if new.status in ('sent', 'confirmed') then
    select
      count(*)::integer,
      count(*) filter (
        where exists (
          select 1
          from public.payments payment
          where payment.reservation_id = reservation.id
            and payment.status = 'completed'
        )
      )::integer
    into v_total_people, v_paid_people
    from public.reservations reservation
    where reservation.status is distinct from 'cancelled'
      and (
        (
          new.campus_id is not null
          and reservation.campus_id = new.campus_id
        )
        or (
          reservation.district = new.district
          and reservation.team = new.team
          and reservation.campus = new.campus
        )
      );

    v_total_amount := v_total_people * public.get_bus_ticket_price();

    if new.total_people is distinct from v_total_people
      or new.paid_people is distinct from v_paid_people
      or new.total_amount is distinct from v_total_amount then
      raise exception 'Campus transfer totals changed. Refresh and try again.';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_campus_transfer_financial_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_profile_organization_membership"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.affiliation_type = 'external' then
    if new.district_id is not null
      or new.team_id is not null
      or new.campus_id is not null then
      raise exception 'External profiles cannot reference Seoul organization IDs.';
    end if;

    return new;
  end if;

  if new.district_id is null
    or new.team_id is null
    or new.campus_id is null
    or not exists (
      select 1
      from public.teams
      join public.campuses
        on campuses.team_id = teams.id
      where teams.id = new.team_id
        and teams.district_id = new.district_id
        and campuses.id = new.campus_id
    ) then
    raise exception 'District, team, and campus must belong to the same organization path.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_profile_organization_membership"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_event_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid",
    "actor_kind" "text" NOT NULL,
    "event_name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "route" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    CONSTRAINT "activity_event_logs_actor_kind_check" CHECK (("actor_kind" = ANY (ARRAY['user'::"text", 'admin'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."activity_event_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_action_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid",
    "action" "text" NOT NULL,
    "resource_type" "text" NOT NULL,
    "resource_id" "uuid",
    "before_data" "jsonb",
    "after_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL
);


ALTER TABLE "public"."admin_action_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_invitation_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code_hash" "bytea" NOT NULL,
    "code" "text",
    "code_hint" "text" NOT NULL,
    "role" "text" NOT NULL,
    "campus_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("clock_timestamp"() + '14 days'::interval) NOT NULL,
    "used_by" "uuid",
    "used_at" timestamp with time zone,
    "cancelled_by" "uuid",
    "cancelled_at" timestamp with time zone,
    CONSTRAINT "admin_invitation_codes_role_check" CHECK (("role" = ANY (ARRAY['campus_admin'::"text", 'boarding_manager'::"text"]))),
    CONSTRAINT "admin_invitation_codes_role_scope_check" CHECK (((("role" = 'campus_admin'::"text") AND ("campus_id" IS NOT NULL)) OR (("role" = 'boarding_manager'::"text") AND ("campus_id" IS NULL)))),
    CONSTRAINT "admin_invitation_codes_usage_check" CHECK (((("used_by" IS NULL) AND ("used_at" IS NULL)) OR ("used_at" IS NOT NULL)))
);


ALTER TABLE "public"."admin_invitation_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_operations_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requested_by" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "anonymized" boolean DEFAULT true NOT NULL,
    "input_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "report_markdown" "text",
    "model" "text",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "ai_operations_reports_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."ai_operations_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."allocation_optimization_events" (
    "id" bigint NOT NULL,
    "job_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "event_type" "text" NOT NULL,
    "detail" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."allocation_optimization_events" OWNER TO "postgres";


ALTER TABLE "public"."allocation_optimization_events" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."allocation_optimization_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."allocation_optimization_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "cancel_requested_at" timestamp with time zone,
    "input_hash" "text" NOT NULL,
    "input_snapshot" "jsonb" NOT NULL,
    "progress" integer DEFAULT 0 NOT NULL,
    "current_phase" "text",
    "elapsed_seconds" integer DEFAULT 0 NOT NULL,
    "best_known_bus_count" integer,
    "proven_bus_count" integer,
    "result" "jsonb",
    "diagnostics" "jsonb",
    "error_message" "text",
    "worker_id" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "optimization_scope" "text" DEFAULT 'BASELINE'::"text" NOT NULL,
    "source_job_id" "uuid",
    "result_reused" boolean DEFAULT false NOT NULL,
    "detailed_settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "resume_from_job_id" "uuid",
    "execution_mode" "text" DEFAULT 'local'::"text" NOT NULL,
    CONSTRAINT "allocation_optimization_jobs_best_known_bus_count_check" CHECK (("best_known_bus_count" >= 0)),
    CONSTRAINT "allocation_optimization_jobs_elapsed_seconds_check" CHECK (("elapsed_seconds" >= 0)),
    CONSTRAINT "allocation_optimization_jobs_execution_mode_check" CHECK (("execution_mode" = ANY (ARRAY['local'::"text", 'cloud'::"text"]))),
    CONSTRAINT "allocation_optimization_jobs_optimization_scope_check" CHECK (("optimization_scope" = ANY (ARRAY['BASELINE'::"text", 'DETAILED'::"text"]))),
    CONSTRAINT "allocation_optimization_jobs_progress_check" CHECK ((("progress" >= 0) AND ("progress" <= 100))),
    CONSTRAINT "allocation_optimization_jobs_proven_bus_count_check" CHECK (("proven_bus_count" >= 0)),
    CONSTRAINT "allocation_optimization_jobs_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'RUNNING'::"text", 'CANCEL_REQUESTED'::"text", 'CANCELLED'::"text", 'OPTIMAL'::"text", 'INFEASIBLE'::"text", 'FAILED'::"text"])))
);


ALTER TABLE "public"."allocation_optimization_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."allocation_workspace_versions" (
    "id" "text" NOT NULL,
    "allocation_id" "uuid" NOT NULL,
    "revision" bigint NOT NULL,
    "label" "text" NOT NULL,
    "actor_id" "text" NOT NULL,
    "changes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "snapshot" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."allocation_workspace_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."boarding_check_in_attempts" (
    "allocation_id" "uuid" NOT NULL,
    "reservation_id" "uuid" NOT NULL,
    "failed_attempts" integer DEFAULT 0 NOT NULL,
    "locked_until" timestamp with time zone,
    "last_failed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    CONSTRAINT "boarding_check_in_attempts_failed_attempts_check" CHECK (("failed_attempts" >= 0))
);


ALTER TABLE "public"."boarding_check_in_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."boarding_check_in_codes" (
    "allocation_id" "uuid" NOT NULL,
    "bus_id" "text" NOT NULL,
    "bus_label" "text" NOT NULL,
    "check_in_code" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "created_by" "uuid",
    "expires_at" timestamp with time zone DEFAULT ("clock_timestamp"() + '12:00:00'::interval) NOT NULL,
    CONSTRAINT "boarding_check_in_codes_check_in_code_check" CHECK (("check_in_code" ~ '^[0-9]{4}$'::"text"))
);


ALTER TABLE "public"."boarding_check_in_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."boarding_exception_archives" (
    "record_key" "text" NOT NULL,
    "allocation_id" "uuid" NOT NULL,
    "record_data" "jsonb" NOT NULL,
    "archived_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_by" "uuid"
);


ALTER TABLE "public"."boarding_exception_archives" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."boarding_exception_reason_edit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "record_key" "text" NOT NULL,
    "allocation_id" "uuid" NOT NULL,
    "bus_id" "text" NOT NULL,
    "previous_reason" "text",
    "next_reason" "text" NOT NULL,
    "edited_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "edited_by" "uuid"
);


ALTER TABLE "public"."boarding_exception_reason_edit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."boarding_exception_reason_edits" (
    "record_key" "text" NOT NULL,
    "allocation_id" "uuid" NOT NULL,
    "bus_id" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "updated_by" "uuid"
);


ALTER TABLE "public"."boarding_exception_reason_edits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."boarding_manager_bus_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "allocation_id" "uuid" NOT NULL,
    "manager_user_id" "uuid" NOT NULL,
    "bus_id" "text" NOT NULL,
    "assigned_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."boarding_manager_bus_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."boarding_move_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "allocation_id" "uuid" NOT NULL,
    "reservation_id" "uuid" NOT NULL,
    "source_bus_id" "text" NOT NULL,
    "target_bus_id" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "requested_by" "uuid",
    "requested_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "responded_by" "uuid",
    "responded_at" timestamp with time zone,
    "response_reason" "text",
    CONSTRAINT "boarding_move_requests_check" CHECK (("source_bus_id" <> "target_bus_id")),
    CONSTRAINT "boarding_move_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."boarding_move_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."boarding_status_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reservation_id" "uuid" NOT NULL,
    "from_status" "text" NOT NULL,
    "to_status" "text" NOT NULL,
    "actor_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "note" "text"
);


ALTER TABLE "public"."boarding_status_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."boarding_walk_in_passengers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "allocation_id" "uuid" NOT NULL,
    "bus_id" "text" NOT NULL,
    "seat_number" integer NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "campus" "text" DEFAULT ''::"text" NOT NULL,
    "boarding_status" "text" DEFAULT 'unchecked'::"text" NOT NULL,
    "boarding_note" "text",
    "reason" "text" NOT NULL,
    "created_by" "uuid",
    "boarding_status_updated_by" "uuid",
    "boarding_status_updated_at" timestamp with time zone,
    "boarding_no_show_departure_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "boarding_walk_in_passengers_boarding_status_check" CHECK (("boarding_status" = ANY (ARRAY['unchecked'::"text", 'boarded'::"text", 'no_show'::"text"]))),
    CONSTRAINT "boarding_walk_in_passengers_seat_number_check" CHECK (("seat_number" > 0))
);


ALTER TABLE "public"."boarding_walk_in_passengers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campus_notice_reads" (
    "user_id" "uuid" NOT NULL,
    "notice_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."campus_notice_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campus_notice_targets" (
    "notice_id" "uuid" NOT NULL,
    "district" "text" NOT NULL,
    "team" "text" NOT NULL,
    "campus" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."campus_notice_targets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."districts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."districts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "district_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."campus_options" AS
 SELECT "districts"."id" AS "district_id",
    "districts"."name" AS "district",
    "teams"."id" AS "team_id",
    "teams"."name" AS "team",
    "campuses"."id" AS "campus_id",
    "campuses"."name" AS "campus",
    "districts"."sort_order" AS "district_sort_order",
    "teams"."sort_order" AS "team_sort_order",
    "campuses"."sort_order" AS "campus_sort_order"
   FROM (("public"."districts"
     JOIN "public"."teams" ON (("teams"."district_id" = "districts"."id")))
     JOIN "public"."campuses" ON (("campuses"."team_id" = "teams"."id")))
  WHERE (("districts"."is_active" = true) AND ("teams"."is_active" = true) AND ("campuses"."is_active" = true));


ALTER VIEW "public"."campus_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campus_payment_accounts" (
    "campus_id" "uuid" NOT NULL,
    "bank_name" "text" DEFAULT ''::"text" NOT NULL,
    "account_number" "text" DEFAULT ''::"text" NOT NULL,
    "account_holder" "text" DEFAULT ''::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "updated_by" "uuid"
);


ALTER TABLE "public"."campus_payment_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campus_request_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "message_id" "uuid",
    "actor_id" "uuid",
    "action" "text" NOT NULL,
    "before_data" "jsonb",
    "after_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    CONSTRAINT "campus_request_audit_logs_action_check" CHECK (("action" = ANY (ARRAY['status_changed'::"text", 'response_changed'::"text", 'message_updated'::"text", 'message_deleted'::"text"])))
);


ALTER TABLE "public"."campus_request_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campus_request_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "sender_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "sender_role" "text" NOT NULL,
    "message" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campus_request_messages_sender_role_check" CHECK (("sender_role" = ANY (ARRAY['campus_admin'::"text", 'global_admin'::"text"])))
);


ALTER TABLE "public"."campus_request_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campus_request_reads" (
    "user_id" "uuid" NOT NULL,
    "request_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL
);


ALTER TABLE "public"."campus_request_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ccc_summer_campus_mappings" (
    "univ_no" bigint NOT NULL,
    "univ_name" "text",
    "campus_id" "uuid" NOT NULL,
    "mapped_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL
);


ALTER TABLE "public"."ccc_summer_campus_mappings" OWNER TO "postgres";


COMMENT ON TABLE "public"."ccc_summer_campus_mappings" IS 'Private reusable mapping from CCC Summer university numbers to bus campuses.';



CREATE TABLE IF NOT EXISTS "public"."ccc_summer_user_links" (
    "subject_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "is_staff" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "last_synced_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "univ_no" bigint,
    "univ_name" "text",
    "branch_no" bigint,
    "branch_name" "text",
    CONSTRAINT "ccc_summer_user_links_subject_id_not_blank" CHECK ((NULLIF("btrim"("subject_id"), ''::"text") IS NOT NULL))
);


ALTER TABLE "public"."ccc_summer_user_links" OWNER TO "postgres";


COMMENT ON TABLE "public"."ccc_summer_user_links" IS 'Private mapping between CCC Summer subjects and Supabase Auth users.';



COMMENT ON COLUMN "public"."ccc_summer_user_links"."is_staff" IS 'Informational CCC Summer staff classification; never grants admin access.';



CREATE TABLE IF NOT EXISTS "public"."manual_boarding_exception_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "allocation_id" "uuid" NOT NULL,
    "bus_id" "text" NOT NULL,
    "reservation_id" "uuid",
    "passenger_name" "text",
    "passenger_phone" "text",
    "campus" "text",
    "seat_number" "text",
    "reason" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."manual_boarding_exception_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personal_inquiry_reads" (
    "user_id" "uuid" NOT NULL,
    "inquiry_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL
);


ALTER TABLE "public"."personal_inquiry_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personal_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "target_user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "category" "text" DEFAULT 'general'::"text" NOT NULL,
    "created_by" "uuid",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL
);


ALTER TABLE "public"."personal_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personal_user_action_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "target_user_id" "uuid" NOT NULL,
    "reservation_id" "uuid",
    "actor_id" "uuid",
    "action" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "before_data" "jsonb",
    "after_data" "jsonb",
    "reversible" boolean DEFAULT false NOT NULL,
    "reverted_at" timestamp with time zone,
    "reverted_by" "uuid"
);


ALTER TABLE "public"."personal_user_action_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "name" "text",
    "phone" "text",
    "district_id" "uuid",
    "district" "text",
    "team_id" "uuid",
    "team" "text",
    "campus_id" "uuid",
    "campus" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "account_source" "text" DEFAULT 'self_signup'::"text" NOT NULL,
    "affiliation_type" "text" DEFAULT 'seoul'::"text" NOT NULL,
    "coordinator_name" "text",
    "coordinator_phone" "text",
    CONSTRAINT "profiles_account_source_check" CHECK (("account_source" = ANY (ARRAY['self_signup'::"text", 'admin_created'::"text", 'ccc_summer'::"text"]))),
    CONSTRAINT "profiles_affiliation_type_check" CHECK (("affiliation_type" = ANY (ARRAY['seoul'::"text", 'external'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."simulation_stage_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stage" "text" NOT NULL,
    "status" "text" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error_message" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "simulation_stage_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."simulation_stage_runs" OWNER TO "postgres";


ALTER TABLE ONLY "public"."activity_event_logs"
    ADD CONSTRAINT "activity_event_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_action_audit_logs"
    ADD CONSTRAINT "admin_action_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_invitation_codes"
    ADD CONSTRAINT "admin_invitation_codes_code_hash_key" UNIQUE ("code_hash");



ALTER TABLE ONLY "public"."admin_invitation_codes"
    ADD CONSTRAINT "admin_invitation_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_roles"
    ADD CONSTRAINT "admin_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_operations_reports"
    ADD CONSTRAINT "ai_operations_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_report_log_settings"
    ADD CONSTRAINT "ai_report_log_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."allocation_optimization_events"
    ADD CONSTRAINT "allocation_optimization_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."allocation_optimization_jobs"
    ADD CONSTRAINT "allocation_optimization_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."allocation_workspace_versions"
    ADD CONSTRAINT "allocation_workspace_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."boarding_bus_departures"
    ADD CONSTRAINT "boarding_bus_departures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."boarding_check_in_attempts"
    ADD CONSTRAINT "boarding_check_in_attempts_pkey" PRIMARY KEY ("allocation_id", "reservation_id");



ALTER TABLE ONLY "public"."boarding_check_in_codes"
    ADD CONSTRAINT "boarding_check_in_codes_pkey" PRIMARY KEY ("allocation_id", "bus_id");



ALTER TABLE ONLY "public"."boarding_exception_archives"
    ADD CONSTRAINT "boarding_exception_archives_pkey" PRIMARY KEY ("record_key");



ALTER TABLE ONLY "public"."boarding_exception_reason_edit_logs"
    ADD CONSTRAINT "boarding_exception_reason_edit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."boarding_exception_reason_edits"
    ADD CONSTRAINT "boarding_exception_reason_edits_pkey" PRIMARY KEY ("record_key");



ALTER TABLE ONLY "public"."boarding_manager_bus_assignments"
    ADD CONSTRAINT "boarding_manager_bus_assignme_allocation_id_manager_user_id_key" UNIQUE ("allocation_id", "manager_user_id", "bus_id");



ALTER TABLE ONLY "public"."boarding_manager_bus_assignments"
    ADD CONSTRAINT "boarding_manager_bus_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."boarding_move_requests"
    ADD CONSTRAINT "boarding_move_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."boarding_status_events"
    ADD CONSTRAINT "boarding_status_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."boarding_walk_in_passengers"
    ADD CONSTRAINT "boarding_walk_in_passengers_allocation_id_bus_id_seat_numbe_key" UNIQUE ("allocation_id", "bus_id", "seat_number");



ALTER TABLE ONLY "public"."boarding_walk_in_passengers"
    ADD CONSTRAINT "boarding_walk_in_passengers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bus_allocations"
    ADD CONSTRAINT "bus_allocations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bus_options"
    ADD CONSTRAINT "bus_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campus_notice_reads"
    ADD CONSTRAINT "campus_notice_reads_pkey" PRIMARY KEY ("user_id", "notice_id");



ALTER TABLE ONLY "public"."campus_notice_targets"
    ADD CONSTRAINT "campus_notice_targets_pkey" PRIMARY KEY ("notice_id", "district", "team", "campus");



ALTER TABLE ONLY "public"."campus_payment_accounts"
    ADD CONSTRAINT "campus_payment_accounts_pkey" PRIMARY KEY ("campus_id");



ALTER TABLE ONLY "public"."campus_request_audit_logs"
    ADD CONSTRAINT "campus_request_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campus_request_messages"
    ADD CONSTRAINT "campus_request_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campus_request_reads"
    ADD CONSTRAINT "campus_request_reads_pkey" PRIMARY KEY ("user_id", "request_id");



ALTER TABLE ONLY "public"."campus_requests"
    ADD CONSTRAINT "campus_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campus_transfers"
    ADD CONSTRAINT "campus_transfers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campuses"
    ADD CONSTRAINT "campuses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ccc_summer_campus_mappings"
    ADD CONSTRAINT "ccc_summer_campus_mappings_pkey" PRIMARY KEY ("univ_no");



ALTER TABLE ONLY "public"."ccc_summer_user_links"
    ADD CONSTRAINT "ccc_summer_user_links_pkey" PRIMARY KEY ("subject_id");



ALTER TABLE ONLY "public"."ccc_summer_user_links"
    ADD CONSTRAINT "ccc_summer_user_links_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."districts"
    ADD CONSTRAINT "districts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."home_announcements"
    ADD CONSTRAINT "home_announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."manual_boarding_exception_records"
    ADD CONSTRAINT "manual_boarding_exception_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personal_inquiries"
    ADD CONSTRAINT "personal_inquiries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personal_inquiry_audit_logs"
    ADD CONSTRAINT "personal_inquiry_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personal_inquiry_messages"
    ADD CONSTRAINT "personal_inquiry_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personal_inquiry_reads"
    ADD CONSTRAINT "personal_inquiry_reads_pkey" PRIMARY KEY ("user_id", "inquiry_id");



ALTER TABLE ONLY "public"."personal_notifications"
    ADD CONSTRAINT "personal_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personal_user_action_logs"
    ADD CONSTRAINT "personal_user_action_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."simulation_stage_runs"
    ADD CONSTRAINT "simulation_stage_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stations"
    ADD CONSTRAINT "stations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_activity_event_logs_actor_occurred" ON "public"."activity_event_logs" USING "btree" ("actor_id", "occurred_at" DESC);



CREATE INDEX "idx_activity_event_logs_category_occurred" ON "public"."activity_event_logs" USING "btree" ("category", "occurred_at" DESC);



CREATE INDEX "idx_activity_event_logs_occurred_id" ON "public"."activity_event_logs" USING "btree" ("occurred_at" DESC, "id" DESC);



CREATE INDEX "idx_admin_action_audit_logs_created" ON "public"."admin_action_audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_admin_action_audit_logs_created_id" ON "public"."admin_action_audit_logs" USING "btree" ("created_at" DESC, "id" DESC);



CREATE INDEX "idx_admin_action_audit_logs_resource" ON "public"."admin_action_audit_logs" USING "btree" ("resource_type", "resource_id", "created_at" DESC);



CREATE INDEX "idx_admin_invitation_codes_campus" ON "public"."admin_invitation_codes" USING "btree" ("campus_id", "created_at" DESC) WHERE ("role" = 'campus_admin'::"text");



CREATE INDEX "idx_admin_invitation_codes_created" ON "public"."admin_invitation_codes" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "idx_admin_roles_boarding_manager_unique" ON "public"."admin_roles" USING "btree" ("user_id", "role") WHERE ("role" = 'boarding_manager'::"text");



CREATE INDEX "idx_admin_roles_campus" ON "public"."admin_roles" USING "btree" ("campus");



CREATE UNIQUE INDEX "idx_admin_roles_campus_id_scope_unique" ON "public"."admin_roles" USING "btree" ("role", "campus_id") WHERE (("role" = 'campus_admin'::"text") AND ("campus_id" IS NOT NULL));



CREATE UNIQUE INDEX "idx_admin_roles_campus_scope_unique" ON "public"."admin_roles" USING "btree" ("role", "district", "team", "campus") WHERE (("role" = 'campus_admin'::"text") AND ("district" IS NOT NULL) AND ("team" IS NOT NULL) AND ("campus" IS NOT NULL));



CREATE UNIQUE INDEX "idx_admin_roles_global_admin_unique" ON "public"."admin_roles" USING "btree" ("user_id", "role") WHERE ("role" = 'global_admin'::"text");



CREATE INDEX "idx_admin_roles_role" ON "public"."admin_roles" USING "btree" ("role");



CREATE INDEX "idx_admin_roles_scope" ON "public"."admin_roles" USING "btree" ("role", "district", "team", "campus");



CREATE INDEX "idx_admin_roles_scope_ids" ON "public"."admin_roles" USING "btree" ("role", "district_id", "team_id", "campus_id");



CREATE UNIQUE INDEX "idx_admin_roles_user_campus_id_scope_unique" ON "public"."admin_roles" USING "btree" ("user_id", "role", "campus_id") WHERE (("role" = 'campus_admin'::"text") AND ("campus_id" IS NOT NULL));



CREATE UNIQUE INDEX "idx_admin_roles_user_campus_scope_unique" ON "public"."admin_roles" USING "btree" ("user_id", "role", "district", "team", "campus") WHERE (("role" = 'campus_admin'::"text") AND ("district" IS NOT NULL) AND ("team" IS NOT NULL) AND ("campus" IS NOT NULL));



CREATE INDEX "idx_admin_roles_user_id" ON "public"."admin_roles" USING "btree" ("user_id");



CREATE INDEX "idx_ai_operations_reports_created" ON "public"."ai_operations_reports" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_allocation_optimization_events_job_created" ON "public"."allocation_optimization_events" USING "btree" ("job_id", "created_at");



CREATE INDEX "idx_allocation_optimization_jobs_optimal_reuse" ON "public"."allocation_optimization_jobs" USING "btree" ("optimization_scope", "input_hash", "completed_at" DESC) WHERE ("status" = 'OPTIMAL'::"text");



CREATE INDEX "idx_allocation_optimization_jobs_pending_execution" ON "public"."allocation_optimization_jobs" USING "btree" ("execution_mode", "requested_at") WHERE ("status" = 'PENDING'::"text");



CREATE INDEX "idx_allocation_optimization_jobs_requested" ON "public"."allocation_optimization_jobs" USING "btree" ("requested_at" DESC);



CREATE INDEX "idx_allocation_optimization_jobs_resume" ON "public"."allocation_optimization_jobs" USING "btree" ("resume_from_job_id");



CREATE INDEX "idx_allocation_optimization_jobs_source" ON "public"."allocation_optimization_jobs" USING "btree" ("source_job_id");



CREATE UNIQUE INDEX "idx_allocation_optimization_one_active_job" ON "public"."allocation_optimization_jobs" USING "btree" ((true)) WHERE ("status" = ANY (ARRAY['PENDING'::"text", 'RUNNING'::"text", 'CANCEL_REQUESTED'::"text"]));



CREATE INDEX "idx_allocation_workspace_versions_allocation_created" ON "public"."allocation_workspace_versions" USING "btree" ("allocation_id", "created_at" DESC);



CREATE UNIQUE INDEX "idx_boarding_active_bus_departure" ON "public"."boarding_bus_departures" USING "btree" ("allocation_id", "bus_id") WHERE ("cancelled_at" IS NULL);



CREATE INDEX "idx_boarding_exception_archives_allocation" ON "public"."boarding_exception_archives" USING "btree" ("allocation_id", "archived_at" DESC);



CREATE INDEX "idx_boarding_exception_reason_edit_logs_record" ON "public"."boarding_exception_reason_edit_logs" USING "btree" ("record_key", "edited_at" DESC);



CREATE INDEX "idx_boarding_exception_reason_edits_scope" ON "public"."boarding_exception_reason_edits" USING "btree" ("allocation_id", "bus_id");



CREATE INDEX "idx_boarding_manager_bus_assignments_manager" ON "public"."boarding_manager_bus_assignments" USING "btree" ("manager_user_id", "allocation_id");



CREATE UNIQUE INDEX "idx_boarding_move_requests_pending_reservation" ON "public"."boarding_move_requests" USING "btree" ("reservation_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_boarding_move_requests_requester" ON "public"."boarding_move_requests" USING "btree" ("requested_by", "requested_at" DESC);



CREATE INDEX "idx_boarding_move_requests_target_status" ON "public"."boarding_move_requests" USING "btree" ("allocation_id", "target_bus_id", "status", "requested_at" DESC);



CREATE INDEX "idx_bus_allocations_created_at" ON "public"."bus_allocations" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_bus_allocations_created_by" ON "public"."bus_allocations" USING "btree" ("created_by");



CREATE UNIQUE INDEX "idx_bus_allocations_single_confirmed" ON "public"."bus_allocations" USING "btree" ((1)) WHERE (("allocation_data" ->> 'status'::"text") = 'confirmed'::"text");



CREATE INDEX "idx_bus_allocations_status" ON "public"."bus_allocations" USING "btree" ((("allocation_data" ->> 'status'::"text")));



CREATE INDEX "idx_campus_notice_reads_notice_id" ON "public"."campus_notice_reads" USING "btree" ("notice_id");



CREATE INDEX "idx_campus_notice_targets_scope" ON "public"."campus_notice_targets" USING "btree" ("district", "team", "campus");



CREATE INDEX "idx_campus_request_audit_logs_request_created" ON "public"."campus_request_audit_logs" USING "btree" ("request_id", "created_at" DESC);



CREATE INDEX "idx_campus_request_messages_created_id" ON "public"."campus_request_messages" USING "btree" ("created_at" DESC, "id" DESC);



CREATE INDEX "idx_campus_request_messages_message_trgm" ON "public"."campus_request_messages" USING "gin" ("message" "extensions"."gin_trgm_ops");



CREATE INDEX "idx_campus_request_messages_request_created" ON "public"."campus_request_messages" USING "btree" ("request_id", "created_at");



CREATE INDEX "idx_campus_request_reads_request" ON "public"."campus_request_reads" USING "btree" ("request_id");



CREATE INDEX "idx_campus_requests_created_at" ON "public"."campus_requests" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_campus_requests_creator_recent" ON "public"."campus_requests" USING "btree" ("created_by", "created_at" DESC) WHERE ("is_global_notice" = false);



CREATE INDEX "idx_campus_requests_global_notice_created_at" ON "public"."campus_requests" USING "btree" ("is_global_notice", "created_at" DESC);



CREATE INDEX "idx_campus_requests_scope_ids_status" ON "public"."campus_requests" USING "btree" ("district_id", "team_id", "campus_id", "status");



CREATE INDEX "idx_campus_requests_scope_status" ON "public"."campus_requests" USING "btree" ("district", "team", "campus", "status");



CREATE UNIQUE INDEX "idx_campus_transfers_campus_unique" ON "public"."campus_transfers" USING "btree" ("district", "team", "campus");



CREATE INDEX "idx_campus_transfers_scope_ids" ON "public"."campus_transfers" USING "btree" ("district_id", "team_id", "campus_id");



CREATE UNIQUE INDEX "idx_campuses_team_name_unique" ON "public"."campuses" USING "btree" ("team_id", "name");



CREATE INDEX "idx_ccc_summer_campus_mappings_campus_id" ON "public"."ccc_summer_campus_mappings" USING "btree" ("campus_id");



CREATE INDEX "idx_ccc_summer_user_links_user_id" ON "public"."ccc_summer_user_links" USING "btree" ("user_id");



CREATE UNIQUE INDEX "idx_districts_name_unique" ON "public"."districts" USING "btree" ("name");



CREATE INDEX "idx_home_announcements_published_created_at" ON "public"."home_announcements" USING "btree" ("is_published", "created_at" DESC);



CREATE INDEX "idx_manual_boarding_exception_records_scope" ON "public"."manual_boarding_exception_records" USING "btree" ("allocation_id", "bus_id", "created_at" DESC);



CREATE UNIQUE INDEX "idx_payments_reservation_unique" ON "public"."payments" USING "btree" ("reservation_id") WHERE ("reservation_id" IS NOT NULL);



CREATE INDEX "idx_payments_status" ON "public"."payments" USING "btree" ("status");



CREATE INDEX "idx_payments_user_id" ON "public"."payments" USING "btree" ("user_id");



CREATE INDEX "idx_personal_inquiries_status_created" ON "public"."personal_inquiries" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_personal_inquiries_user_created" ON "public"."personal_inquiries" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_personal_inquiries_user_recent" ON "public"."personal_inquiries" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_personal_inquiry_audit_logs_inquiry_created" ON "public"."personal_inquiry_audit_logs" USING "btree" ("inquiry_id", "created_at" DESC);



CREATE INDEX "idx_personal_inquiry_messages_inquiry_created" ON "public"."personal_inquiry_messages" USING "btree" ("inquiry_id", "created_at", "id");



CREATE INDEX "idx_personal_inquiry_messages_sender_recent" ON "public"."personal_inquiry_messages" USING "btree" ("inquiry_id", "sender_id", "created_at" DESC);



CREATE INDEX "idx_personal_notifications_target_created" ON "public"."personal_notifications" USING "btree" ("target_user_id", "created_at" DESC);



CREATE INDEX "idx_personal_user_action_logs_target_created" ON "public"."personal_user_action_logs" USING "btree" ("target_user_id", "created_at" DESC);



CREATE INDEX "idx_profiles_affiliation_type" ON "public"."profiles" USING "btree" ("affiliation_type");



CREATE UNIQUE INDEX "idx_profiles_email_unique" ON "public"."profiles" USING "btree" ("email") WHERE ("email" IS NOT NULL);



CREATE INDEX "idx_profiles_scope" ON "public"."profiles" USING "btree" ("district", "team", "campus");



CREATE INDEX "idx_profiles_scope_ids" ON "public"."profiles" USING "btree" ("district_id", "team_id", "campus_id");



CREATE INDEX "idx_reservations_affiliation_type" ON "public"."reservations" USING "btree" ("affiliation_type");



CREATE INDEX "idx_reservations_boarding_confirmed_at" ON "public"."reservations" USING "btree" ("boarding_confirmed_at") WHERE ("boarding_confirmed_at" IS NOT NULL);



CREATE INDEX "idx_reservations_campus" ON "public"."reservations" USING "btree" ("campus");



CREATE INDEX "idx_reservations_campus_team" ON "public"."reservations" USING "btree" ("campus", "team");



CREATE INDEX "idx_reservations_created_at" ON "public"."reservations" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_reservations_created_id" ON "public"."reservations" USING "btree" ("created_at" DESC, "id" DESC);



CREATE INDEX "idx_reservations_scope_ids" ON "public"."reservations" USING "btree" ("district_id", "team_id", "campus_id");



CREATE INDEX "idx_reservations_status" ON "public"."reservations" USING "btree" ("status");



CREATE INDEX "idx_reservations_team" ON "public"."reservations" USING "btree" ("team");



CREATE INDEX "idx_reservations_user_id" ON "public"."reservations" USING "btree" ("user_id");



CREATE UNIQUE INDEX "idx_reservations_user_unique" ON "public"."reservations" USING "btree" ("user_id");



CREATE INDEX "idx_simulation_stage_runs_started_at" ON "public"."simulation_stage_runs" USING "btree" ("started_at" DESC);



CREATE INDEX "idx_stations_active_sort" ON "public"."stations" USING "btree" ("is_active", "sort_order", "name");



CREATE UNIQUE INDEX "idx_stations_name_unique" ON "public"."stations" USING "btree" ("name");



CREATE UNIQUE INDEX "idx_teams_district_name_unique" ON "public"."teams" USING "btree" ("district_id", "name");



CREATE OR REPLACE TRIGGER "audit_admin_campus_transfer_operation" AFTER INSERT OR DELETE OR UPDATE ON "public"."campus_transfers" FOR EACH ROW EXECUTE FUNCTION "public"."audit_admin_operation"();



CREATE OR REPLACE TRIGGER "audit_admin_invitation_code_operation" AFTER INSERT OR DELETE OR UPDATE ON "public"."admin_invitation_codes" FOR EACH ROW EXECUTE FUNCTION "public"."audit_admin_operation"();



CREATE OR REPLACE TRIGGER "audit_admin_payment_operation" AFTER INSERT OR DELETE OR UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."audit_admin_operation"();



CREATE OR REPLACE TRIGGER "audit_business_activity_event" AFTER INSERT OR DELETE OR UPDATE ON "public"."boarding_exception_archives" FOR EACH ROW EXECUTE FUNCTION "public"."audit_business_activity_event"();



CREATE OR REPLACE TRIGGER "audit_business_activity_event" AFTER INSERT OR DELETE OR UPDATE ON "public"."boarding_move_requests" FOR EACH ROW EXECUTE FUNCTION "public"."audit_business_activity_event"();



CREATE OR REPLACE TRIGGER "audit_business_activity_event" AFTER INSERT OR DELETE OR UPDATE ON "public"."bus_allocations" FOR EACH ROW EXECUTE FUNCTION "public"."audit_business_activity_event"();



CREATE OR REPLACE TRIGGER "audit_business_activity_event" AFTER INSERT OR DELETE OR UPDATE ON "public"."campus_requests" FOR EACH ROW EXECUTE FUNCTION "public"."audit_business_activity_event"();



CREATE OR REPLACE TRIGGER "audit_business_activity_event" AFTER INSERT OR DELETE OR UPDATE ON "public"."campus_transfers" FOR EACH ROW EXECUTE FUNCTION "public"."audit_business_activity_event"();



CREATE OR REPLACE TRIGGER "audit_business_activity_event" AFTER INSERT OR DELETE OR UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."audit_business_activity_event"();



CREATE OR REPLACE TRIGGER "audit_business_activity_event" AFTER INSERT OR DELETE OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."audit_business_activity_event"();



CREATE OR REPLACE TRIGGER "audit_business_activity_event" AFTER INSERT OR DELETE OR UPDATE ON "public"."reservations" FOR EACH ROW EXECUTE FUNCTION "public"."audit_business_activity_event"();



CREATE OR REPLACE TRIGGER "audit_campus_request_change" AFTER UPDATE ON "public"."campus_requests" FOR EACH ROW EXECUTE FUNCTION "public"."audit_campus_request_change"();



CREATE OR REPLACE TRIGGER "audit_campus_request_message_change" AFTER DELETE OR UPDATE ON "public"."campus_request_messages" FOR EACH ROW EXECUTE FUNCTION "public"."audit_campus_request_message_change"();



CREATE OR REPLACE TRIGGER "audit_personal_inquiry_change" AFTER UPDATE ON "public"."personal_inquiries" FOR EACH ROW EXECUTE FUNCTION "public"."audit_personal_inquiry_change"();



CREATE OR REPLACE TRIGGER "audit_personal_inquiry_message" AFTER INSERT ON "public"."personal_inquiry_messages" FOR EACH ROW EXECUTE FUNCTION "public"."audit_personal_inquiry_message"();



CREATE OR REPLACE TRIGGER "backfill_confirmed_allocation_ticket_bus_ids" AFTER INSERT OR UPDATE OF "allocation_data" ON "public"."bus_allocations" FOR EACH ROW EXECUTE FUNCTION "public"."backfill_confirmed_allocation_ticket_bus_ids"();



CREATE OR REPLACE TRIGGER "block_allocation_cancel_after_departure" BEFORE UPDATE OF "allocation_data" ON "public"."bus_allocations" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_allocation_cancel_after_departure"();



CREATE OR REPLACE TRIGGER "enforce_external_payment_global_admin" BEFORE INSERT OR UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_external_payment_global_admin"();



CREATE OR REPLACE TRIGGER "enforce_payment_mutation_financial_safety" BEFORE INSERT OR UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_payment_mutation_financial_safety"();



CREATE OR REPLACE TRIGGER "enforce_single_confirmed_allocation" BEFORE INSERT OR UPDATE OF "allocation_data" ON "public"."bus_allocations" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_single_confirmed_allocation"();



CREATE OR REPLACE TRIGGER "lock_allocation_optimization_job_creation" BEFORE INSERT ON "public"."allocation_optimization_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."lock_allocation_optimization_job_creation"();



CREATE OR REPLACE TRIGGER "lock_allocation_planning_bus_writes" BEFORE INSERT OR DELETE OR UPDATE ON "public"."bus_allocations" FOR EACH ROW EXECUTE FUNCTION "public"."lock_allocation_planning_writes"();



CREATE OR REPLACE TRIGGER "lock_departed_bus_check_in_code_changes" BEFORE INSERT OR DELETE OR UPDATE ON "public"."boarding_check_in_codes" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_departed_bus_check_in_code_changes"();



CREATE OR REPLACE TRIGGER "lock_departed_bus_reservation_changes" BEFORE UPDATE ON "public"."reservations" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_departed_bus_reservation_changes"();



CREATE OR REPLACE TRIGGER "lock_departed_bus_walk_in_changes" BEFORE INSERT OR DELETE OR UPDATE ON "public"."boarding_walk_in_passengers" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_departed_bus_walk_in_changes"();



CREATE OR REPLACE TRIGGER "mark_allocation_job_result_reused" AFTER INSERT ON "public"."allocation_optimization_events" FOR EACH ROW EXECUTE FUNCTION "public"."mark_allocation_job_result_reused"();



CREATE OR REPLACE TRIGGER "normalize_allocation_remaining_seat_passengers" BEFORE INSERT OR UPDATE OF "allocation_data" ON "public"."bus_allocations" FOR EACH ROW EXECUTE FUNCTION "public"."normalize_allocation_remaining_seat_passengers"();



CREATE OR REPLACE TRIGGER "normalize_confirmed_allocation_name" BEFORE INSERT OR UPDATE OF "allocation_name", "allocation_data" ON "public"."bus_allocations" FOR EACH ROW EXECUTE FUNCTION "public"."normalize_confirmed_allocation_name"();



CREATE OR REPLACE TRIGGER "prevent_locked_affiliation_change" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_locked_affiliation_change"();



CREATE OR REPLACE TRIGGER "prune_activity_event_logs_daily" AFTER INSERT ON "public"."activity_event_logs" FOR EACH STATEMENT EXECUTE FUNCTION "public"."prune_activity_event_logs_daily"();



CREATE OR REPLACE TRIGGER "prune_allocation_optimization_jobs_after_insert" AFTER INSERT ON "public"."allocation_optimization_jobs" FOR EACH STATEMENT EXECUTE FUNCTION "public"."prune_allocation_optimization_jobs_after_insert"();



CREATE OR REPLACE TRIGGER "refresh_admin_role_scope_after_campus_change" AFTER UPDATE OF "name", "team_id" ON "public"."campuses" FOR EACH ROW EXECUTE FUNCTION "public"."refresh_admin_role_organization_scope"();



CREATE OR REPLACE TRIGGER "refresh_admin_role_scope_after_district_change" AFTER UPDATE OF "name" ON "public"."districts" FOR EACH ROW EXECUTE FUNCTION "public"."refresh_admin_role_organization_scope"();



CREATE OR REPLACE TRIGGER "refresh_admin_role_scope_after_team_change" AFTER UPDATE OF "name", "district_id" ON "public"."teams" FOR EACH ROW EXECUTE FUNCTION "public"."refresh_admin_role_organization_scope"();



CREATE OR REPLACE TRIGGER "refresh_campus_request_scope_after_campus_change" AFTER UPDATE OF "name", "team_id" ON "public"."campuses" FOR EACH ROW EXECUTE FUNCTION "public"."refresh_campus_request_organization_scope"();



CREATE OR REPLACE TRIGGER "refresh_campus_request_scope_after_district_change" AFTER UPDATE OF "name" ON "public"."districts" FOR EACH ROW EXECUTE FUNCTION "public"."refresh_campus_request_organization_scope"();



CREATE OR REPLACE TRIGGER "refresh_campus_request_scope_after_team_change" AFTER UPDATE OF "name", "district_id" ON "public"."teams" FOR EACH ROW EXECUTE FUNCTION "public"."refresh_campus_request_organization_scope"();



CREATE OR REPLACE TRIGGER "refresh_profile_scope_after_campus_change" AFTER UPDATE OF "name", "team_id" ON "public"."campuses" FOR EACH ROW EXECUTE FUNCTION "public"."refresh_profile_organization_scope"();



CREATE OR REPLACE TRIGGER "refresh_profile_scope_after_district_change" AFTER UPDATE OF "name" ON "public"."districts" FOR EACH ROW EXECUTE FUNCTION "public"."refresh_profile_organization_scope"();



CREATE OR REPLACE TRIGGER "refresh_profile_scope_after_team_change" AFTER UPDATE OF "name", "district_id" ON "public"."teams" FOR EACH ROW EXECUTE FUNCTION "public"."refresh_profile_organization_scope"();



CREATE OR REPLACE TRIGGER "refresh_reservation_scope_after_campus_change" AFTER UPDATE OF "name", "team_id" ON "public"."campuses" FOR EACH ROW EXECUTE FUNCTION "public"."refresh_reservation_organization_scope"();



CREATE OR REPLACE TRIGGER "refresh_reservation_scope_after_district_change" AFTER UPDATE OF "name" ON "public"."districts" FOR EACH ROW EXECUTE FUNCTION "public"."refresh_reservation_organization_scope"();



CREATE OR REPLACE TRIGGER "refresh_reservation_scope_after_team_change" AFTER UPDATE OF "name", "district_id" ON "public"."teams" FOR EACH ROW EXECUTE FUNCTION "public"."refresh_reservation_organization_scope"();



CREATE OR REPLACE TRIGGER "require_closed_deadline_for_allocation_job" BEFORE INSERT ON "public"."allocation_optimization_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."require_closed_reservation_deadline_for_optimization_job"();



CREATE OR REPLACE TRIGGER "require_closed_deadline_for_bus_allocation" BEFORE INSERT OR UPDATE ON "public"."bus_allocations" FOR EACH ROW EXECUTE FUNCTION "public"."require_closed_reservation_deadline_for_bus_allocation"();



CREATE OR REPLACE TRIGGER "reset_boarding_confirmation_on_ticket_change" BEFORE UPDATE OF "status", "confirmed_ticket" ON "public"."reservations" FOR EACH ROW EXECUTE FUNCTION "public"."reset_boarding_confirmation_on_ticket_change"();



CREATE OR REPLACE TRIGGER "reset_bus_departures_on_allocation_cancel" AFTER UPDATE OF "allocation_data" ON "public"."bus_allocations" FOR EACH ROW EXECUTE FUNCTION "public"."reset_bus_departures_on_allocation_cancel"();



CREATE OR REPLACE TRIGGER "set_admin_roles_updated_at" BEFORE UPDATE ON "public"."admin_roles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_allocation_optimization_job_updated_at" BEFORE UPDATE ON "public"."allocation_optimization_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."set_allocation_optimization_job_updated_at"();



CREATE OR REPLACE TRIGGER "set_app_settings_updated_at" BEFORE UPDATE ON "public"."app_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_app_settings_updated_at"();



CREATE OR REPLACE TRIGGER "set_bus_allocation_canonical_totals" BEFORE INSERT OR UPDATE OF "allocation_data", "total_cost", "total_capacity" ON "public"."bus_allocations" FOR EACH ROW EXECUTE FUNCTION "public"."set_bus_allocation_canonical_totals"();



CREATE OR REPLACE TRIGGER "set_campus_requests_updated_at" BEFORE UPDATE ON "public"."campus_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_campus_requests_updated_at"();



CREATE OR REPLACE TRIGGER "set_campus_transfer_scope_ids" BEFORE INSERT OR UPDATE ON "public"."campus_transfers" FOR EACH ROW EXECUTE FUNCTION "public"."set_campus_transfer_scope_ids"();



CREATE OR REPLACE TRIGGER "set_campuses_updated_at" BEFORE UPDATE ON "public"."campuses" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_districts_updated_at" BEFORE UPDATE ON "public"."districts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_home_announcements_updated_at" BEFORE UPDATE ON "public"."home_announcements" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_payments_updated_at" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_reservation_confirmed_ticket_bus_id" BEFORE INSERT OR UPDATE OF "status", "confirmed_ticket", "data" ON "public"."reservations" FOR EACH ROW EXECUTE FUNCTION "public"."set_reservation_confirmed_ticket_bus_id"();



CREATE OR REPLACE TRIGGER "set_reservations_updated_at" BEFORE UPDATE ON "public"."reservations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_stations_updated_at" BEFORE UPDATE ON "public"."stations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_teams_updated_at" BEFORE UPDATE ON "public"."teams" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "sync_admin_role_organization_scope" BEFORE INSERT OR UPDATE OF "role", "district_id", "district", "team_id", "team", "campus_id", "campus" ON "public"."admin_roles" FOR EACH ROW EXECUTE FUNCTION "public"."sync_admin_role_organization_scope"();



CREATE OR REPLACE TRIGGER "sync_campus_request_organization_scope" BEFORE INSERT OR UPDATE OF "is_global_notice", "district_id", "district", "team_id", "team", "campus_id", "campus" ON "public"."campus_requests" FOR EACH ROW EXECUTE FUNCTION "public"."sync_campus_request_organization_scope"();



CREATE OR REPLACE TRIGGER "sync_profile_organization_scope" BEFORE INSERT OR UPDATE OF "affiliation_type", "district_id", "district", "team_id", "team", "campus_id", "campus" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."sync_profile_organization_scope"();



CREATE OR REPLACE TRIGGER "sync_reservation_canonical_fields" BEFORE INSERT OR UPDATE OF "status", "confirmed_ticket", "data" ON "public"."reservations" FOR EACH ROW EXECUTE FUNCTION "public"."sync_reservation_canonical_fields"();



CREATE OR REPLACE TRIGGER "sync_reservation_organization_scope" BEFORE INSERT OR UPDATE OF "affiliation_type", "district_id", "district", "team_id", "team", "campus_id", "campus" ON "public"."reservations" FOR EACH ROW EXECUTE FUNCTION "public"."sync_reservation_organization_scope"();



CREATE OR REPLACE TRIGGER "validate_allocation_bus_identifiers" BEFORE INSERT OR UPDATE OF "allocation_data" ON "public"."bus_allocations" FOR EACH ROW EXECUTE FUNCTION "public"."validate_allocation_bus_identifiers"();



CREATE OR REPLACE TRIGGER "validate_boarding_walk_in_seat_conflicts" BEFORE INSERT OR UPDATE OF "allocation_data" ON "public"."bus_allocations" FOR EACH ROW EXECUTE FUNCTION "public"."validate_boarding_walk_in_seat_conflicts"();



CREATE OR REPLACE TRIGGER "validate_campus_transfer_financial_snapshot" BEFORE INSERT OR UPDATE ON "public"."campus_transfers" FOR EACH ROW EXECUTE FUNCTION "public"."validate_campus_transfer_financial_snapshot"();



CREATE OR REPLACE TRIGGER "zz_sync_reservation_data_from_columns" BEFORE INSERT OR UPDATE ON "public"."reservations" FOR EACH ROW EXECUTE FUNCTION "public"."sync_reservation_data_from_columns"();



ALTER TABLE ONLY "public"."activity_event_logs"
    ADD CONSTRAINT "activity_event_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_action_audit_logs"
    ADD CONSTRAINT "admin_action_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_invitation_codes"
    ADD CONSTRAINT "admin_invitation_codes_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_invitation_codes"
    ADD CONSTRAINT "admin_invitation_codes_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_invitation_codes"
    ADD CONSTRAINT "admin_invitation_codes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_invitation_codes"
    ADD CONSTRAINT "admin_invitation_codes_used_by_fkey" FOREIGN KEY ("used_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_roles"
    ADD CONSTRAINT "admin_roles_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id");



ALTER TABLE ONLY "public"."admin_roles"
    ADD CONSTRAINT "admin_roles_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id");



ALTER TABLE ONLY "public"."admin_roles"
    ADD CONSTRAINT "admin_roles_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."admin_roles"
    ADD CONSTRAINT "admin_roles_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id");



ALTER TABLE ONLY "public"."admin_roles"
    ADD CONSTRAINT "admin_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_operations_reports"
    ADD CONSTRAINT "ai_operations_reports_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_report_log_settings"
    ADD CONSTRAINT "ai_report_log_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."allocation_optimization_events"
    ADD CONSTRAINT "allocation_optimization_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."allocation_optimization_jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."allocation_optimization_jobs"
    ADD CONSTRAINT "allocation_optimization_jobs_resume_from_job_id_fkey" FOREIGN KEY ("resume_from_job_id") REFERENCES "public"."allocation_optimization_jobs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."allocation_optimization_jobs"
    ADD CONSTRAINT "allocation_optimization_jobs_source_job_id_fkey" FOREIGN KEY ("source_job_id") REFERENCES "public"."allocation_optimization_jobs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."allocation_workspace_versions"
    ADD CONSTRAINT "allocation_workspace_versions_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "public"."bus_allocations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."boarding_bus_departures"
    ADD CONSTRAINT "boarding_bus_departures_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "public"."bus_allocations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."boarding_bus_departures"
    ADD CONSTRAINT "boarding_bus_departures_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."boarding_bus_departures"
    ADD CONSTRAINT "boarding_bus_departures_departed_by_fkey" FOREIGN KEY ("departed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."boarding_check_in_attempts"
    ADD CONSTRAINT "boarding_check_in_attempts_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "public"."bus_allocations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."boarding_check_in_attempts"
    ADD CONSTRAINT "boarding_check_in_attempts_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."boarding_check_in_codes"
    ADD CONSTRAINT "boarding_check_in_codes_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "public"."bus_allocations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."boarding_check_in_codes"
    ADD CONSTRAINT "boarding_check_in_codes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."boarding_exception_archives"
    ADD CONSTRAINT "boarding_exception_archives_archived_by_fkey" FOREIGN KEY ("archived_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."boarding_exception_reason_edit_logs"
    ADD CONSTRAINT "boarding_exception_reason_edit_logs_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "public"."bus_allocations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."boarding_exception_reason_edit_logs"
    ADD CONSTRAINT "boarding_exception_reason_edit_logs_edited_by_fkey" FOREIGN KEY ("edited_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."boarding_exception_reason_edits"
    ADD CONSTRAINT "boarding_exception_reason_edits_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "public"."bus_allocations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."boarding_exception_reason_edits"
    ADD CONSTRAINT "boarding_exception_reason_edits_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."boarding_manager_bus_assignments"
    ADD CONSTRAINT "boarding_manager_bus_assignments_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "public"."bus_allocations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."boarding_manager_bus_assignments"
    ADD CONSTRAINT "boarding_manager_bus_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."boarding_manager_bus_assignments"
    ADD CONSTRAINT "boarding_manager_bus_assignments_manager_user_id_fkey" FOREIGN KEY ("manager_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."boarding_move_requests"
    ADD CONSTRAINT "boarding_move_requests_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "public"."bus_allocations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."boarding_move_requests"
    ADD CONSTRAINT "boarding_move_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."boarding_move_requests"
    ADD CONSTRAINT "boarding_move_requests_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."boarding_move_requests"
    ADD CONSTRAINT "boarding_move_requests_responded_by_fkey" FOREIGN KEY ("responded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."boarding_status_events"
    ADD CONSTRAINT "boarding_status_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."boarding_status_events"
    ADD CONSTRAINT "boarding_status_events_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."boarding_walk_in_passengers"
    ADD CONSTRAINT "boarding_walk_in_passengers_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "public"."bus_allocations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."boarding_walk_in_passengers"
    ADD CONSTRAINT "boarding_walk_in_passengers_boarding_no_show_departure_id_fkey" FOREIGN KEY ("boarding_no_show_departure_id") REFERENCES "public"."boarding_bus_departures"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."boarding_walk_in_passengers"
    ADD CONSTRAINT "boarding_walk_in_passengers_boarding_status_updated_by_fkey" FOREIGN KEY ("boarding_status_updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."boarding_walk_in_passengers"
    ADD CONSTRAINT "boarding_walk_in_passengers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bus_allocations"
    ADD CONSTRAINT "bus_allocations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."campus_notice_reads"
    ADD CONSTRAINT "campus_notice_reads_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "public"."campus_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campus_notice_reads"
    ADD CONSTRAINT "campus_notice_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campus_notice_targets"
    ADD CONSTRAINT "campus_notice_targets_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "public"."campus_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campus_payment_accounts"
    ADD CONSTRAINT "campus_payment_accounts_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campus_payment_accounts"
    ADD CONSTRAINT "campus_payment_accounts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campus_request_audit_logs"
    ADD CONSTRAINT "campus_request_audit_logs_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."campus_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campus_request_messages"
    ADD CONSTRAINT "campus_request_messages_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."campus_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campus_request_reads"
    ADD CONSTRAINT "campus_request_reads_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."campus_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campus_request_reads"
    ADD CONSTRAINT "campus_request_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campus_requests"
    ADD CONSTRAINT "campus_requests_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id");



ALTER TABLE ONLY "public"."campus_requests"
    ADD CONSTRAINT "campus_requests_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id");



ALTER TABLE ONLY "public"."campus_requests"
    ADD CONSTRAINT "campus_requests_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id");



ALTER TABLE ONLY "public"."campus_transfers"
    ADD CONSTRAINT "campus_transfers_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id");



ALTER TABLE ONLY "public"."campus_transfers"
    ADD CONSTRAINT "campus_transfers_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."campus_transfers"
    ADD CONSTRAINT "campus_transfers_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id");



ALTER TABLE ONLY "public"."campus_transfers"
    ADD CONSTRAINT "campus_transfers_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."campus_transfers"
    ADD CONSTRAINT "campus_transfers_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id");



ALTER TABLE ONLY "public"."campuses"
    ADD CONSTRAINT "campuses_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ccc_summer_campus_mappings"
    ADD CONSTRAINT "ccc_summer_campus_mappings_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ccc_summer_campus_mappings"
    ADD CONSTRAINT "ccc_summer_campus_mappings_mapped_by_fkey" FOREIGN KEY ("mapped_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ccc_summer_user_links"
    ADD CONSTRAINT "ccc_summer_user_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."home_announcements"
    ADD CONSTRAINT "home_announcements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."manual_boarding_exception_records"
    ADD CONSTRAINT "manual_boarding_exception_records_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "public"."bus_allocations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."manual_boarding_exception_records"
    ADD CONSTRAINT "manual_boarding_exception_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."manual_boarding_exception_records"
    ADD CONSTRAINT "manual_boarding_exception_records_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."personal_inquiries"
    ADD CONSTRAINT "personal_inquiries_handled_by_fkey" FOREIGN KEY ("handled_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."personal_inquiries"
    ADD CONSTRAINT "personal_inquiries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personal_inquiry_audit_logs"
    ADD CONSTRAINT "personal_inquiry_audit_logs_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "public"."personal_inquiries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personal_inquiry_messages"
    ADD CONSTRAINT "personal_inquiry_messages_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "public"."personal_inquiries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personal_inquiry_messages"
    ADD CONSTRAINT "personal_inquiry_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personal_inquiry_reads"
    ADD CONSTRAINT "personal_inquiry_reads_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "public"."personal_inquiries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personal_inquiry_reads"
    ADD CONSTRAINT "personal_inquiry_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personal_notifications"
    ADD CONSTRAINT "personal_notifications_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."personal_notifications"
    ADD CONSTRAINT "personal_notifications_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personal_user_action_logs"
    ADD CONSTRAINT "personal_user_action_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."personal_user_action_logs"
    ADD CONSTRAINT "personal_user_action_logs_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."personal_user_action_logs"
    ADD CONSTRAINT "personal_user_action_logs_reverted_by_fkey" FOREIGN KEY ("reverted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."personal_user_action_logs"
    ADD CONSTRAINT "personal_user_action_logs_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id");



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_boarding_no_show_departure_id_fkey" FOREIGN KEY ("boarding_no_show_departure_id") REFERENCES "public"."boarding_bus_departures"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_boarding_note_updated_by_fkey" FOREIGN KEY ("boarding_note_updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_boarding_status_updated_by_fkey" FOREIGN KEY ("boarding_status_updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id");



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id");



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id");



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."simulation_stage_runs"
    ADD CONSTRAINT "simulation_stage_runs_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can create campus request messages" ON "public"."campus_request_messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = "auth"."uid"()) AND ((EXISTS ( SELECT 1
   FROM "public"."admin_roles"
  WHERE (("admin_roles"."user_id" = "auth"."uid"()) AND ("admin_roles"."role" = 'global_admin'::"text") AND ("campus_request_messages"."sender_role" = 'global_admin'::"text")))) OR (EXISTS ( SELECT 1
   FROM ("public"."campus_requests"
     JOIN "public"."admin_roles" ON (("admin_roles"."user_id" = "auth"."uid"())))
  WHERE (("campus_requests"."id" = "campus_request_messages"."request_id") AND ("admin_roles"."role" = 'campus_admin'::"text") AND ((("admin_roles"."district_id" = "campus_requests"."district_id") AND ("admin_roles"."team_id" = "campus_requests"."team_id") AND ("admin_roles"."campus_id" = "campus_requests"."campus_id")) OR (("admin_roles"."district" = "campus_requests"."district") AND ("admin_roles"."team" = "campus_requests"."team") AND ("admin_roles"."campus" = "campus_requests"."campus"))) AND ("campus_request_messages"."sender_role" = 'campus_admin'::"text")))))));



CREATE POLICY "Admins can create own campus request reads" ON "public"."campus_request_reads" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Admins can delete own campus request messages" ON "public"."campus_request_messages" FOR DELETE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."admin_roles"
  WHERE (("admin_roles"."user_id" = "auth"."uid"()) AND ("admin_roles"."role" = 'global_admin'::"text")))) OR (("sender_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM ("public"."campus_requests"
     JOIN "public"."admin_roles" ON (("admin_roles"."user_id" = "auth"."uid"())))
  WHERE (("campus_requests"."id" = "campus_request_messages"."request_id") AND ("admin_roles"."role" = 'campus_admin'::"text") AND ((("admin_roles"."district_id" = "campus_requests"."district_id") AND ("admin_roles"."team_id" = "campus_requests"."team_id") AND ("admin_roles"."campus_id" = "campus_requests"."campus_id")) OR (("admin_roles"."district" = "campus_requests"."district") AND ("admin_roles"."team" = "campus_requests"."team") AND ("admin_roles"."campus" = "campus_requests"."campus"))) AND ("campus_request_messages"."sender_role" = 'campus_admin'::"text")))))));



CREATE POLICY "Admins can update own campus request messages" ON "public"."campus_request_messages" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."admin_roles"
  WHERE (("admin_roles"."user_id" = "auth"."uid"()) AND ("admin_roles"."role" = 'global_admin'::"text")))) OR (("sender_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM ("public"."campus_requests"
     JOIN "public"."admin_roles" ON (("admin_roles"."user_id" = "auth"."uid"())))
  WHERE (("campus_requests"."id" = "campus_request_messages"."request_id") AND ("admin_roles"."role" = 'campus_admin'::"text") AND ((("admin_roles"."district_id" = "campus_requests"."district_id") AND ("admin_roles"."team_id" = "campus_requests"."team_id") AND ("admin_roles"."campus_id" = "campus_requests"."campus_id")) OR (("admin_roles"."district" = "campus_requests"."district") AND ("admin_roles"."team" = "campus_requests"."team") AND ("admin_roles"."campus" = "campus_requests"."campus"))) AND ("campus_request_messages"."sender_role" = 'campus_admin'::"text"))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."admin_roles"
  WHERE (("admin_roles"."user_id" = "auth"."uid"()) AND ("admin_roles"."role" = 'global_admin'::"text")))) OR (("sender_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM ("public"."campus_requests"
     JOIN "public"."admin_roles" ON (("admin_roles"."user_id" = "auth"."uid"())))
  WHERE (("campus_requests"."id" = "campus_request_messages"."request_id") AND ("admin_roles"."role" = 'campus_admin'::"text") AND ((("admin_roles"."district_id" = "campus_requests"."district_id") AND ("admin_roles"."team_id" = "campus_requests"."team_id") AND ("admin_roles"."campus_id" = "campus_requests"."campus_id")) OR (("admin_roles"."district" = "campus_requests"."district") AND ("admin_roles"."team" = "campus_requests"."team") AND ("admin_roles"."campus" = "campus_requests"."campus"))) AND ("campus_request_messages"."sender_role" = 'campus_admin'::"text")))))));



CREATE POLICY "Admins can update own campus request reads" ON "public"."campus_request_reads" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Admins can view campus notice targets" ON "public"."campus_notice_targets" FOR SELECT TO "authenticated" USING (("public"."is_global_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."admin_roles"
  WHERE (("admin_roles"."user_id" = "auth"."uid"()) AND ("admin_roles"."role" = 'campus_admin'::"text") AND ("admin_roles"."district" = "campus_notice_targets"."district") AND ("admin_roles"."team" = "campus_notice_targets"."team") AND ("admin_roles"."campus" = "campus_notice_targets"."campus"))))));



CREATE POLICY "Admins can view campus request messages" ON "public"."campus_request_messages" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."admin_roles"
  WHERE (("admin_roles"."user_id" = "auth"."uid"()) AND ("admin_roles"."role" = 'global_admin'::"text")))) OR (EXISTS ( SELECT 1
   FROM ("public"."campus_requests"
     JOIN "public"."admin_roles" ON (("admin_roles"."user_id" = "auth"."uid"())))
  WHERE (("campus_requests"."id" = "campus_request_messages"."request_id") AND ("campus_requests"."is_global_notice" = true) AND ("admin_roles"."role" = 'campus_admin'::"text")))) OR (EXISTS ( SELECT 1
   FROM ("public"."campus_requests"
     JOIN "public"."admin_roles" ON (("admin_roles"."user_id" = "auth"."uid"())))
  WHERE (("campus_requests"."id" = "campus_request_messages"."request_id") AND ("admin_roles"."role" = 'campus_admin'::"text") AND ((("admin_roles"."district_id" = "campus_requests"."district_id") AND ("admin_roles"."team_id" = "campus_requests"."team_id") AND ("admin_roles"."campus_id" = "campus_requests"."campus_id")) OR (("admin_roles"."district" = "campus_requests"."district") AND ("admin_roles"."team" = "campus_requests"."team") AND ("admin_roles"."campus" = "campus_requests"."campus"))))))));



CREATE POLICY "Admins can view campus requests" ON "public"."campus_requests" FOR SELECT TO "authenticated" USING (("public"."is_global_admin"() OR (("is_global_notice" = true) AND ("is_archived" = false) AND (EXISTS ( SELECT 1
   FROM "public"."admin_roles"
  WHERE (("admin_roles"."user_id" = "auth"."uid"()) AND ("admin_roles"."role" = 'campus_admin'::"text") AND (EXISTS ( SELECT 1
           FROM "public"."campus_notice_targets"
          WHERE (("campus_notice_targets"."notice_id" = "campus_requests"."id") AND ("campus_notice_targets"."district" = "admin_roles"."district") AND ("campus_notice_targets"."team" = "admin_roles"."team") AND ("campus_notice_targets"."campus" = "admin_roles"."campus")))))))) OR (("is_global_notice" = false) AND (EXISTS ( SELECT 1
   FROM "public"."admin_roles"
  WHERE (("admin_roles"."user_id" = "auth"."uid"()) AND ("admin_roles"."role" = 'campus_admin'::"text") AND ("admin_roles"."district" = "campus_requests"."district") AND ("admin_roles"."team" = "campus_requests"."team") AND ("admin_roles"."campus" = "campus_requests"."campus")))))));



CREATE POLICY "Admins can view campus transfers" ON "public"."campus_transfers" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."admin_roles"
  WHERE (("admin_roles"."user_id" = "auth"."uid"()) AND (("admin_roles"."role" = 'global_admin'::"text") OR (("admin_roles"."role" = 'campus_admin'::"text") AND ("admin_roles"."district" = "campus_transfers"."district") AND ("admin_roles"."team" = "campus_transfers"."team") AND ("admin_roles"."campus" = "campus_transfers"."campus")))))));



CREATE POLICY "Admins can view own campus request reads" ON "public"."campus_request_reads" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Anyone can view active campuses" ON "public"."campuses" FOR SELECT TO "authenticated", "anon" USING (("is_active" = true));



CREATE POLICY "Anyone can view active districts" ON "public"."districts" FOR SELECT TO "authenticated", "anon" USING (("is_active" = true));



CREATE POLICY "Anyone can view active teams" ON "public"."teams" FOR SELECT TO "authenticated", "anon" USING (("is_active" = true));



CREATE POLICY "Anyone can view published home announcements" ON "public"."home_announcements" FOR SELECT TO "authenticated", "anon" USING ((("is_published" = true) AND ("is_archived" = false) AND (("publish_start_at" IS NULL) OR ("publish_start_at" <= "now"())) AND (("publish_end_at" IS NULL) OR ("publish_end_at" > "now"()))));



CREATE POLICY "Authenticated users can view app settings" ON "public"."app_settings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view bus options" ON "public"."bus_options" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view stations" ON "public"."stations" FOR SELECT TO "authenticated" USING (("is_active" = true));



CREATE POLICY "Boarding managers can view boarding events" ON "public"."boarding_status_events" FOR SELECT TO "authenticated" USING ("public"."can_manage_boarding_reservation"("reservation_id"));



CREATE POLICY "Boarding managers can view bus departures" ON "public"."boarding_bus_departures" FOR SELECT TO "authenticated" USING ("public"."can_manage_boarding_bus"("allocation_id", "bus_id"));



CREATE POLICY "Boarding managers can view reservations" ON "public"."reservations" FOR SELECT TO "authenticated" USING ("public"."can_manage_boarding_reservation"("id"));



CREATE POLICY "Boarding managers can view their bus assignments" ON "public"."boarding_manager_bus_assignments" FOR SELECT TO "authenticated" USING (("public"."is_global_admin"() OR ("manager_user_id" = "auth"."uid"())));



CREATE POLICY "Campus admins can create campus requests" ON "public"."campus_requests" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND ("is_global_notice" = false) AND ("type" <> 'notice'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."admin_roles"
  WHERE (("admin_roles"."user_id" = "auth"."uid"()) AND ("admin_roles"."role" = 'campus_admin'::"text") AND ((("admin_roles"."district_id" = "campus_requests"."district_id") AND ("admin_roles"."team_id" = "campus_requests"."team_id") AND ("admin_roles"."campus_id" = "campus_requests"."campus_id")) OR (("admin_roles"."district" = "campus_requests"."district") AND ("admin_roles"."team" = "campus_requests"."team") AND ("admin_roles"."campus" = "campus_requests"."campus"))))))));



CREATE POLICY "Campus admins can view campus payments" ON "public"."payments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."reservations"
     JOIN "public"."admin_roles" ON (((("admin_roles"."district_id" = "reservations"."district_id") AND ("admin_roles"."team_id" = "reservations"."team_id") AND ("admin_roles"."campus_id" = "reservations"."campus_id")) OR (("admin_roles"."district" = "reservations"."district") AND ("admin_roles"."team" = "reservations"."team") AND ("admin_roles"."campus" = "reservations"."campus")))))
  WHERE (("reservations"."id" = "payments"."reservation_id") AND ("admin_roles"."user_id" = "auth"."uid"()) AND ("admin_roles"."role" = 'campus_admin'::"text")))));



CREATE POLICY "Campus admins can view campus reservations" ON "public"."reservations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_roles"
  WHERE (("admin_roles"."user_id" = "auth"."uid"()) AND ("admin_roles"."role" = 'campus_admin'::"text") AND ((("admin_roles"."district_id" = "reservations"."district_id") AND ("admin_roles"."team_id" = "reservations"."team_id") AND ("admin_roles"."campus_id" = "reservations"."campus_id")) OR (("admin_roles"."district" = "reservations"."district") AND ("admin_roles"."team" = "reservations"."team") AND ("admin_roles"."campus" = "reservations"."campus")))))));



CREATE POLICY "Global admins can create campus notices" ON "public"."campus_requests" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND ("is_global_notice" = true) AND ("type" = 'notice'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."admin_roles"
  WHERE (("admin_roles"."user_id" = "auth"."uid"()) AND ("admin_roles"."role" = 'global_admin'::"text"))))));



CREATE POLICY "Global admins can manage profiles" ON "public"."profiles" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_roles"
  WHERE (("admin_roles"."user_id" = "auth"."uid"()) AND ("admin_roles"."role" = 'global_admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admin_roles"
  WHERE (("admin_roles"."user_id" = "auth"."uid"()) AND ("admin_roles"."role" = 'global_admin'::"text")))));



CREATE POLICY "Global admins can update campus requests" ON "public"."campus_requests" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_roles"
  WHERE (("admin_roles"."user_id" = "auth"."uid"()) AND ("admin_roles"."role" = 'global_admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admin_roles"
  WHERE (("admin_roles"."user_id" = "auth"."uid"()) AND ("admin_roles"."role" = 'global_admin'::"text")))));



CREATE POLICY "Global admins can view AI operations reports" ON "public"."ai_operations_reports" FOR SELECT TO "authenticated" USING ("public"."is_global_admin"());



CREATE POLICY "Global admins can view AI report log settings" ON "public"."ai_report_log_settings" FOR SELECT TO "authenticated" USING ("public"."is_global_admin"());



CREATE POLICY "Global admins can view activity event logs" ON "public"."activity_event_logs" FOR SELECT TO "authenticated" USING ("public"."is_global_admin"());



CREATE POLICY "Global admins can view admin action audit logs" ON "public"."admin_action_audit_logs" FOR SELECT TO "authenticated" USING ("public"."is_global_admin"());



CREATE POLICY "Global admins can view admin roles" ON "public"."admin_roles" FOR SELECT TO "authenticated" USING ("public"."is_global_admin"());



CREATE POLICY "Global admins can view all home announcements" ON "public"."home_announcements" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_roles"
  WHERE (("admin_roles"."user_id" = "auth"."uid"()) AND ("admin_roles"."role" = 'global_admin'::"text")))));



CREATE POLICY "Global admins can view all payments" ON "public"."payments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_roles"
  WHERE (("admin_roles"."user_id" = "auth"."uid"()) AND ("admin_roles"."role" = 'global_admin'::"text")))));



CREATE POLICY "Global admins can view all profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_roles"
  WHERE (("admin_roles"."user_id" = "auth"."uid"()) AND ("admin_roles"."role" = 'global_admin'::"text")))));



CREATE POLICY "Global admins can view all reservations" ON "public"."reservations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_roles"
  WHERE (("admin_roles"."user_id" = "auth"."uid"()) AND ("admin_roles"."role" = 'global_admin'::"text")))));



CREATE POLICY "Global admins can view bus allocations" ON "public"."bus_allocations" FOR SELECT TO "authenticated" USING ("public"."is_global_admin"());



CREATE POLICY "Global admins can view campus request audit logs" ON "public"."campus_request_audit_logs" FOR SELECT TO "authenticated" USING ("public"."is_global_admin"());



CREATE POLICY "Global admins can view invitation codes" ON "public"."admin_invitation_codes" FOR SELECT TO "authenticated" USING ("public"."is_global_admin"());



CREATE POLICY "Global admins can view personal user action logs" ON "public"."personal_user_action_logs" FOR SELECT TO "authenticated" USING ("public"."is_global_admin"());



CREATE POLICY "Global admins can view simulation stage runs" ON "public"."simulation_stage_runs" FOR SELECT TO "authenticated" USING ("public"."is_global_admin"());



CREATE POLICY "Initial campus request messages cannot be deleted" ON "public"."campus_request_messages" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((NOT "public"."is_initial_campus_request_message"("id")));



CREATE POLICY "Initial campus request messages cannot be updated" ON "public"."campus_request_messages" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT "public"."is_initial_campus_request_message"("id"))) WITH CHECK ((NOT "public"."is_initial_campus_request_message"("id")));



CREATE POLICY "Users and global admins can view personal inquiries" ON "public"."personal_inquiries" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_global_admin"()));



CREATE POLICY "Users and global admins can view personal inquiry messages" ON "public"."personal_inquiry_messages" FOR SELECT TO "authenticated" USING (("public"."is_global_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."personal_inquiries" "inquiry"
  WHERE (("inquiry"."id" = "personal_inquiry_messages"."inquiry_id") AND ("inquiry"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can create own campus notice reads" ON "public"."campus_notice_reads" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."campus_requests"
  WHERE (("campus_requests"."id" = "campus_notice_reads"."notice_id") AND ("campus_requests"."is_global_notice" = true))))));



CREATE POLICY "Users can delete own campus notice reads" ON "public"."campus_notice_reads" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own admin role" ON "public"."admin_roles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own campus notice reads" ON "public"."campus_notice_reads" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own payments" ON "public"."payments" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own personal notifications" ON "public"."personal_notifications" FOR SELECT TO "authenticated" USING ((("target_user_id" = "auth"."uid"()) OR "public"."is_global_admin"()));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own reservations" ON "public"."reservations" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."activity_event_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_action_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_invitation_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_operations_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_report_log_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."allocation_optimization_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."allocation_optimization_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."allocation_workspace_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."boarding_bus_departures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."boarding_check_in_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."boarding_check_in_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."boarding_exception_archives" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."boarding_exception_reason_edit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."boarding_exception_reason_edits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."boarding_manager_bus_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."boarding_move_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."boarding_status_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."boarding_walk_in_passengers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bus_allocations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bus_options" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campus_notice_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campus_notice_targets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campus_payment_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campus_request_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campus_request_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campus_request_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campus_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campus_transfers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campuses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ccc_summer_campus_mappings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ccc_summer_user_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."districts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."home_announcements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."manual_boarding_exception_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."personal_inquiries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."personal_inquiry_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."personal_inquiry_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."personal_inquiry_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."personal_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."personal_user_action_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reservations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."simulation_stage_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."boarding_bus_departures";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."campus_request_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."campus_requests";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."personal_inquiries";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."personal_inquiry_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."reservations";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































































































































REVOKE ALL ON FUNCTION "public"."acquire_allocation_workspace_lock"("p_allocation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."acquire_allocation_workspace_lock"("p_allocation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."acquire_allocation_workspace_lock"("p_allocation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_boarding_walk_in_as_global_admin"("p_bus_id" "text", "p_seat_number" integer, "p_name" "text", "p_phone" "text", "p_campus" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_boarding_walk_in_as_global_admin"("p_bus_id" "text", "p_seat_number" integer, "p_name" "text", "p_phone" "text", "p_campus" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_boarding_walk_in_as_global_admin"("p_bus_id" "text", "p_seat_number" integer, "p_name" "text", "p_phone" "text", "p_campus" "text", "p_reason" "text") TO "service_role";



GRANT ALL ON TABLE "public"."personal_inquiry_messages" TO "service_role";
GRANT SELECT ON TABLE "public"."personal_inquiry_messages" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."add_personal_inquiry_message"("p_inquiry_id" "uuid", "p_message" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_personal_inquiry_message"("p_inquiry_id" "uuid", "p_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_personal_inquiry_message"("p_inquiry_id" "uuid", "p_message" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."allocation_optimization_snapshot_is_current"("p_input_snapshot" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."allocation_optimization_snapshot_is_current"("p_input_snapshot" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."archive_boarding_exception_as_global_admin"("p_record_key" "text", "p_allocation_id" "uuid", "p_record_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."archive_boarding_exception_as_global_admin"("p_record_key" "text", "p_allocation_id" "uuid", "p_record_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."archive_boarding_exception_as_global_admin"("p_record_key" "text", "p_allocation_id" "uuid", "p_record_data" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."assert_allocation_planning_unlocked"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assert_allocation_planning_unlocked"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."assert_deployment_compatibility"("p_required_version" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assert_deployment_compatibility"("p_required_version" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."assert_deployment_compatibility"("p_required_version" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."assert_deployment_compatibility"("p_required_version" integer) TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."admin_roles" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."admin_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_roles" TO "service_role";



REVOKE ALL ON FUNCTION "public"."assign_boarding_manager_as_global_admin"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assign_boarding_manager_as_global_admin"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_boarding_manager_as_global_admin"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."assign_campus_admin_as_global_admin"("p_user_id" "uuid", "p_district" "text", "p_team" "text", "p_campus" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assign_campus_admin_as_global_admin"("p_user_id" "uuid", "p_district" "text", "p_team" "text", "p_campus" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_campus_admin_as_global_admin"("p_user_id" "uuid", "p_district" "text", "p_team" "text", "p_campus" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."audit_admin_operation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."audit_admin_operation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."audit_business_activity_event"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."audit_business_activity_event"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."audit_campus_request_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."audit_campus_request_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."audit_campus_request_message_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."audit_campus_request_message_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_personal_inquiry_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_personal_inquiry_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_personal_inquiry_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_personal_inquiry_message"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_personal_inquiry_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_personal_inquiry_message"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."backfill_confirmed_allocation_ticket_bus_ids"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."backfill_confirmed_allocation_ticket_bus_ids"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."bulk_manage_personal_user_payments"("p_reservation_ids" "uuid"[], "p_status" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bulk_manage_personal_user_payments"("p_reservation_ids" "uuid"[], "p_status" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bulk_manage_personal_user_payments"("p_reservation_ids" "uuid"[], "p_status" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."bulk_send_personal_notifications"("p_target_user_ids" "uuid"[], "p_title" "text", "p_content" "text", "p_category" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bulk_send_personal_notifications"("p_target_user_ids" "uuid"[], "p_title" "text", "p_content" "text", "p_category" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bulk_send_personal_notifications"("p_target_user_ids" "uuid"[], "p_title" "text", "p_content" "text", "p_category" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_manage_boarding_bus"("p_allocation_id" "uuid", "p_bus_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_manage_boarding_bus"("p_allocation_id" "uuid", "p_bus_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_boarding_bus"("p_allocation_id" "uuid", "p_bus_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_manage_boarding_bus_label"("p_allocation_id" "uuid", "p_bus_label" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_manage_boarding_bus_label"("p_allocation_id" "uuid", "p_bus_label" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_boarding_bus_label"("p_allocation_id" "uuid", "p_bus_label" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_manage_boarding_reservation"("p_reservation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_manage_boarding_reservation"("p_reservation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_boarding_reservation"("p_reservation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_manage_current_boarding_bus_label"("p_bus_label" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_manage_current_boarding_bus_label"("p_bus_label" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_current_boarding_bus_label"("p_bus_label" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_admin_invitation_code"("p_invitation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_admin_invitation_code"("p_invitation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_admin_invitation_code"("p_invitation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_allocation_optimization_job"("p_job_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_allocation_optimization_job"("p_job_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_allocation_optimization_job"("p_job_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_boarding_bus_departure"("p_bus_id" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_boarding_bus_departure"("p_bus_id" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_boarding_bus_departure"("p_bus_id" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_boarding_manager_as_global_admin"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_boarding_manager_as_global_admin"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_boarding_manager_as_global_admin"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_campus_admin_as_global_admin"("p_admin_role_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_campus_admin_as_global_admin"("p_admin_role_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_campus_admin_as_global_admin"("p_admin_role_id" "uuid") TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."campus_transfers" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."campus_transfers" TO "authenticated";
GRANT ALL ON TABLE "public"."campus_transfers" TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_campus_transfer_report"("p_transfer_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_campus_transfer_report"("p_transfer_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_campus_transfer_report"("p_transfer_id" "uuid") TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."bus_allocations" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."bus_allocations" TO "authenticated";
GRANT ALL ON TABLE "public"."bus_allocations" TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_confirmed_allocation_workspace"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_confirmed_allocation_workspace"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_confirmed_allocation_workspace"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_confirmed_allocation_workspace_v2"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_confirmed_allocation_workspace_v2"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_confirmed_allocation_workspace_v2"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_remaining_seat_claim"("p_reservation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_remaining_seat_claim"("p_reservation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_remaining_seat_claim"("p_reservation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_remaining_seat_claim"("p_reservation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_remaining_seat"("p_allocation_id" "uuid", "p_bus_id" "text", "p_depositor_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_remaining_seat"("p_allocation_id" "uuid", "p_bus_id" "text", "p_depositor_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."claim_remaining_seat"("p_allocation_id" "uuid", "p_bus_id" "text", "p_depositor_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_remaining_seat"("p_allocation_id" "uuid", "p_bus_id" "text", "p_depositor_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_admin_invitation_codes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_admin_invitation_codes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_admin_invitation_codes"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirm_campus_transfer_amount"("p_transfer_id" "uuid", "p_confirmed_by" "uuid", "p_actual_confirmed_amount" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_campus_transfer_amount"("p_transfer_id" "uuid", "p_confirmed_by" "uuid", "p_actual_confirmed_amount" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_campus_transfer_amount"("p_transfer_id" "uuid", "p_confirmed_by" "uuid", "p_actual_confirmed_amount" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirm_my_boarding"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_my_boarding"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirm_remaining_seat_payment"("p_reservation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_remaining_seat_payment"("p_reservation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_remaining_seat_payment"("p_reservation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_remaining_seat_payment"("p_reservation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_admin_invitation_code"("p_role" "text", "p_campus_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_admin_invitation_code"("p_role" "text", "p_campus_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_admin_invitation_code"("p_role" "text", "p_campus_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_admin_invitation_codes"("p_role" "text", "p_campus_id" "uuid", "p_count" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_admin_invitation_codes"("p_role" "text", "p_campus_id" "uuid", "p_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_admin_invitation_codes"("p_role" "text", "p_campus_id" "uuid", "p_count" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_all_campus_admin_invitation_codes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_all_campus_admin_invitation_codes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_all_campus_admin_invitation_codes"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_allocation_draft_from_optimal_job"("p_job_id" "uuid", "p_allocation_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_allocation_draft_from_optimal_job"("p_job_id" "uuid", "p_allocation_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_allocation_draft_from_optimal_job"("p_job_id" "uuid", "p_allocation_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_allocation_optimization_job"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_allocation_optimization_job"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_allocation_optimization_job"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_allocation_optimization_job_for_execution"("p_execution_mode" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_allocation_optimization_job_for_execution"("p_execution_mode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_allocation_optimization_job_for_execution"("p_execution_mode" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_bus_allocation_as_global_admin"("p_allocation_name" "text", "p_allocation_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_bus_allocation_as_global_admin"("p_allocation_name" "text", "p_allocation_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_bus_allocation_as_global_admin"("p_allocation_name" "text", "p_allocation_data" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_campus_request_with_message"("p_type" "text", "p_title" "text", "p_content" "text", "p_district" "text", "p_team" "text", "p_campus" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_campus_request_with_message"("p_type" "text", "p_title" "text", "p_content" "text", "p_district" "text", "p_team" "text", "p_campus" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_campus_request_with_message"("p_type" "text", "p_title" "text", "p_content" "text", "p_district" "text", "p_team" "text", "p_campus" "text") TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."campuses" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."campuses" TO "authenticated";
GRANT ALL ON TABLE "public"."campuses" TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_campus_scope_as_global_admin"("p_district" "text", "p_team" "text", "p_campus" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_campus_scope_as_global_admin"("p_district" "text", "p_team" "text", "p_campus" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_campus_scope_as_global_admin"("p_district" "text", "p_team" "text", "p_campus" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_detailed_allocation_optimization_job"("p_source_job_id" "uuid", "p_skipped_phases" "text"[], "p_resume_from_job_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_detailed_allocation_optimization_job"("p_source_job_id" "uuid", "p_skipped_phases" "text"[], "p_resume_from_job_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_detailed_allocation_optimization_job"("p_source_job_id" "uuid", "p_skipped_phases" "text"[], "p_resume_from_job_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_detailed_allocation_optimization_job_for_execution"("p_source_job_id" "uuid", "p_skipped_phases" "text"[], "p_resume_from_job_id" "uuid", "p_execution_mode" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_detailed_allocation_optimization_job_for_execution"("p_source_job_id" "uuid", "p_skipped_phases" "text"[], "p_resume_from_job_id" "uuid", "p_execution_mode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_detailed_allocation_optimization_job_for_execution"("p_source_job_id" "uuid", "p_skipped_phases" "text"[], "p_resume_from_job_id" "uuid", "p_execution_mode" "text") TO "service_role";



GRANT ALL ON TABLE "public"."campus_requests" TO "anon";
GRANT ALL ON TABLE "public"."campus_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."campus_requests" TO "service_role";



GRANT ALL ON FUNCTION "public"."create_global_campus_notice"("p_title" "text", "p_content" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_global_campus_notice"("p_title" "text", "p_content" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_global_campus_notice"("p_title" "text", "p_content" "text") TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."home_announcements" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."home_announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."home_announcements" TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_home_announcement_as_global_admin"("p_title" "text", "p_content" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_home_announcement_as_global_admin"("p_title" "text", "p_content" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_home_announcement_as_global_admin"("p_title" "text", "p_content" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_manual_boarding_exception_record"("p_allocation_id" "uuid", "p_bus_id" "text", "p_reservation_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_manual_boarding_exception_record"("p_allocation_id" "uuid", "p_bus_id" "text", "p_reservation_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_manual_boarding_exception_record"("p_allocation_id" "uuid", "p_bus_id" "text", "p_reservation_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON TABLE "public"."personal_inquiries" TO "service_role";
GRANT SELECT ON TABLE "public"."personal_inquiries" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_personal_inquiry"("p_category" "text", "p_title" "text", "p_content" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_personal_inquiry"("p_category" "text", "p_title" "text", "p_content" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_personal_inquiry"("p_category" "text", "p_title" "text", "p_content" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_targeted_campus_notice"("p_title" "text", "p_content" "text", "p_targets" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_targeted_campus_notice"("p_title" "text", "p_content" "text", "p_targets" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_targeted_campus_notice"("p_title" "text", "p_content" "text", "p_targets" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_uncached_allocation_optimization_job"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_uncached_allocation_optimization_job"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_bus_option_as_global_admin"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_bus_option_as_global_admin"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_bus_option_as_global_admin"("p_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_campus_request_as_global_admin"("p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_campus_request_as_global_admin"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_campus_request_as_global_admin"("p_request_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_draft_allocation_workspace"("p_allocation_id" "uuid", "p_expected_revision" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_draft_allocation_workspace"("p_allocation_id" "uuid", "p_expected_revision" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_draft_allocation_workspace"("p_allocation_id" "uuid", "p_expected_revision" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_my_personal_inquiry"("p_inquiry_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_my_personal_inquiry"("p_inquiry_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_my_personal_inquiry"("p_inquiry_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_personal_inquiry_as_global_admin"("p_inquiry_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_personal_inquiry_as_global_admin"("p_inquiry_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_personal_inquiry_as_global_admin"("p_inquiry_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_station_as_global_admin"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_station_as_global_admin"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_station_as_global_admin"("p_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_user_account_as_admin"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_user_account_as_admin"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_user_account_as_admin"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_user_reservation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_user_reservation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_user_reservation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_user_reservation_without_opening_check"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_user_reservation_without_opening_check"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."email_exists"("p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."email_exists"("p_email" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."email_exists"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."email_exists"("p_email" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."enforce_external_payment_global_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_external_payment_global_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_external_payment_global_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_payment_mutation_financial_safety"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_payment_mutation_financial_safety"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_payment_mutation_financial_safety"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_single_confirmed_allocation"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_single_confirmed_allocation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_single_confirmed_allocation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."execute_boarding_passenger_move"("p_reservation_id" "uuid", "p_expected_source_bus_id" "text", "p_target_bus_id" "text", "p_reason" "text", "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."execute_boarding_passenger_move"("p_reservation_id" "uuid", "p_expected_source_bus_id" "text", "p_target_bus_id" "text", "p_reason" "text", "p_actor_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."expire_stale_allocation_optimization_jobs"("p_stale_after_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."expire_stale_allocation_optimization_jobs"("p_stale_after_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_active_reservation_optimization_state"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_active_reservation_optimization_state"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_admin_personal_ticket_page"("p_page" integer, "p_page_size" integer, "p_search" "text", "p_status" "text", "p_ticket" "text", "p_admin_role" "text", "p_campus_issue" "text", "p_campus" "text", "p_district" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_admin_personal_ticket_page"("p_page" integer, "p_page_size" integer, "p_search" "text", "p_status" "text", "p_ticket" "text", "p_admin_role" "text", "p_campus_issue" "text", "p_campus" "text", "p_district" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_personal_ticket_page"("p_page" integer, "p_page_size" integer, "p_search" "text", "p_status" "text", "p_ticket" "text", "p_admin_role" "text", "p_campus_issue" "text", "p_campus" "text", "p_district" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_all_campus_payment_accounts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_all_campus_payment_accounts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_all_campus_payment_accounts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_allocation_optimization_job"("p_job_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_allocation_optimization_job"("p_job_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_allocation_optimization_job"("p_job_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_allocation_optimizer_config"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_allocation_optimizer_config"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_allocation_optimizer_config"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_allocation_workspace_version_snapshot"("p_version_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_allocation_workspace_version_snapshot"("p_version_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_allocation_workspace_version_snapshot"("p_version_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_allocation_workspace_versions"("p_allocation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_allocation_workspace_versions"("p_allocation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_allocation_workspace_versions"("p_allocation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_available_remaining_seats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_available_remaining_seats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_available_remaining_seats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_available_remaining_seats"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_boarding_exception_archive_snapshot"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_boarding_exception_archive_snapshot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_boarding_exception_archive_snapshot"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_boarding_exception_reason_edit_snapshot"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_boarding_exception_reason_edit_snapshot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_boarding_exception_reason_edit_snapshot"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_boarding_management_snapshot"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_boarding_management_snapshot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_boarding_management_snapshot"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_boarding_manager_assignment_options"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_boarding_manager_assignment_options"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_boarding_manager_assignment_options"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_boarding_manager_users"("p_search" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_boarding_manager_users"("p_search" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_boarding_manager_users"("p_search" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_boarding_move_request_snapshot"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_boarding_move_request_snapshot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_boarding_move_request_snapshot"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_bus_ticket_price"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_bus_ticket_price"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_bus_ticket_price"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_campus_admin_manage_users_page"("p_district" "text", "p_team" "text", "p_campus" "text", "p_query" "text", "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_campus_admin_manage_users_page"("p_district" "text", "p_team" "text", "p_campus" "text", "p_query" "text", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_campus_admin_manage_users_page"("p_district" "text", "p_team" "text", "p_campus" "text", "p_query" "text", "p_limit" integer, "p_offset" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_campus_payment_account"("p_campus_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_campus_payment_account"("p_campus_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_campus_payment_account"("p_campus_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_campus_request_summary"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_campus_request_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_campus_request_summary"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_confirmed_allocation_summaries"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_confirmed_allocation_summaries"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_confirmed_allocation_summaries"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_confirmed_ticket_bus_id"("p_reservation_id" "uuid", "p_ticket" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_confirmed_ticket_bus_id"("p_reservation_id" "uuid", "p_ticket" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_deletable_user_count"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_deletable_user_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_deletable_user_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_deletable_user_count"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_deployment_compatibility_version"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_deployment_compatibility_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_deployment_compatibility_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_deployment_compatibility_version"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_destination_stats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_destination_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_destination_stats"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_draft_allocation_summaries"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_draft_allocation_summaries"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_draft_allocation_summaries"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_global_campus_notices"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_global_campus_notices"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_global_campus_notices"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_global_campus_transfer_stats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_global_campus_transfer_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_global_campus_transfer_stats"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_manual_boarding_exception_records"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_manual_boarding_exception_records"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_manual_boarding_exception_records"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_admin_roles"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_admin_roles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_admin_roles"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_personal_inquiries"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_personal_inquiries"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_personal_inquiries"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_personal_inquiry_messages"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_personal_inquiry_messages"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_personal_inquiry_messages"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_operation_closeout"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_operation_closeout"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_operation_closeout"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_payment_scope_lock_key"("p_campus_id" "uuid", "p_district" "text", "p_team" "text", "p_campus" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_payment_scope_lock_key"("p_campus_id" "uuid", "p_district" "text", "p_team" "text", "p_campus" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_payment_scope_lock_key"("p_campus_id" "uuid", "p_district" "text", "p_team" "text", "p_campus" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_personal_inquiries_as_global_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_personal_inquiries_as_global_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_personal_inquiries_as_global_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_personal_inquiries_page_as_global_admin"("p_page" integer, "p_page_size" integer, "p_status" "text", "p_search" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_personal_inquiries_page_as_global_admin"("p_page" integer, "p_page_size" integer, "p_status" "text", "p_search" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_personal_inquiries_page_as_global_admin"("p_page" integer, "p_page_size" integer, "p_status" "text", "p_search" "text") TO "service_role";



GRANT ALL ON TABLE "public"."personal_inquiry_audit_logs" TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_personal_inquiry_audit_logs"("p_inquiry_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_personal_inquiry_audit_logs"("p_inquiry_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_personal_inquiry_audit_logs"("p_inquiry_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_public_contact_info"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_contact_info"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_contact_info"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_contact_info"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_recent_allocation_optimization_jobs"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_recent_allocation_optimization_jobs"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_recent_allocation_optimization_jobs"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_reusable_allocation_optimization_job"("p_job_id" "uuid", "p_input_hash" "text", "p_input_snapshot" "jsonb", "p_optimization_scope" "text", "p_detailed_settings" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_reusable_allocation_optimization_job"("p_job_id" "uuid", "p_input_hash" "text", "p_input_snapshot" "jsonb", "p_optimization_scope" "text", "p_detailed_settings" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_unread_campus_request_ids"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_unread_campus_request_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_unread_campus_request_ids"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_unread_personal_inquiry_count"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_unread_personal_inquiry_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_unread_personal_inquiry_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_admin_permission"("p_required_role" "text", "p_district" "text", "p_team" "text", "p_campus" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_admin_permission"("p_required_role" "text", "p_district" "text", "p_team" "text", "p_campus" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_admin_permission"("p_required_role" "text", "p_district" "text", "p_team" "text", "p_campus" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_boarding_manager"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_boarding_manager"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_boarding_manager"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_campus_admin_for_scope"("p_district" "text", "p_team" "text", "p_campus" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_campus_admin_for_scope"("p_district" "text", "p_team" "text", "p_campus" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_campus_admin_for_scope"("p_district" "text", "p_team" "text", "p_campus" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_global_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_global_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_global_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_initial_campus_request_message"("p_message_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_initial_campus_request_message"("p_message_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_initial_campus_request_message"("p_message_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."lock_allocation_optimization_job_creation"() TO "anon";
GRANT ALL ON FUNCTION "public"."lock_allocation_optimization_job_creation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."lock_allocation_optimization_job_creation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."lock_allocation_planning_writes"() TO "anon";
GRANT ALL ON FUNCTION "public"."lock_allocation_planning_writes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."lock_allocation_planning_writes"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."manage_personal_reservation_status"("p_reservation_id" "uuid", "p_next_status" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."manage_personal_reservation_status"("p_reservation_id" "uuid", "p_next_status" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."manage_personal_reservation_status"("p_reservation_id" "uuid", "p_next_status" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."manage_personal_user_payment"("p_reservation_id" "uuid", "p_status" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."manage_personal_user_payment"("p_reservation_id" "uuid", "p_status" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."manage_personal_user_payment"("p_reservation_id" "uuid", "p_status" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_allocation_job_result_reused"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_allocation_job_result_reused"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_boarding_bus_departed"("p_bus_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_boarding_bus_departed"("p_bus_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_boarding_bus_departed"("p_bus_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_campus_request_read"("p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_campus_request_read"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_campus_request_read"("p_request_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_campus_transfer_sent"("p_district" "text", "p_team" "text", "p_campus" "text", "p_total_people" integer, "p_paid_people" integer, "p_total_amount" integer, "p_sent_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_campus_transfer_sent"("p_district" "text", "p_team" "text", "p_campus" "text", "p_total_people" integer, "p_paid_people" integer, "p_total_amount" integer, "p_sent_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_campus_transfer_sent"("p_district" "text", "p_team" "text", "p_campus" "text", "p_total_people" integer, "p_paid_people" integer, "p_total_amount" integer, "p_sent_by" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_personal_inquiry_read"("p_inquiry_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_personal_inquiry_read"("p_inquiry_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_personal_inquiry_read"("p_inquiry_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_personal_notification_read"("p_notification_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_personal_notification_read"("p_notification_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_personal_notification_read"("p_notification_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."move_boarding_passenger_as_global_admin"("p_reservation_id" "uuid", "p_target_bus_id" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."move_boarding_passenger_as_global_admin"("p_reservation_id" "uuid", "p_target_bus_id" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."move_boarding_passenger_as_global_admin"("p_reservation_id" "uuid", "p_target_bus_id" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."normalize_admin_invitation_code"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."normalize_admin_invitation_code"("p_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_allocation_remaining_seat_passengers"() TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_allocation_remaining_seat_passengers"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_allocation_remaining_seat_passengers"() TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_confirmed_allocation_name"() TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_confirmed_allocation_name"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_confirmed_allocation_name"() TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."boarding_bus_departures" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."boarding_bus_departures" TO "authenticated";
GRANT ALL ON TABLE "public"."boarding_bus_departures" TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_boarding_managers_of_departure_cancel"("p_departure" "public"."boarding_bus_departures", "p_reason" "text", "p_restored_count" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_boarding_managers_of_departure_cancel"("p_departure" "public"."boarding_bus_departures", "p_reason" "text", "p_restored_count" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."prepare_allocation_preference_override"("p_allocation_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prepare_allocation_preference_override"("p_allocation_data" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_allocation_cancel_after_departure"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_allocation_cancel_after_departure"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_departed_bus_check_in_code_changes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_departed_bus_check_in_code_changes"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_departed_bus_reservation_changes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_departed_bus_reservation_changes"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_departed_bus_walk_in_changes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_departed_bus_walk_in_changes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_locked_affiliation_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_locked_affiliation_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_locked_affiliation_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prune_activity_event_logs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prune_activity_event_logs"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prune_activity_event_logs_daily"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prune_activity_event_logs_daily"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prune_allocation_optimization_jobs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prune_allocation_optimization_jobs"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prune_allocation_optimization_jobs_after_insert"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prune_allocation_optimization_jobs_after_insert"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prune_allocation_workspace_versions"("p_allocation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prune_allocation_workspace_versions"("p_allocation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_activity_event"("p_event_name" "text", "p_category" "text", "p_route" "text", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_activity_event"("p_event_name" "text", "p_category" "text", "p_route" "text", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_activity_event"("p_event_name" "text", "p_category" "text", "p_route" "text", "p_metadata" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_personal_user_action"("p_target_user_id" "uuid", "p_reservation_id" "uuid", "p_action" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_personal_user_action"("p_target_user_id" "uuid", "p_reservation_id" "uuid", "p_action" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_personal_user_action"("p_target_user_id" "uuid", "p_reservation_id" "uuid", "p_action" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."redeem_admin_invitation_codes"("p_codes" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."redeem_admin_invitation_codes"("p_codes" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."redeem_admin_invitation_codes"("p_codes" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."redeem_admin_invitation_codes_for_user"("p_user_id" "uuid", "p_codes" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."redeem_admin_invitation_codes_for_user"("p_user_id" "uuid", "p_codes" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_admin_role_organization_scope"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_admin_role_organization_scope"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_admin_role_organization_scope"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_campus_request_organization_scope"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_campus_request_organization_scope"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_campus_request_organization_scope"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_profile_organization_scope"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_profile_organization_scope"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_profile_organization_scope"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_reservation_organization_scope"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_reservation_organization_scope"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_reservation_organization_scope"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."remove_cancelled_passenger_from_confirmed_allocations"("p_reservation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_cancelled_passenger_from_confirmed_allocations"("p_reservation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_cancelled_passenger_from_confirmed_allocations"("p_reservation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."request_boarding_passenger_move"("p_reservation_id" "uuid", "p_target_bus_id" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_boarding_passenger_move"("p_reservation_id" "uuid", "p_target_bus_id" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_boarding_passenger_move"("p_reservation_id" "uuid", "p_target_bus_id" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."require_closed_reservation_deadline_for_bus_allocation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."require_closed_reservation_deadline_for_bus_allocation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."require_closed_reservation_deadline_for_optimization_job"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."require_closed_reservation_deadline_for_optimization_job"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."reset_allocation_optimization_jobs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_allocation_optimization_jobs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_allocation_optimization_jobs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reset_boarding_confirmation_on_ticket_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."reset_boarding_confirmation_on_ticket_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_boarding_confirmation_on_ticket_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reset_bus_departures_on_allocation_cancel"() TO "anon";
GRANT ALL ON FUNCTION "public"."reset_bus_departures_on_allocation_cancel"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_bus_departures_on_allocation_cancel"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."reset_reservation_data"("p_reset_reservations" boolean, "p_reset_payments" boolean, "p_reset_campus_transfers" boolean, "p_reset_bus_allocations" boolean, "p_reset_campus_requests" boolean, "p_reset_stations" boolean, "p_reset_bus_options" boolean, "p_reset_app_settings" boolean, "p_reset_home_announcements" boolean, "p_reset_campus_admin_roles" boolean, "p_reset_organization" boolean, "p_reset_user_accounts" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_reservation_data"("p_reset_reservations" boolean, "p_reset_payments" boolean, "p_reset_campus_transfers" boolean, "p_reset_bus_allocations" boolean, "p_reset_campus_requests" boolean, "p_reset_stations" boolean, "p_reset_bus_options" boolean, "p_reset_app_settings" boolean, "p_reset_home_announcements" boolean, "p_reset_campus_admin_roles" boolean, "p_reset_organization" boolean, "p_reset_user_accounts" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."reset_reservation_data"("p_reset_reservations" boolean, "p_reset_payments" boolean, "p_reset_campus_transfers" boolean, "p_reset_bus_allocations" boolean, "p_reset_campus_requests" boolean, "p_reset_stations" boolean, "p_reset_bus_options" boolean, "p_reset_app_settings" boolean, "p_reset_home_announcements" boolean, "p_reset_campus_admin_roles" boolean, "p_reset_organization" boolean, "p_reset_user_accounts" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_reservation_data"("p_reset_reservations" boolean, "p_reset_payments" boolean, "p_reset_campus_transfers" boolean, "p_reset_bus_allocations" boolean, "p_reset_campus_requests" boolean, "p_reset_stations" boolean, "p_reset_bus_options" boolean, "p_reset_app_settings" boolean, "p_reset_home_announcements" boolean, "p_reset_campus_admin_roles" boolean, "p_reset_organization" boolean, "p_reset_user_accounts" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."respond_to_boarding_move_request"("p_request_id" "uuid", "p_approve" boolean, "p_response_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."respond_to_boarding_move_request"("p_request_id" "uuid", "p_approve" boolean, "p_response_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."respond_to_boarding_move_request"("p_request_id" "uuid", "p_approve" boolean, "p_response_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."respond_to_personal_inquiry"("p_inquiry_id" "uuid", "p_status" "text", "p_admin_response" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."respond_to_personal_inquiry"("p_inquiry_id" "uuid", "p_status" "text", "p_admin_response" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."respond_to_personal_inquiry"("p_inquiry_id" "uuid", "p_status" "text", "p_admin_response" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."restore_boarding_exception_as_global_admin"("p_record_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."restore_boarding_exception_as_global_admin"("p_record_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."restore_boarding_exception_as_global_admin"("p_record_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."revert_campus_transfer_confirmation_as_global_admin"("p_transfer_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revert_campus_transfer_confirmation_as_global_admin"("p_transfer_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revert_campus_transfer_confirmation_as_global_admin"("p_transfer_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."revert_personal_user_action"("p_action_log_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revert_personal_user_action"("p_action_log_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revert_personal_user_action"("p_action_log_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rotate_boarding_check_in_code"("p_bus_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rotate_boarding_check_in_code"("p_bus_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rotate_boarding_check_in_code"("p_bus_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_allocation_optimizer_config"("p_capacity" integer, "p_price" integer, "p_recommended_minimum_passengers" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_allocation_optimizer_config"("p_capacity" integer, "p_price" integer, "p_recommended_minimum_passengers" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_allocation_optimizer_config"("p_capacity" integer, "p_price" integer, "p_recommended_minimum_passengers" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_allocation_optimizer_config_unlocked"("p_capacity" integer, "p_price" integer, "p_recommended_minimum_passengers" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_allocation_optimizer_config_unlocked"("p_capacity" integer, "p_price" integer, "p_recommended_minimum_passengers" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_confirmed_allocation_workspace"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_confirmed_allocation_workspace"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."save_confirmed_allocation_workspace"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."save_confirmed_allocation_workspace_v2"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_confirmed_allocation_workspace_v2"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_confirmed_allocation_workspace_v3"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_confirmed_allocation_workspace_v3"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_confirmed_allocation_workspace_v3"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_confirmed_allocation_workspace_v3_unlocked"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_confirmed_allocation_workspace_v3_unlocked"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_draft_allocation_workspace"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_draft_allocation_workspace"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_draft_allocation_workspace"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_draft_allocation_workspace_v2"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_draft_allocation_workspace_v2"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_draft_allocation_workspace_v2"("p_allocation_id" "uuid", "p_expected_revision" bigint, "p_allocation_data" "jsonb", "p_total_cost" integer, "p_total_capacity" integer, "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_user_reservation"("p_name" "text", "p_phone" "text", "p_district" "text", "p_team" "text", "p_campus" "text", "p_station_preferences" "jsonb", "p_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_user_reservation"("p_name" "text", "p_phone" "text", "p_district" "text", "p_team" "text", "p_campus" "text", "p_station_preferences" "jsonb", "p_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_user_reservation"("p_name" "text", "p_phone" "text", "p_district" "text", "p_team" "text", "p_campus" "text", "p_station_preferences" "jsonb", "p_data" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_user_reservation_without_opening_check"("p_name" "text", "p_phone" "text", "p_district" "text", "p_team" "text", "p_campus" "text", "p_station_preferences" "jsonb", "p_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_user_reservation_without_opening_check"("p_name" "text", "p_phone" "text", "p_district" "text", "p_team" "text", "p_campus" "text", "p_station_preferences" "jsonb", "p_data" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."send_personal_notification"("p_target_user_id" "uuid", "p_title" "text", "p_content" "text", "p_category" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_personal_notification"("p_target_user_id" "uuid", "p_title" "text", "p_content" "text", "p_category" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_personal_notification"("p_target_user_id" "uuid", "p_title" "text", "p_content" "text", "p_category" "text", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_admin_role_scope_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_admin_role_scope_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_admin_role_scope_ids"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_allocation_optimization_job_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_allocation_optimization_job_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_app_settings_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_app_settings_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_app_settings_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_boarding_manager_bus_assignments_as_global_admin"("p_user_id" "uuid", "p_bus_ids" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_boarding_manager_bus_assignments_as_global_admin"("p_user_id" "uuid", "p_bus_ids" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_boarding_manager_bus_assignments_as_global_admin"("p_user_id" "uuid", "p_bus_ids" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_bus_allocation_canonical_totals"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_bus_allocation_canonical_totals"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_bus_allocation_canonical_totals"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_campus_request_scope_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_campus_request_scope_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_campus_request_scope_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_campus_requests_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_campus_requests_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_campus_requests_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_campus_transfer_scope_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_campus_transfer_scope_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_campus_transfer_scope_ids"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_passenger_boarding_status"("p_reservation_id" "uuid", "p_status" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_passenger_boarding_status"("p_reservation_id" "uuid", "p_status" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_passenger_boarding_status"("p_reservation_id" "uuid", "p_status" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_reservation_confirmed_ticket_bus_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_reservation_confirmed_ticket_bus_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_walk_in_boarding_status"("p_walk_in_id" "uuid", "p_status" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_walk_in_boarding_status"("p_walk_in_id" "uuid", "p_status" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_walk_in_boarding_status"("p_walk_in_id" "uuid", "p_status" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."store_allocation_workspace_version"("p_allocation_id" "uuid", "p_revision" bigint, "p_allocation_data" "jsonb", "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."store_allocation_workspace_version"("p_allocation_id" "uuid", "p_revision" bigint, "p_allocation_data" "jsonb", "p_version_id" "text", "p_version_label" "text", "p_version_changes" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_boarding_check_in_code"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_boarding_check_in_code"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_boarding_check_in_code"("p_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_admin_role_organization_scope"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_admin_role_organization_scope"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_admin_role_organization_scope"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_campus_request_organization_scope"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_campus_request_organization_scope"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_campus_request_organization_scope"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_profile_organization_scope"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_profile_organization_scope"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_profile_organization_scope"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_reservation_canonical_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_reservation_canonical_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_reservation_canonical_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_reservation_data_from_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_reservation_data_from_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_reservation_data_from_columns"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_reservation_organization_scope"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_reservation_organization_scope"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_reservation_organization_scope"() TO "service_role";



GRANT ALL ON TABLE "public"."ai_report_log_settings" TO "anon";
GRANT ALL ON TABLE "public"."ai_report_log_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_report_log_settings" TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_ai_report_log_settings"("p_include_navigation" boolean, "p_include_authentication" boolean, "p_include_data_changes" boolean, "p_include_admin_audit" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_ai_report_log_settings"("p_include_navigation" boolean, "p_include_authentication" boolean, "p_include_data_changes" boolean, "p_include_admin_audit" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_ai_report_log_settings"("p_include_navigation" boolean, "p_include_authentication" boolean, "p_include_data_changes" boolean, "p_include_admin_audit" boolean) TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."app_settings" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."app_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."app_settings" TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_app_setting_as_global_admin"("p_key" "text", "p_value" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_app_setting_as_global_admin"("p_key" "text", "p_value" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_app_setting_as_global_admin"("p_key" "text", "p_value" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_boarding_exception_reason"("p_record_key" "text", "p_allocation_id" "uuid", "p_bus_id" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_boarding_exception_reason"("p_record_key" "text", "p_allocation_id" "uuid", "p_bus_id" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_boarding_exception_reason"("p_record_key" "text", "p_allocation_id" "uuid", "p_bus_id" "text", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_bus_ticket_price"("p_price" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."update_bus_ticket_price"("p_price" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_bus_ticket_price"("p_price" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_campus_request_status_with_response"("p_request_id" "uuid", "p_status" "text", "p_admin_response" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_campus_request_status_with_response"("p_request_id" "uuid", "p_status" "text", "p_admin_response" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_campus_request_status_with_response"("p_request_id" "uuid", "p_status" "text", "p_admin_response" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_home_announcement_as_global_admin"("p_id" "uuid", "p_title" "text", "p_content" "text", "p_is_published" boolean, "p_is_archived" boolean, "p_is_pinned" boolean, "p_publish_start_at" timestamp with time zone, "p_publish_end_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_home_announcement_as_global_admin"("p_id" "uuid", "p_title" "text", "p_content" "text", "p_is_published" boolean, "p_is_archived" boolean, "p_is_pinned" boolean, "p_publish_start_at" timestamp with time zone, "p_publish_end_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_home_announcement_as_global_admin"("p_id" "uuid", "p_title" "text", "p_content" "text", "p_is_published" boolean, "p_is_archived" boolean, "p_is_pinned" boolean, "p_publish_start_at" timestamp with time zone, "p_publish_end_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_operation_closeout"("p_closed" boolean, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_operation_closeout"("p_closed" boolean, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_operation_closeout"("p_closed" boolean, "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_passenger_boarding_note"("p_reservation_id" "uuid", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_passenger_boarding_note"("p_reservation_id" "uuid", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_passenger_boarding_note"("p_reservation_id" "uuid", "p_note" "text") TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."reservations" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."reservations" TO "authenticated";
GRANT ALL ON TABLE "public"."reservations" TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_personal_ticket_as_admin"("p_reservation_id" "uuid", "p_next_status" "text", "p_ticket" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_personal_ticket_as_admin"("p_reservation_id" "uuid", "p_next_status" "text", "p_ticket" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_personal_ticket_as_admin"("p_reservation_id" "uuid", "p_next_status" "text", "p_ticket" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_personal_user_info"("p_target_user_id" "uuid", "p_reservation_id" "uuid", "p_name" "text", "p_phone" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_personal_user_info"("p_target_user_id" "uuid", "p_reservation_id" "uuid", "p_name" "text", "p_phone" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_personal_user_info"("p_target_user_id" "uuid", "p_reservation_id" "uuid", "p_name" "text", "p_phone" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_personal_user_organization"("p_target_user_id" "uuid", "p_reservation_id" "uuid", "p_campus_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_personal_user_organization"("p_target_user_id" "uuid", "p_reservation_id" "uuid", "p_campus_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_personal_user_organization"("p_target_user_id" "uuid", "p_reservation_id" "uuid", "p_campus_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_remaining_seat_sales_settings"("p_enabled" boolean, "p_hidden_bus_ids" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_remaining_seat_sales_settings"("p_enabled" boolean, "p_hidden_bus_ids" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."update_remaining_seat_sales_settings"("p_enabled" boolean, "p_hidden_bus_ids" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_remaining_seat_sales_settings"("p_enabled" boolean, "p_hidden_bus_ids" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_targeted_campus_notice"("p_notice_id" "uuid", "p_title" "text", "p_content" "text", "p_targets" "jsonb", "p_archived" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_targeted_campus_notice"("p_notice_id" "uuid", "p_title" "text", "p_content" "text", "p_targets" "jsonb", "p_archived" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_targeted_campus_notice"("p_notice_id" "uuid", "p_title" "text", "p_content" "text", "p_targets" "jsonb", "p_archived" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_walk_in_boarding_note"("p_walk_in_id" "uuid", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_walk_in_boarding_note"("p_walk_in_id" "uuid", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_walk_in_boarding_note"("p_walk_in_id" "uuid", "p_note" "text") TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."bus_options" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."bus_options" TO "authenticated";
GRANT ALL ON TABLE "public"."bus_options" TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_bus_option_as_global_admin"("p_id" "uuid", "p_capacity" integer, "p_estimated_price" integer, "p_max_count" integer, "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_bus_option_as_global_admin"("p_id" "uuid", "p_capacity" integer, "p_estimated_price" integer, "p_max_count" integer, "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_bus_option_as_global_admin"("p_id" "uuid", "p_capacity" integer, "p_estimated_price" integer, "p_max_count" integer, "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_campus_payment_account_as_admin"("p_campus_id" "uuid", "p_bank_name" "text", "p_account_number" "text", "p_account_holder" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_campus_payment_account_as_admin"("p_campus_id" "uuid", "p_bank_name" "text", "p_account_number" "text", "p_account_holder" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_campus_payment_account_as_admin"("p_campus_id" "uuid", "p_bank_name" "text", "p_account_number" "text", "p_account_holder" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_campus_payment_account_as_global_admin"("p_campus_id" "uuid", "p_bank_name" "text", "p_account_number" "text", "p_account_holder" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_campus_payment_account_as_global_admin"("p_campus_id" "uuid", "p_bank_name" "text", "p_account_number" "text", "p_account_holder" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_campus_payment_account_as_global_admin"("p_campus_id" "uuid", "p_bank_name" "text", "p_account_number" "text", "p_account_holder" "text") TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."payments" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_reservation_payment"("p_payment_id" "uuid", "p_reservation_id" "uuid", "p_user_id" "uuid", "p_amount" integer, "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_reservation_payment"("p_payment_id" "uuid", "p_reservation_id" "uuid", "p_user_id" "uuid", "p_amount" integer, "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_reservation_payment"("p_payment_id" "uuid", "p_reservation_id" "uuid", "p_user_id" "uuid", "p_amount" integer, "p_status" "text") TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."stations" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."stations" TO "authenticated";
GRANT ALL ON TABLE "public"."stations" TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_station_as_global_admin"("p_id" "uuid", "p_name" "text", "p_line" "text", "p_address" "text", "p_lat" double precision, "p_lng" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_station_as_global_admin"("p_id" "uuid", "p_name" "text", "p_line" "text", "p_address" "text", "p_lat" double precision, "p_lng" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_station_as_global_admin"("p_id" "uuid", "p_name" "text", "p_line" "text", "p_address" "text", "p_lat" double precision, "p_lng" double precision) TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_admin_invitation_codes"("p_codes" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_admin_invitation_codes"("p_codes" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."validate_admin_invitation_codes"("p_codes" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_admin_invitation_codes"("p_codes" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_allocation_bus_identifiers"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_allocation_bus_identifiers"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_allocation_workspace_confirmation"("p_allocation_id" "uuid", "p_allocation_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_allocation_workspace_confirmation"("p_allocation_id" "uuid", "p_allocation_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_allocation_workspace_confirmation"("p_allocation_id" "uuid", "p_allocation_data" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_allocation_workspace_confirmation_v2"("p_allocation_id" "uuid", "p_allocation_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_allocation_workspace_confirmation_v2"("p_allocation_id" "uuid", "p_allocation_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_allocation_workspace_confirmation_v2"("p_allocation_id" "uuid", "p_allocation_data" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_boarding_walk_in_seat_conflicts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_boarding_walk_in_seat_conflicts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_campus_transfer_financial_snapshot"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_campus_transfer_financial_snapshot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_campus_transfer_financial_snapshot"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_profile_organization_membership"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_profile_organization_membership"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_profile_organization_membership"() TO "service_role";


















GRANT ALL ON TABLE "public"."activity_event_logs" TO "anon";
GRANT ALL ON TABLE "public"."activity_event_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_event_logs" TO "service_role";



GRANT ALL ON TABLE "public"."admin_action_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."admin_action_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_action_audit_logs" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."admin_invitation_codes" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."admin_invitation_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_invitation_codes" TO "service_role";



GRANT ALL ON TABLE "public"."ai_operations_reports" TO "anon";
GRANT ALL ON TABLE "public"."ai_operations_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_operations_reports" TO "service_role";



GRANT ALL ON TABLE "public"."allocation_optimization_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."allocation_optimization_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."allocation_optimization_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."allocation_optimization_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."allocation_optimization_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."allocation_workspace_versions" TO "service_role";



GRANT ALL ON TABLE "public"."boarding_check_in_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."boarding_check_in_codes" TO "service_role";



GRANT ALL ON TABLE "public"."boarding_exception_archives" TO "service_role";



GRANT ALL ON TABLE "public"."boarding_exception_reason_edit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."boarding_exception_reason_edits" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."boarding_manager_bus_assignments" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."boarding_manager_bus_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."boarding_manager_bus_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."boarding_move_requests" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."boarding_status_events" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."boarding_status_events" TO "authenticated";
GRANT ALL ON TABLE "public"."boarding_status_events" TO "service_role";



GRANT ALL ON TABLE "public"."boarding_walk_in_passengers" TO "service_role";



GRANT ALL ON TABLE "public"."campus_notice_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."campus_notice_reads" TO "service_role";



GRANT ALL ON TABLE "public"."campus_notice_targets" TO "anon";
GRANT ALL ON TABLE "public"."campus_notice_targets" TO "authenticated";
GRANT ALL ON TABLE "public"."campus_notice_targets" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."districts" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."districts" TO "authenticated";
GRANT ALL ON TABLE "public"."districts" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."teams" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";



GRANT ALL ON TABLE "public"."campus_options" TO "anon";
GRANT ALL ON TABLE "public"."campus_options" TO "authenticated";
GRANT ALL ON TABLE "public"."campus_options" TO "service_role";



GRANT ALL ON TABLE "public"."campus_payment_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."campus_request_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."campus_request_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."campus_request_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."campus_request_messages" TO "anon";
GRANT ALL ON TABLE "public"."campus_request_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."campus_request_messages" TO "service_role";



GRANT ALL ON TABLE "public"."campus_request_reads" TO "anon";
GRANT ALL ON TABLE "public"."campus_request_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."campus_request_reads" TO "service_role";



GRANT ALL ON TABLE "public"."ccc_summer_campus_mappings" TO "service_role";



GRANT ALL ON TABLE "public"."ccc_summer_user_links" TO "service_role";



GRANT ALL ON TABLE "public"."manual_boarding_exception_records" TO "service_role";



GRANT ALL ON TABLE "public"."personal_inquiry_reads" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."personal_notifications" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."personal_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."personal_notifications" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."personal_user_action_logs" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."personal_user_action_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."personal_user_action_logs" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."simulation_stage_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."simulation_stage_runs" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































--
-- Dumped schema changes for auth and storage
--

CREATE OR REPLACE TRIGGER "on_auth_user_created" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_auth_user"();
