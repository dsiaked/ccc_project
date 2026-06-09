-- Support full-table collectors that page by stable (created_at, id) cursors.

create index if not exists idx_reservations_created_id
  on public.reservations(created_at desc, id desc);

create index if not exists idx_campus_request_messages_created_id
  on public.campus_request_messages(created_at desc, id desc);
