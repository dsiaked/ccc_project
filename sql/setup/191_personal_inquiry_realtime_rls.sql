drop policy if exists "Users and global admins can view personal inquiries"
  on public.personal_inquiries;
create policy "Users and global admins can view personal inquiries"
on public.personal_inquiries for select to authenticated
using (user_id = auth.uid() or public.is_global_admin());

drop policy if exists "Users and global admins can view personal inquiry messages"
  on public.personal_inquiry_messages;
create policy "Users and global admins can view personal inquiry messages"
on public.personal_inquiry_messages for select to authenticated
using (
  public.is_global_admin()
  or exists (
    select 1
    from public.personal_inquiries inquiry
    where inquiry.id = personal_inquiry_messages.inquiry_id
      and inquiry.user_id = auth.uid()
  )
);

grant select on public.personal_inquiries to authenticated;
grant select on public.personal_inquiry_messages to authenticated;

notify pgrst, 'reload schema';
