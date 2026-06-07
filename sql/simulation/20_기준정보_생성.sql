-- =========================================================
-- CCC Bus simulation: reference data
-- Seeds rehearsal organization, stations, application settings, and bus options.
-- Run files in sql/simulation/README.md order.
-- =========================================================

begin;

-- =========================================================
-- 3. Seed organization options for the rehearsal
-- =========================================================

insert into districts (name, sort_order, is_active)
values ('서울지구', 10, true)
on conflict (name) do update set
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

with seoul as (
  select id from districts where name = '서울지구'
),
seed_teams(name, sort_order) as (
  values
    ('동팀', 10),
    ('서팀', 20),
    ('남팀', 30),
    ('북팀', 40),
    ('북동팀', 60)
)
insert into teams (district_id, name, sort_order, is_active)
select seoul.id, seed_teams.name, seed_teams.sort_order, true
from seoul
cross join seed_teams
on conflict (district_id, name) do update set
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

with seed_campuses(team_name, campus_name, sort_order) as (
  values
    ('동팀', '세종대학교', 20),
    ('동팀', '한양대학교', 30),
    ('동팀', '건국대학교', 50),
    ('서팀', '연세대학교', 40),
    ('서팀', '이화여자대학교', 70),
    ('남팀', '서울대학교', 10),
    ('남팀', '숭실대학교', 20),
    ('남팀', '중앙대학교', 40),
    ('남팀', '총신대학교', 80),
    ('북팀', '고려대학교', 10),
    ('북동팀', '경희대학교', 60),
    ('북동팀', '한국외국어대학교', 70)
),
team_rows as (
  select teams.id, teams.name
  from teams
  join districts on districts.id = teams.district_id
  where districts.name = '서울지구'
)
insert into campuses (team_id, name, sort_order, is_active)
select team_rows.id, seed_campuses.campus_name, seed_campuses.sort_order, true
from seed_campuses
join team_rows on team_rows.name = seed_campuses.team_name
on conflict (team_id, name) do update set
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

-- =========================================================
-- 4. Seed station options for reservation choices
-- =========================================================

