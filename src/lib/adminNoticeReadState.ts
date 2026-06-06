import type { CampusRequest } from './adminService';
import { supabase } from './supabase';

const readNoticeEventName = 'campus-notices-read';

const getStorageKey = (userId: string) => `campus_notice_read_ids:${userId}`;

export const campusNoticeReadEventName = readNoticeEventName;

export const getReadCampusNoticeIds = async (userId: string) => {
  const { data, error } = await supabase
    .from('campus_notice_reads')
    .select('notice_id')
    .eq('user_id', userId);

  if (error) throw error;

  const readIds = new Set(
    ((data ?? []) as Array<{ notice_id: string }>).map((row) => row.notice_id)
  );
  const storageKey = getStorageKey(userId);

  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    const legacyIds = Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
    const missingIds = legacyIds.filter((noticeId) => !readIds.has(noticeId));

    if (missingIds.length > 0) {
      const { data: validNotices, error: noticeError } = await supabase
        .from('campus_requests')
        .select('id')
        .eq('is_global_notice', true)
        .in('id', missingIds);

      if (noticeError) throw noticeError;

      const validIds = ((validNotices ?? []) as Array<{ id: string }>).map(
        (notice) => notice.id
      );

      if (validIds.length > 0) {
        const { error: migrationInsertError } = await supabase
          .from('campus_notice_reads')
          .upsert(
            validIds.map((noticeId) => ({
              user_id: userId,
              notice_id: noticeId,
            })),
            { onConflict: 'user_id,notice_id', ignoreDuplicates: true }
          );

        if (migrationInsertError) throw migrationInsertError;
      }

      validIds.forEach((noticeId) => readIds.add(noticeId));
    }

    localStorage.removeItem(storageKey);
  } catch (migrationError) {
    console.error('Failed to migrate campus notice read state:', migrationError);
  }

  return readIds;
};

export const getUnreadCampusNotices = async (
  userId: string,
  notices: CampusRequest[]
) => {
  const readIds = await getReadCampusNoticeIds(userId);

  return notices.filter((notice) => !readIds.has(notice.id));
};

export const markCampusNoticesRead = async (
  userId: string,
  noticeIds: string[]
) => {
  if (noticeIds.length === 0) return;

  const { error } = await supabase.from('campus_notice_reads').upsert(
    noticeIds.map((noticeId) => ({
      user_id: userId,
      notice_id: noticeId,
    })),
    { onConflict: 'user_id,notice_id', ignoreDuplicates: true }
  );

  if (error) throw error;

  localStorage.removeItem(getStorageKey(userId));
  window.dispatchEvent(new CustomEvent(readNoticeEventName));
};
