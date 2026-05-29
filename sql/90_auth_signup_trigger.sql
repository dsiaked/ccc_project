-- public.profiles 테이블 자동 동기화 트리거
-- Supabase Auth에 사용자가 가입(signup)하면, auth.users의 레코드를 public.profiles에 자동으로 매핑 삽입합니다.

create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_name text;
  v_phone text;
  v_district text;
  v_team text;
  v_campus text;
begin
  -- raw_user_meta_data에서 사용자가 기입한 추가 소속 및 기본 정보 파싱
  v_name := coalesce(new.raw_user_meta_data->>'name', '');
  v_phone := coalesce(new.raw_user_meta_data->>'phone', '');
  v_district := coalesce(new.raw_user_meta_data->>'district', '서울지구');
  v_team := coalesce(new.raw_user_meta_data->>'team', '');
  v_campus := coalesce(new.raw_user_meta_data->>'campus', '');

  insert into public.profiles (
    id,
    email,
    name,
    phone,
    district,
    team,
    campus,
    created_at,
    updated_at
  ) values (
    new.id,
    new.email,
    v_name,
    v_phone,
    v_district,
    v_team,
    v_campus,
    now(),
    now()
  );

  return new;
exception
  when others then
    -- 트리거 에러로 인해 회원가입 자체가 실패하는 것을 방지하기 위해 예외를 잡아서 처리합니다.
    -- 로그를 남기거나 안전하게 기본 정보만 삽입합니다.
    insert into public.profiles (id, email, name, phone, district, team, campus, created_at, updated_at)
    values (new.id, new.email, '가입 회원', '', '서울지구', '', '', now(), now());
    return new;
end;
$$ language plpgsql security definer;

-- 트리거 바인딩 (기존 트리거가 있으면 삭제 후 생성)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