insert into stations (name, line, address, lat, lng, sort_order, is_active)
values
  ('서울역', '1호선 / 4호선 / 경의중앙선 / 공항철도', '서울 용산구 한강대로 405', 37.5547, 126.9706, 10, true),
  ('용산역', '1호선 / 경의중앙선', '서울 용산구 한강대로23길 55', 37.5299, 126.9648, 20, true),
  ('영등포역', '1호선', '서울 영등포구 경인로 846', 37.5157, 126.9074, 30, true),
  ('신도림역', '1호선 / 2호선', '서울 구로구 새말로 117-21', 37.5088, 126.8913, 40, true),
  ('홍대입구역', '2호선 / 경의중앙선 / 공항철도', '서울 마포구 양화로 160', 37.5572, 126.9254, 50, true),
  ('합정역', '2호선 / 6호선', '서울 마포구 양화로 55', 37.5495, 126.9137, 60, true),
  ('김포공항역', '5호선 / 9호선 / 공항철도 / 김포골드라인', '서울 강서구 하늘길 77', 37.5622, 126.8013, 70, true),
  ('고속터미널역', '3호선 / 7호선 / 9호선', '서울 서초구 신반포로 188', 37.5048, 127.0049, 80, true),
  ('사당역', '2호선 / 4호선', '서울 동작구 남부순환로 2089', 37.4766, 126.9816, 90, true),
  ('교대역', '2호선 / 3호선', '서울 서초구 서초대로 294', 37.4934, 127.0140, 100, true),
  ('강남역', '2호선 / 신분당선', '서울 강남구 강남대로 396', 37.4979, 127.0276, 110, true),
  ('양재역', '3호선 / 신분당선', '서울 서초구 남부순환로 2585', 37.4846, 127.0340, 120, true),
  ('잠실역', '2호선 / 8호선', '서울 송파구 올림픽로 265', 37.5133, 127.1002, 130, true),
  ('석촌역', '8호선 / 9호선', '서울 송파구 송파대로 439', 37.5054, 127.1069, 140, true),
  ('천호역', '5호선 / 8호선', '서울 강동구 천호대로 997', 37.5386, 127.1233, 150, true),
  ('왕십리역', '2호선 / 5호선 / 경의중앙선 / 수인분당선', '서울 성동구 왕십리광장로 17', 37.5612, 127.0371, 160, true),
  ('청량리역', '1호선 / 경의중앙선 / 경춘선 / 수인분당선', '서울 동대문구 왕산로 214', 37.5801, 127.0464, 170, true),
  ('건대입구역', '2호선 / 7호선', '서울 광진구 아차산로 243', 37.5404, 127.0692, 180, true),
  ('군자역', '5호선 / 7호선', '서울 광진구 천호대로 550', 37.5571, 127.0795, 190, true),
  ('노원역', '4호선 / 7호선', '서울 노원구 상계로 69-1', 37.6551, 127.0614, 200, true),
  ('창동역', '1호선 / 4호선', '서울 도봉구 마들로11길 77', 37.6532, 127.0477, 210, true),
  ('수유역', '4호선', '서울 강북구 도봉로 338', 37.6380, 127.0257, 220, true),
  ('미아사거리역', '4호선', '서울 강북구 도봉로 50', 37.6133, 127.0301, 230, true),
  ('동대문역사문화공원역', '2호선 / 4호선 / 5호선', '서울 중구 을지로 279', 37.5651, 127.0079, 240, true),
  ('종로3가역', '1호선 / 3호선 / 5호선', '서울 종로구 종로 129', 37.5716, 126.9919, 250, true),
  ('광화문역', '5호선', '서울 종로구 세종대로 172', 37.5715, 126.9764, 260, true),
  ('여의도역', '5호선 / 9호선', '서울 영등포구 여의나루로 40', 37.5216, 126.9243, 270, true),
  ('공덕역', '5호선 / 6호선 / 경의중앙선 / 공항철도', '서울 마포구 마포대로 100', 37.5436, 126.9517, 280, true),
  ('디지털미디어시티역', '6호선 / 경의중앙선 / 공항철도', '서울 은평구 수색로 193', 37.5760, 126.9016, 290, true),
  ('구로디지털단지역', '2호선', '서울 구로구 도림천로 477', 37.4853, 126.9015, 300, true),
  ('신림역', '2호선 / 신림선', '서울 관악구 남부순환로 1614', 37.4842, 126.9297, 310, true),
  ('이수역', '4호선 / 7호선', '서울 동작구 동작대로 117', 37.4868, 126.9822, 320, true),
  ('수원역', '1호선 / 수인분당선', '경기 수원시 팔달구 덕영대로 924', 37.2661, 126.9997, 330, true),
  ('인덕원역', '4호선', '경기 안양시 동안구 흥안대로 529', 37.4019, 126.9767, 340, true),
  ('범계역', '4호선', '경기 안양시 동안구 동안로 130', 37.3897, 126.9507, 350, true),
  ('부평역', '1호선 / 인천1호선', '인천 부평구 광장로 16', 37.4895, 126.7240, 360, true),
  ('부천역', '1호선', '경기 부천시 원미구 부천로 1', 37.4840, 126.7827, 370, true),
  ('일산역', '경의중앙선', '경기 고양시 일산서구 경의로 672', 37.6820, 126.7695, 380, true),
  ('야탑역', '수인분당선', '경기 성남시 분당구 성남대로 903', 37.4113, 127.1286, 390, true),
  ('판교역', '신분당선 / 경강선', '경기 성남시 분당구 판교역로 160', 37.3948, 127.1112, 400, true)
on conflict (name) do update set
  line = excluded.line,
  address = excluded.address,
  lat = excluded.lat,
  lng = excluded.lng,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

-- =========================================================
-- 5. Seed app settings and bus options
-- =========================================================

insert into app_settings (key, value)
values
  (
    'bus_ticket_price',
    jsonb_build_object('price', 10000)
  ),
  (
    'first_reservation_deadline',
    jsonb_build_object('deadline_at', now() + interval '7 days')
  )
on conflict (key) do update set
  value = excluded.value,
  updated_at = now();

delete from bus_options
where notes like 'SIM-%';

insert into bus_options (capacity, estimated_price, notes)
values
  (40, 850000, 'SIM-40인승'),
  (45, 920000, 'SIM-45인승')
on conflict do nothing;

commit;
