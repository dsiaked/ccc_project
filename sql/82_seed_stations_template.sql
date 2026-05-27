-- =========================================================
-- Station options seed template
-- Run after 01_profiles_organization_stations.sql.
--
-- The app needs rows in stations for the user reservation destination picker.
-- Replace/add rows below with the real return-bus destination candidates.
-- Coordinates are optional but enable the "nearby station recommendation"
-- feature in ReservationPage.
-- =========================================================

insert into stations (
  name,
  line,
  address,
  lat,
  lng,
  sort_order,
  is_active
)
values
  ('서울역', '1호선 / 4호선 / 경의중앙선 / 공항철도', '서울특별시 용산구 한강대로 405', 37.5547, 126.9706, 10, true),
  ('고속터미널역', '3호선 / 7호선 / 9호선', '서울특별시 서초구 신반포로 188', 37.5048, 127.0049, 20, true),
  ('사당역', '2호선 / 4호선', '서울특별시 동작구 남부순환로 2089', 37.4766, 126.9816, 30, true),
  ('잠실역', '2호선 / 8호선', '서울특별시 송파구 올림픽로 265', 37.5133, 127.1002, 40, true),
  ('청량리역', '1호선 / 경의중앙선 / 경춘선 / 수인분당선', '서울특별시 동대문구 왕산로 214', 37.5801, 127.0464, 50, true)
on conflict (name)
do update set
  line = excluded.line,
  address = excluded.address,
  lat = excluded.lat,
  lng = excluded.lng,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();
