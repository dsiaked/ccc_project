-- Passwords belong only in Supabase Auth. Remove the plaintext profile copy and
-- stop returning it from the personal-ticket administration RPC.

do $$
declare
  v_signature constant regprocedure :=
    'public.get_admin_personal_ticket_page(integer,integer,text,text,text,text,text,text,text)'::regprocedure;
  v_definition text;
begin
  select pg_get_functiondef(v_signature)
  into v_definition;

  v_definition := replace(
    v_definition,
    E'      profile.password as password,\n',
    ''
  );
  v_definition := replace(
    v_definition,
    E'            ''is_staff'', row.is_staff,\n            ''password'', row.password\n',
    E'            ''is_staff'', row.is_staff\n'
  );

  if v_definition ~* 'profile\.password|row\.password' then
    raise exception 'Refusing to drop profiles.password while the personal-ticket RPC still exposes it.';
  end if;

  execute v_definition;
end;
$$;

alter table public.profiles
  drop column if exists password;

notify pgrst, 'reload schema';
