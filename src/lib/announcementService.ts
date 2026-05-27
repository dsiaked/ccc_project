import { supabase } from './supabase';

export interface HomeAnnouncement {
  id: string;
  title: string;
  content: string;
  isPublished: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

type HomeAnnouncementRow = {
  id: string;
  title: string;
  content: string;
  is_published: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const mapAnnouncement = (row: HomeAnnouncementRow): HomeAnnouncement => ({
  id: row.id,
  title: row.title,
  content: row.content,
  isPublished: row.is_published,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export async function getPublishedHomeAnnouncements(limit = 5) {
  const { data, error } = await supabase
    .from('home_announcements')
    .select('*')
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('홈 공지 조회 실패:', error);
    throw new Error(error.message);
  }

  return ((data ?? []) as HomeAnnouncementRow[]).map(mapAnnouncement);
}

export async function createHomeAnnouncement(params: {
  title: string;
  content: string;
  createdBy: string;
}) {
  const { data, error } = await supabase
    .from('home_announcements')
    .insert({
      title: params.title.trim(),
      content: params.content.trim(),
      created_by: params.createdBy,
      is_published: true,
    })
    .select('*')
    .single();

  if (error) {
    console.error('홈 공지 작성 실패:', error);
    throw new Error(error.message);
  }

  return mapAnnouncement(data as HomeAnnouncementRow);
}
