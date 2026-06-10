-- Preserve boarding audit history while allowing administrator account deletion.

alter table public.boarding_move_requests
  drop constraint if exists boarding_move_requests_requested_by_fkey;
alter table public.boarding_move_requests
  alter column requested_by drop not null;
alter table public.boarding_move_requests
  add constraint boarding_move_requests_requested_by_fkey
  foreign key (requested_by) references auth.users(id) on delete set null;

alter table public.boarding_exception_reason_edits
  drop constraint if exists boarding_exception_reason_edits_updated_by_fkey;
alter table public.boarding_exception_reason_edits
  alter column updated_by drop not null;
alter table public.boarding_exception_reason_edits
  add constraint boarding_exception_reason_edits_updated_by_fkey
  foreign key (updated_by) references auth.users(id) on delete set null;

alter table public.boarding_exception_reason_edit_logs
  drop constraint if exists boarding_exception_reason_edit_logs_edited_by_fkey;
alter table public.boarding_exception_reason_edit_logs
  alter column edited_by drop not null;
alter table public.boarding_exception_reason_edit_logs
  add constraint boarding_exception_reason_edit_logs_edited_by_fkey
  foreign key (edited_by) references auth.users(id) on delete set null;

alter table public.boarding_exception_archives
  drop constraint if exists boarding_exception_archives_archived_by_fkey;
alter table public.boarding_exception_archives
  alter column archived_by drop not null;
alter table public.boarding_exception_archives
  add constraint boarding_exception_archives_archived_by_fkey
  foreign key (archived_by) references auth.users(id) on delete set null;

alter table public.manual_boarding_exception_records
  drop constraint if exists manual_boarding_exception_records_created_by_fkey;
alter table public.manual_boarding_exception_records
  alter column created_by drop not null;
alter table public.manual_boarding_exception_records
  add constraint manual_boarding_exception_records_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

notify pgrst, 'reload schema';
