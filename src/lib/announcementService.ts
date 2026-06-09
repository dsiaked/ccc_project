import { supabase } from './supabase';

export interface HomeAnnouncement {
  id: string;
  title: string;
  content: string;
  isPublished: boolean;
  isArchived: boolean;
  isPinned: boolean;
  publishStartAt: string | null;
  publishEndAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

type HomeAnnouncementRow = {
  id: string;
  title: string;
  content: string;
  is_published: boolean;
  is_archived?: boolean;
  is_pinned?: boolean;
  publish_start_at?: string | null;
  publish_end_at?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const mapAnnouncement = (row: HomeAnnouncementRow): HomeAnnouncement => ({
  id: row.id,
  title: row.title,
  content: row.content,
  isPublished: row.is_published,
  isArchived: Boolean(row.is_archived),
  isPinned: Boolean(row.is_pinned),
  publishStartAt: row.publish_start_at ?? null,
  publishEndAt: row.publish_end_at ?? null,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export async function getPublishedHomeAnnouncements(limit = 5) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('home_announcements')
    .select('*')
    .eq('is_published', true)
    .eq('is_archived', false)
    .or(`publish_start_at.is.null,publish_start_at.lte.${now}`)
    .or(`publish_end_at.is.null,publish_end_at.gt.${now}`)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error && error.code === '42703') {
    const { data: legacyData, error: legacyError } = await supabase
      .from('home_announcements')
      .select('*')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (legacyError) throw new Error(legacyError.message);
    return ((legacyData ?? []) as HomeAnnouncementRow[]).map(mapAnnouncement);
  }

  if (error) {
    console.error('홈 화면 공지 조회 실패:', error);
    throw new Error(error.message);
  }

  return ((data ?? []) as HomeAnnouncementRow[]).map(mapAnnouncement);
}

export async function getHomeAnnouncements(limit = 50) {
  const { data, error } = await supabase
    .from('home_announcements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('홈 화면 공지 조회 실패:', error);
    throw new Error(error.message);
  }

  return ((data ?? []) as HomeAnnouncementRow[]).map(mapAnnouncement);
}

export async function createHomeAnnouncement(params: {
  title: string;
  content: string;
  createdBy: string;
}) {
  const { data, error } = await supabase.rpc(
    'create_home_announcement_as_global_admin',
    {
      p_title: params.title,
      p_content: params.content,
    }
  );

  if (error) {
    console.error('홈 화면 공지 작성 실패:', error);
    throw new Error(error.message);
  }

  return mapAnnouncement(data as HomeAnnouncementRow);
}

export async function updateHomeAnnouncement(params: {
  id: string;
  title: string;
  content: string;
  isPublished: boolean;
  isArchived: boolean;
  isPinned: boolean;
  publishStartAt: string | null;
  publishEndAt: string | null;
}) {
  const { data, error } = await supabase.rpc(
    'update_home_announcement_as_global_admin',
    {
      p_id: params.id,
      p_title: params.title,
      p_content: params.content,
      p_is_published: params.isPublished,
      p_is_archived: params.isArchived,
      p_is_pinned: params.isPinned,
      p_publish_start_at: params.publishStartAt,
      p_publish_end_at: params.publishEndAt,
    }
  );

  if (error) throw new Error(error.message);
  return mapAnnouncement(data as HomeAnnouncementRow);
}
