import { supabase } from './supabase';

export interface PersonalNotification {
  id: string;
  title: string;
  content: string;
  category: string;
  readAt: string | null;
  createdAt: string;
}

export const getMyPersonalNotifications = async (
  limit = 5
): Promise<PersonalNotification[]> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from('personal_notifications')
    .select('id,title,content,category,read_at,created_at')
    .eq('target_user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (
      error.code === '42P01' ||
      error.code === 'PGRST205' ||
      error.message.includes('personal_notifications')
    ) {
      return [];
    }
    throw error;
  }

  return (data ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    content: item.content,
    category: item.category,
    readAt: item.read_at,
    createdAt: item.created_at,
  }));
};

export const markPersonalNotificationRead = async (notificationId: string) => {
  const { error } = await supabase.rpc('mark_personal_notification_read', {
    p_notification_id: notificationId,
  });
  if (error) throw error;
};
