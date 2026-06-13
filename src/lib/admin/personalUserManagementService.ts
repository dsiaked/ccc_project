import { supabase } from '../supabase';
import type { StationPreference } from '../../types/reservation';

export type PersonalUserPaymentStatus =
  | 'pending'
  | 'completed'
  | 'refund_required'
  | 'refunded';

export interface PersonalUserNotification {
  id: string;
  title: string;
  content: string;
  category: string;
  readAt: string | null;
  createdAt: string;
}

export interface PersonalUserActionLog {
  id: string;
  actorId: string | null;
  actorName: string;
  action: string;
  reason: string;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  reversible: boolean;
  revertedAt: string | null;
  createdAt: string;
}

export interface PersonalUserManagementDetail {
  paymentId: string | null;
  paymentStatus: PersonalUserPaymentStatus | null;
  notifications: PersonalUserNotification[];
  actionLogs: PersonalUserActionLog[];
}

export const getPersonalUserManagementDetail = async (
  userId: string,
  reservationId: string | null
): Promise<PersonalUserManagementDetail> => {
  const [paymentResult, notificationResult, actionLogResult] = await Promise.all([
    reservationId
      ? supabase
          .from('payments')
          .select('id,status')
          .eq('reservation_id', reservationId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from('personal_notifications')
      .select('id,title,content,category,read_at,created_at')
      .eq('target_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('personal_user_action_logs')
      .select('id,actor_id,action,reason,before_data,after_data,reversible,reverted_at,created_at')
      .eq('target_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  if (paymentResult.error) throw paymentResult.error;
  if (notificationResult.error) throw notificationResult.error;
  if (actionLogResult.error) throw actionLogResult.error;

  const actorIds = [
    ...new Set(
      (actionLogResult.data ?? [])
        .map((item) => item.actor_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const actorResult =
    actorIds.length > 0
      ? await supabase.from('profiles').select('id,name,email').in('id', actorIds)
      : { data: [], error: null };
  if (actorResult.error) throw actorResult.error;
  const actors = new Map(
    (actorResult.data ?? []).map((actor) => [
      actor.id,
      actor.name || actor.email || '관리자',
    ])
  );

  return {
    paymentId: paymentResult.data?.id ?? null,
    paymentStatus:
      (paymentResult.data?.status as PersonalUserPaymentStatus | undefined) ??
      null,
    notifications: (notificationResult.data ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      content: item.content,
      category: item.category,
      readAt: item.read_at,
      createdAt: item.created_at,
    })),
    actionLogs: (actionLogResult.data ?? []).map((item) => ({
      id: item.id,
      actorId: item.actor_id,
      actorName: item.actor_id ? actors.get(item.actor_id) || '관리자' : '관리자',
      action: item.action,
      reason: item.reason,
      beforeData: item.before_data,
      afterData: item.after_data,
      reversible: item.reversible,
      revertedAt: item.reverted_at,
      createdAt: item.created_at,
    })),
  };
};

export const updatePersonalReservationStatus = async (params: {
  reservationId: string;
  status: 'requested' | 'cancelled';
  reason: string;
}) => {
  const { error } = await supabase.rpc('manage_personal_reservation_status', {
    p_reservation_id: params.reservationId,
    p_next_status: params.status,
    p_reason: params.reason,
  });
  if (error) throw error;
};

export const updatePersonalUserOrganization = async (params: {
  targetUserId: string;
  reservationId: string | null;
  affiliationType: 'seoul' | 'external';
  campusId: string | null;
  district: string | null;
  campus: string | null;
  coordinatorName: string | null;
  coordinatorPhone: string | null;
  reason: string;
}) => {
  const { error } = await supabase.rpc('update_personal_user_organization_v2', {
    p_target_user_id: params.targetUserId,
    p_reservation_id: params.reservationId,
    p_affiliation_type: params.affiliationType,
    p_campus_id: params.campusId,
    p_district: params.district,
    p_campus: params.campus,
    p_coordinator_name: params.coordinatorName,
    p_coordinator_phone: params.coordinatorPhone,
    p_reason: params.reason,
  });
  if (error) throw error;
};

export const revertPersonalUserAction = async (
  actionLogId: string,
  reason: string
) => {
  const { error } = await supabase.rpc('revert_personal_user_action', {
    p_action_log_id: actionLogId,
    p_reason: reason,
  });
  if (error) throw error;
};

export const bulkUpdatePersonalUserPayments = async (params: {
  reservationIds: string[];
  status: PersonalUserPaymentStatus;
  reason: string;
}) => {
  const { error } = await supabase.rpc('bulk_manage_personal_user_payments', {
    p_reservation_ids: params.reservationIds,
    p_status: params.status,
    p_reason: params.reason,
  });
  if (error) throw error;
};

export const bulkSendPersonalNotifications = async (params: {
  targetUserIds: string[];
  title: string;
  content: string;
  reason: string;
}) => {
  const { error } = await supabase.rpc('bulk_send_personal_notifications', {
    p_target_user_ids: params.targetUserIds,
    p_title: params.title,
    p_content: params.content,
    p_category: 'admin',
    p_reason: params.reason,
  });
  if (error) throw error;
};

export const assignPersonalBoardingManager = async (userId: string) => {
  const { error } = await supabase.rpc('assign_boarding_manager_as_global_admin', {
    p_user_id: userId,
  });
  if (error) throw error;
};

export const cancelPersonalBoardingManager = async (userId: string) => {
  const { error } = await supabase.rpc('cancel_boarding_manager_as_global_admin', {
    p_user_id: userId,
  });
  if (error) throw error;
};

export const updatePersonalUserPayment = async (params: {
  reservationId: string;
  status: PersonalUserPaymentStatus;
  reason: string;
}) => {
  const { error } = await supabase.rpc('manage_personal_user_payment', {
    p_reservation_id: params.reservationId,
    p_status: params.status,
    p_reason: params.reason,
  });

  if (error) throw error;
};

export const recordPersonalUserAction = async (params: {
  targetUserId: string;
  reservationId: string | null;
  action: string;
  reason: string;
}) => {
  const { error } = await supabase.rpc('record_personal_user_action', {
    p_target_user_id: params.targetUserId,
    p_reservation_id: params.reservationId,
    p_action: params.action,
    p_reason: params.reason,
  });

  if (error) throw error;
};

export const sendPersonalNotification = async (params: {
  targetUserId: string;
  title: string;
  content: string;
  category: string;
  reason: string;
}) => {
  const { error } = await supabase.rpc('send_personal_notification', {
    p_target_user_id: params.targetUserId,
    p_title: params.title,
    p_content: params.content,
    p_category: params.category,
    p_reason: params.reason,
  });

  if (error) throw error;
};

export const updatePersonalUserInfo = async (params: {
  targetUserId: string;
  reservationId: string | null;
  name: string;
  phone: string;
  reason: string;
}) => {
  const { error } = await supabase.rpc('update_personal_user_info', {
    p_target_user_id: params.targetUserId,
    p_reservation_id: params.reservationId,
    p_name: params.name,
    p_phone: params.phone,
    p_reason: params.reason,
  });

  if (error) throw error;
};

export const savePersonalReservationAsAdmin = async (params: {
  targetUserId: string;
  name: string;
  phone: string;
  district: string;
  team: string;
  campus: string;
  stationPreferences: StationPreference[];
  data: unknown;
  reason: string;
}) => {
  const { error } = await supabase.rpc('save_user_reservation_as_admin', {
    p_target_user_id: params.targetUserId,
    p_name: params.name,
    p_phone: params.phone,
    p_district: params.district,
    p_team: params.team,
    p_campus: params.campus,
    p_station_preferences: params.stationPreferences,
    p_data: params.data,
    p_reason: params.reason,
  });

  if (error) throw error;
};

export const updatePersonalUserStaffStatus = async (params: {
  targetUserId: string;
  isStaff: boolean;
  reason: string;
}) => {
  const { error } = await supabase.rpc('update_personal_user_staff_status', {
    p_target_user_id: params.targetUserId,
    p_is_staff: params.isStaff,
    p_reason: params.reason,
  });

  if (error) throw error;
};

