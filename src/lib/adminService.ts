import { supabase } from './supabase';

// ===== 공통 타입 =====

export type AdminRoleType = 'global_admin' | 'campus_admin';
export type CampusRequestType =
  | 'notice'
  | 'late_signup'
  | 'cancel_refund'
  | 'payment_issue'
  | 'roster_change'
  | 'transfer_issue'
  | 'etc';
export type CampusRequestStatus =
  | 'open'
  | 'in_progress'
  | 'resolved'
  | 'on_hold';

export interface AdminRole {
  id: string;
  user_id: string;
  role: AdminRoleType;
  district: string | null;
  team: string | null;
  campus: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AdminUserSearchResult {
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  district: string | null;
  team: string | null;
  campus: string | null;
  role: AdminRoleType | null;
  adminRoleId: string | null;
}

export interface SelectOption {
  id: string;
  name: string;
}

export interface CampusOptionViewRow {
  district_id: string;
  district: string;
  team_id: string;
  team: string;
  campus_id: string;
  campus: string;
}

export type CampusManagerSearchParams = {
  district?: string;
  team?: string;
  campus?: string;
};

export type UserSearchResult = {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  district: string | null;
  team: string | null;
  campus: string | null;
};

export type CampusAdminRole = {
  id: string;
  user_id: string;
  role: string;
  district: string | null;
  team: string | null;
  campus: string | null;
  created_at: string;
  profiles?: {
    id: string;
    email: string | null;
    name: string | null;
  } | null;
};

type PaymentStatsRow = {
  status: 'pending' | 'completed' | 'refunded' | string | null;
  amount: number | null;
};

type CampusTransferStatsRow = {
  id?: string | null;
  district?: string | null;
  team?: string | null;
  campus?: string | null;
  campus_admin_name?: string | null;
  campus_admin_phone?: string | null;
  current_total_people?: number | null;
  current_paid_people?: number | null;
  current_total_amount?: number | null;
  total_people?: number | null;
  paid_people?: number | null;
  total_amount?: number | null;
  reported_total_people?: number | null;
  reported_paid_people?: number | null;
  reported_total_amount?: number | null;
  actual_confirmed_amount?: number | null;
  additional_amount_due?: number | null;
  has_additional_settlement?: boolean | null;
  status?: 'pending' | 'sent' | 'confirmed' | null;
  sent_at?: string | null;
};

type CampusTransferMutationRow = {
  id: string;
  district: string | null;
  team: string | null;
  campus: string | null;
  total_people: number | null;
  paid_people: number | null;
  total_amount: number | null;
  actual_confirmed_amount: number | null;
  status: 'sent' | 'confirmed' | null;
  sent_at: string | null;
};

type CampusTransferActualAmountRow = {
  id: string;
  status: 'sent' | 'confirmed' | null;
  actual_confirmed_amount: number | null;
};

type CampusTransferRow = CampusTransferMutationRow & {
  sent_by?: string | null;
};

type CampusRequestRow = {
  id: string;
  type: CampusRequestType;
  status: CampusRequestStatus;
  title: string;
  content: string;
  admin_response: string | null;
  is_global_notice?: boolean | null;
  district: string;
  team: string;
  campus: string;
  created_by: string;
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
  updated_at: string;
};

type CampusRequestMessageRow = {
  id: string;
  request_id: string;
  sender_id: string;
  sender_role: AdminRoleType;
  message: string;
  created_at: string;
};

type DestinationStatsRow = {
  station_name: string;
  rank1: number | string;
  rank2: number | string;
  total: number | string;
};

export type ReservationDataResetStats = {
  reservations: number;
  payments: number;
  campusTransfers: number;
  busAllocations: number;
  campusRequests: number;
  campusRequestMessages: number;
  stations: number;
  busOptions: number;
  appSettings: number;
  homeAnnouncements: number;
  campusAdminRoles: number;
  organization: number;
  userAccounts: number;
};

export type ReservationDataResetOptions = {
  reservations: boolean;
  payments: boolean;
  campusTransfers: boolean;
  busAllocations: boolean;
  campusRequests: boolean;
  stations: boolean;
  busOptions: boolean;
  appSettings: boolean;
  homeAnnouncements: boolean;
  campusAdminRoles: boolean;
  organization: boolean;
  userAccounts: boolean;
};

const emptyReservationDataResetStats = (): ReservationDataResetStats => ({
  reservations: 0,
  payments: 0,
  campusTransfers: 0,
  busAllocations: 0,
  campusRequests: 0,
  campusRequestMessages: 0,
  stations: 0,
  busOptions: 0,
  appSettings: 0,
  homeAnnouncements: 0,
  campusAdminRoles: 0,
  organization: 0,
  userAccounts: 0,
});

const toReservationDataResetStats = (
  value: unknown
): ReservationDataResetStats => {
  const source =
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

  return {
    reservations: Number(source.reservations ?? 0),
    payments: Number(source.payments ?? 0),
    campusTransfers: Number(source.campusTransfers ?? 0),
    busAllocations: Number(source.busAllocations ?? 0),
    campusRequests: Number(source.campusRequests ?? 0),
    campusRequestMessages: Number(source.campusRequestMessages ?? 0),
    stations: Number(source.stations ?? 0),
    busOptions: Number(source.busOptions ?? 0),
    appSettings: Number(source.appSettings ?? 0),
    homeAnnouncements: Number(source.homeAnnouncements ?? 0),
    campusAdminRoles: Number(source.campusAdminRoles ?? 0),
    organization: Number(source.organization ?? 0),
    userAccounts: Number(source.userAccounts ?? 0),
  };
};

async function getTableCount(tableName: string) {
  const { count, error } = await supabase
    .from(tableName)
    .select('*', { count: 'exact', head: true });

  if (error) throw error;

  return count ?? 0;
}

async function getCampusAdminRoleCount() {
  const { count, error } = await supabase
    .from('admin_roles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'campus_admin');

  if (error) throw error;

  return count ?? 0;
}

async function getDeletableUserCount() {
  const { data, error } = await supabase.rpc('get_deletable_user_count');

  if (error) {
    console.warn(
      'Failed to load deletable auth user count, using profile count:',
      error
    );
    return Math.max(0, (await getTableCount('profiles')) - 1);
  }

  return Number(data ?? 0);
}


// ===== 관리자 권한 기본 =====

const ADMIN_ROLE_CACHE_TTL_MS = 30_000;
const adminRoleCache = new Map<
  string,
  { value: AdminRole | null; expiresAt: number }
>();
const adminRoleRequests = new Map<string, Promise<AdminRole | null>>();

const invalidateAdminRoleCache = (userId?: string) => {
  if (userId) {
    adminRoleCache.delete(userId);
    adminRoleRequests.delete(userId);
    return;
  }

  adminRoleCache.clear();
  adminRoleRequests.clear();
};

export async function getAdminRole(userId: string) {
  const cached = adminRoleCache.get(userId);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const pendingRequest = adminRoleRequests.get(userId);

  if (pendingRequest) {
    return pendingRequest;
  }

  const request = (async () => {
    const { data, error } = await supabase
      .from('admin_roles')
      .select('*')
      .eq('user_id', userId)
      .order('role', { ascending: false })
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false, nullsFirst: false });

    if (error) {
      console.error('Failed to get admin role:', error);
      return null;
    }

    const roles = (data ?? []) as AdminRole[];
    const role =
      roles.find((item) => item.role === 'global_admin') ||
      roles.find((item) => item.role === 'campus_admin') ||
      null;

    adminRoleCache.set(userId, {
      value: role,
      expiresAt: Date.now() + ADMIN_ROLE_CACHE_TTL_MS,
    });

    return role;
  })();

  adminRoleRequests.set(userId, request);

  try {
    return await request;
  } finally {
    adminRoleRequests.delete(userId);
  }
}

export async function setAdminRole(
  userId: string,
  role: AdminRoleType,
  campus?: string
) {
  try {
    const { error: deleteError } = await supabase
      .from('admin_roles')
      .delete()
      .eq('user_id', userId);

    if (deleteError) throw deleteError;

    const { error: insertError } = await supabase.from('admin_roles').insert({
      user_id: userId,
      role,
      campus: campus || null,
    });

    if (insertError) throw insertError;

    invalidateAdminRoleCache(userId);

    return { success: true };
  } catch (error) {
    console.error('Failed to set admin role:', error);
    throw error;
  }
}

// ===== campus_options view 기반 지구/팀/캠퍼스 조회 =====

export async function getDistrictsForAdmin() {
  const { data, error } = await supabase
    .from('campus_options')
    .select('district_id, district')
    .order('district', { ascending: true });

  if (error) throw error;

  const map = new Map<string, SelectOption>();

  (data ?? []).forEach((item) => {
    if (item.district_id && item.district) {
      map.set(item.district_id, {
        id: item.district_id,
        name: item.district,
      });
    }
  });

  return Array.from(map.values());
}

export async function getTeamsByDistrict(districtId: string) {
  const { data, error } = await supabase
    .from('campus_options')
    .select('team_id, team')
    .eq('district_id', districtId)
    .order('team', { ascending: true });

  if (error) throw error;

  const map = new Map<string, SelectOption>();

  (data ?? []).forEach((item) => {
    if (item.team_id && item.team) {
      map.set(item.team_id, {
        id: item.team_id,
        name: item.team,
      });
    }
  });

  return Array.from(map.values());
}

export async function getCampusesByTeam(teamId: string) {
  const { data, error } = await supabase
    .from('campus_options')
    .select('campus_id, campus')
    .eq('team_id', teamId)
    .order('campus', { ascending: true });

  if (error) throw error;

  const map = new Map<string, SelectOption>();

  (data ?? []).forEach((item) => {
    if (item.campus_id && item.campus) {
      map.set(item.campus_id, {
        id: item.campus_id,
        name: item.campus,
      });
    }
  });

  return Array.from(map.values());
}

// 기존 코드 호환용 함수
export async function getAllDistricts() {
  const districts = await getDistrictsForAdmin();
  return districts.map((district) => district.name);
}

// ===== 관리자 검색 =====

export async function searchUsersForAdmin(keyword: string) {
  const normalizedKeyword = keyword.trim();

  if (!normalizedKeyword) {
    return [];
  }

  const likeKeyword = `%${normalizedKeyword}%`;

  const { data: profileUsers, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, name, phone, district, team, campus')
    .or(
      `email.ilike.${likeKeyword},name.ilike.${likeKeyword},phone.ilike.${likeKeyword},district.ilike.${likeKeyword},team.ilike.${likeKeyword},campus.ilike.${likeKeyword}`
    )
    .limit(30);

  if (profileError) {
    console.error('Failed to search profile users:', profileError);
    throw profileError;
  }

  const userMap = new Map<string, AdminUserSearchResult>();

  for (const item of profileUsers || []) {
    userMap.set(item.id, {
      userId: item.id,
      name: item.name || '이름 없음',
      email: item.email || null,
      phone: item.phone || null,
      district: item.district || null,
      team: item.team || null,
      campus: item.campus || null,
      role: null,
      adminRoleId: null,
    });
  }

  const { data: reservationUsers, error: reservationError } = await supabase
    .from('reservations')
    .select('user_id, name, phone, district, team, campus, created_at')
    .or(
      `name.ilike.${likeKeyword},phone.ilike.${likeKeyword},district.ilike.${likeKeyword},team.ilike.${likeKeyword},campus.ilike.${likeKeyword}`
    )
    .order('created_at', { ascending: false })
    .limit(30);

  if (reservationError) {
    console.error('Failed to search reservation users:', reservationError);
    throw reservationError;
  }

  for (const item of reservationUsers || []) {
    if (!item.user_id) continue;

    const existing = userMap.get(item.user_id);

    userMap.set(item.user_id, {
      userId: item.user_id,
      name: existing?.name || item.name || '이름 없음',
      email: existing?.email || null,
      phone: existing?.phone || item.phone || null,
      district: existing?.district || item.district || null,
      team: existing?.team || item.team || null,
      campus: existing?.campus || item.campus || null,
      role: null,
      adminRoleId: null,
    });
  }

  const userIds = Array.from(userMap.keys());

  if (userIds.length === 0) {
    return [];
  }

  const { data: roles, error: roleError } = await supabase
    .from('admin_roles')
    .select('id, user_id, role, district, team, campus')
    .in('user_id', userIds);

  if (roleError) {
    console.error('Failed to get admin roles:', roleError);
    throw roleError;
  }

  for (const role of roles || []) {
    const target = userMap.get(role.user_id);

    if (!target) continue;

    target.role = role.role as AdminRoleType;
    target.adminRoleId = role.id;
    target.district = role.district || target.district;
    target.team = role.team || target.team;
    target.campus = role.campus || target.campus;
  }

  return Array.from(userMap.values());
}

export async function searchUsersForCampusManager({
  district,
  team,
  campus,
}: CampusManagerSearchParams) {
  let profileQuery = supabase
    .from('profiles')
    .select('id, email, name, phone, district, team, campus')
    .order('district', { ascending: true, nullsFirst: false })
    .order('team', { ascending: true, nullsFirst: false })
    .order('campus', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true, nullsFirst: false })
    .limit(200);

  if (district) {
    profileQuery = profileQuery.eq('district', district);
  }

  if (team) {
    profileQuery = profileQuery.eq('team', team);
  }

  if (campus) {
    profileQuery = profileQuery.eq('campus', campus);
  }

  const { data: profileUsers, error: profileError } = await profileQuery;

  if (profileError) {
    console.error('profiles 유저 조회 실패:', profileError);
    throw new Error(profileError.message);
  }

  if (!profileUsers || profileUsers.length === 0) {
    return [];
  }

  const userIds = profileUsers
    .map((user) => user.id)
    .filter(Boolean);

  if (userIds.length === 0) {
    return [];
  }

  const { data: roles, error: roleError } = await supabase
    .from('admin_roles')
    .select('id, user_id, role, district, team, campus')
    .in('user_id', userIds);

  if (roleError) {
    console.error('admin_roles 조회 실패:', roleError);
    throw new Error(roleError.message);
  }

  return profileUsers.map((user) => {
    const userDistrict = user.district || null;
    const userTeam = user.team || null;
    const userCampus = user.campus || null;

    const matchedAdminRole =
      roles?.find((role) => {
        if (role.user_id !== user.id) return false;

        if (role.role === 'global_admin') {
          return true;
        }

        if (role.role === 'campus_admin') {
          /*
            null 값이 있는 경우에는 비교 대상에서 제외합니다.
            즉, user나 role 쪽에 district/team/campus가 비어 있으면
            해당 campus_admin 매칭은 하지 않습니다.
          */
          if (!role.district || !role.team || !role.campus) return false;
          if (!userDistrict || !userTeam || !userCampus) return false;

          return (
            role.district === userDistrict &&
            role.team === userTeam &&
            role.campus === userCampus
          );
        }

        return false;
      }) ?? null;

    return {
      userId: user.id,
      email: user.email || null,
      name: user.name || '이름 없음',
      phone: user.phone || null,
      district: userDistrict,
      team: userTeam,
      campus: userCampus,
      role: matchedAdminRole?.role ?? null,
      adminRoleId: matchedAdminRole?.id ?? null,
    } as AdminUserSearchResult;
  });
}

// ===== 캠퍼스 관리자 등록/취소/변경 =====

export async function getCampusAdminByCampus(
  district: string,
  team: string,
  campus: string
) {
  const { data, error } = await supabase
    .from('admin_roles')
    .select(
      `
      id,
      user_id,
      role,
      district,
      team,
      campus,
      created_at,
      profiles:user_id (
        id,
        email,
        name
      )
    `
    )
    .eq('role', 'campus_admin')
    .eq('district', district)
    .eq('team', team)
    .eq('campus', campus)
    .maybeSingle();

  if (error) throw error;

  return data as CampusAdminRole | null;
}

export async function registerCampusAdmin({
  userId,
  district,
  team,
  campus,
}: {
  userId: string;
  district: string;
  team: string;
  campus: string;
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('로그인이 필요합니다.');
  }

  /*
    같은 지구/팀/캠퍼스에 이미 캠퍼스 관리자가 있으면 먼저 제거합니다.
    그래서 기존 관리자가 등록되어 있어도 새 관리자로 변경할 수 있습니다.
  */
  const { error: deleteError } = await supabase
    .from('admin_roles')
    .delete()
    .eq('role', 'campus_admin')
    .eq('district', district)
    .eq('team', team)
    .eq('campus', campus);

  if (deleteError) throw deleteError;

  const { error: insertError } = await supabase.from('admin_roles').insert({
    user_id: userId,
    role: 'campus_admin',
    district,
    team,
    campus,
    granted_by: user.id,
    updated_at: new Date().toISOString(),
  });

  if (insertError) throw insertError;

  invalidateAdminRoleCache();

  return { success: true };
}

export async function cancelCampusAdmin(adminRoleId: string) {
  const { error } = await supabase
    .from('admin_roles')
    .delete()
    .eq('id', adminRoleId)
    .eq('role', 'campus_admin');

  if (error) throw error;

  invalidateAdminRoleCache();

  return { success: true };
}

// 기존 코드 호환용 함수
export async function assignCampusAdmin(userId: string, campus: string) {
  const { error: deleteError } = await supabase
    .from('admin_roles')
    .delete()
    .eq('user_id', userId)
    .eq('role', 'campus_admin')
    .eq('campus', campus);

  if (deleteError) {
    console.error('Failed to clear previous campus admin role:', deleteError);
    throw deleteError;
  }

  const { error } = await supabase.from('admin_roles').insert({
    user_id: userId,
    role: 'campus_admin',
    campus,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error('Failed to assign campus admin:', error);
    throw error;
  }

  invalidateAdminRoleCache(userId);

  return { success: true };
}

// 기존 코드 호환용 함수
export async function removeCampusAdmin(userId: string) {
  const { error } = await supabase
    .from('admin_roles')
    .delete()
    .eq('user_id', userId)
    .eq('role', 'campus_admin');

  if (error) {
    console.error('Failed to remove campus admin:', error);
    throw error;
  }

  invalidateAdminRoleCache(userId);

  return { success: true };
}

// ===== 입금 관리 =====

export async function createPayment(
  userId: string,
  reservationId: string,
  amount: number
) {
  try {
    const { error } = await supabase.from('payments').insert({
      user_id: userId,
      reservation_id: reservationId,
      amount,
      status: 'pending',
    });

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('Failed to create payment:', error);
    throw error;
  }
}

export async function verifyPayment(
  paymentId: string,
  verifiedBy: string,
  notes?: string
) {
  const { error } = await supabase
    .from('payments')
    .update({
      status: 'completed',
      verified_by: verifiedBy,
      verified_at: new Date().toISOString(),
      notes: notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', paymentId);

  if (error) {
    console.error('Failed to verify payment:', error);
    throw new Error(
      `[입금 확인 실패] ${error.message}${
        error.details ? ` / ${error.details}` : ''
      }${error.hint ? ` / hint: ${error.hint}` : ''}`
    );
  }

  return { success: true };
}

export async function updatePaymentStatus(
  paymentId: string,
  status: 'pending' | 'completed' | 'refunded',
  verifiedBy?: string
) {
  const updateData =
    status === 'completed'
      ? {
          status,
          verified_by: verifiedBy || null,
          verified_at: new Date().toISOString(),
        }
      : {
          status,
          verified_by: null,
          verified_at: null,
        };

  const { error } = await supabase
    .from('payments')
    .update(updateData)
    .eq('id', paymentId);

  if (error) {
    console.error('입금 상태 변경 실패:', error);
    throw new Error(
      `[입금 상태 변경 실패] ${error.message}${
        error.details ? ` / ${error.details}` : ''
      }${error.hint ? ` / hint: ${error.hint}` : ''}`
    );
  }

  return { success: true };
}

export async function createOrUpdatePaymentStatus({
  paymentId,
  reservationId,
  userId,
  amount,
  status,
}: {
  paymentId: string | null;
  reservationId: string;
  userId: string;
  amount: number;
  status: 'pending' | 'completed' | 'refunded';
  verifiedBy?: string;
}) {
  const { data, error } = await supabase.rpc('upsert_reservation_payment', {
    p_payment_id: paymentId,
    p_reservation_id: reservationId,
    p_user_id: userId,
    p_amount: amount,
    p_status: status,
  });

  if (error) {
    console.error('입금 상태 변경 RPC 실패:', error);
    throw new Error(`[입금 상태 변경 실패] ${error.message}`);
  }

  return data;
}


export async function getPaymentStats() {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('status, amount');

    if (error) throw error;

    const stats = {
      completed: 0,
      pending: 0,
      refunded: 0,
      totalCompleted: 0,
      completedCount: 0,
    };

    ((data || []) as PaymentStatsRow[]).forEach((payment) => {
      if (payment.status === 'completed') {
        stats.completed += 1;
        stats.totalCompleted += payment.amount || 0;
        stats.completedCount += 1;
      } else if (payment.status === 'pending') {
        stats.pending += 1;
      } else if (payment.status === 'refunded') {
        stats.refunded += 1;
      }
    });

    return stats;
  } catch (error) {
    console.error('Failed to get payment stats:', error);
    throw error;
  }
}


export interface CampusTransferStat {
  id: string;
  district: string;
  team: string;
  campus: string;
  campusAdminName: string | null;
  campusAdminPhone: string | null;
  totalPeople: number;
  paidPeople: number;
  totalAmount: number;
  reportedTotalPeople: number;
  reportedPaidPeople: number;
  reportedTotalAmount: number;
  actualConfirmedAmount: number | null;
  additionalAmountDue: number;
  hasAdditionalSettlement: boolean;
  status: 'pending' | 'sent' | 'confirmed';
  sentAt: string | null;
}

export async function getCampusTransferStats(): Promise<CampusTransferStat[]> {
  const { data, error } = await supabase.rpc(
    'get_global_campus_transfer_stats'
  );

  if (error) {
    console.error('Failed to get campus transfer stats:', error);
    throw new Error(error.message);
  }

  const stats = ((data ?? []) as CampusTransferStatsRow[]).map((item) => {
    const status = item.status ?? 'pending';
    const totalPeople = Number(item.current_total_people ?? item.total_people ?? 0);
    const paidPeople = Number(item.current_paid_people ?? item.paid_people ?? 0);
    const totalAmount = Number(item.current_total_amount ?? item.total_amount ?? 0);
    const reportedTotalPeople = Number(
      item.reported_total_people ?? (status === 'pending' ? 0 : item.total_people) ?? 0
    );
    const reportedPaidPeople = Number(
      item.reported_paid_people ?? (status === 'pending' ? 0 : item.paid_people) ?? 0
    );
    const reportedTotalAmount = Number(
      item.reported_total_amount ?? (status === 'pending' ? 0 : item.total_amount) ?? 0
    );
    const actualConfirmedAmount =
      item.actual_confirmed_amount === null ||
      item.actual_confirmed_amount === undefined
        ? null
        : Number(item.actual_confirmed_amount);
    const additionalAmountDue = Math.max(
      Number(item.additional_amount_due ?? totalAmount - reportedTotalAmount),
      0
    );

    return {
      id: item.id ?? `empty-${item.district}-${item.team}-${item.campus}`,
      district: item.district ?? '',
      team: item.team ?? '',
      campus: item.campus ?? '',
      campusAdminName: item.campus_admin_name ?? null,
      campusAdminPhone: item.campus_admin_phone ?? null,
      totalPeople,
      paidPeople,
      totalAmount,
      reportedTotalPeople,
      reportedPaidPeople,
      reportedTotalAmount,
      actualConfirmedAmount,
      additionalAmountDue,
      hasAdditionalSettlement:
        Boolean(item.has_additional_settlement) || additionalAmountDue > 0,
      status,
      sentAt: item.sent_at ?? null,
    };
  });

  const transferIds = stats
    .map((item) => item.id)
    .filter((id) => id && !id.startsWith('empty-'));

  if (transferIds.length === 0) {
    return stats;
  }

  const { data: actualRows, error: actualError } = await supabase
    .from('campus_transfers')
    .select('id, status, actual_confirmed_amount')
    .in('id', transferIds);

  if (actualError) {
    console.warn('Failed to hydrate campus transfer actual amounts:', actualError);
    return stats;
  }

  const actualById = new Map(
    ((actualRows ?? []) as CampusTransferActualAmountRow[]).map((row) => [
      row.id,
      row,
    ])
  );

  return stats.map((item) => {
    const actualRow = actualById.get(item.id);

    if (!actualRow) return item;

    return {
      ...item,
      status: actualRow.status ?? item.status,
      actualConfirmedAmount:
        actualRow.actual_confirmed_amount === null ||
        actualRow.actual_confirmed_amount === undefined
          ? item.actualConfirmedAmount
          : Number(actualRow.actual_confirmed_amount),
    };
  });
}

export async function getCampusTransferByScope({
  district,
  team,
  campus,
}: {
  district: string;
  team: string;
  campus: string;
}): Promise<CampusTransferStat | null> {
  const { data, error } = await supabase
    .from('campus_transfers')
    .select(
      'id, district, team, campus, total_people, paid_people, total_amount, actual_confirmed_amount, status, sent_at, sent_by'
    )
    .eq('district', district)
    .eq('team', team)
    .eq('campus', campus)
    .maybeSingle();

  if (error) {
    console.error('Failed to get campus transfer by scope:', error);
    throw new Error(error.message);
  }

  if (!data) return null;

  const transfer = data as CampusTransferRow;
  const reportedTotalPeople = Number(transfer.total_people ?? 0);
  const reportedPaidPeople = Number(transfer.paid_people ?? 0);
  const reportedTotalAmount = Number(transfer.total_amount ?? 0);

  return {
    id: transfer.id,
    district: transfer.district ?? district,
    team: transfer.team ?? team,
    campus: transfer.campus ?? campus,
    campusAdminName: null,
    campusAdminPhone: null,
    totalPeople: reportedTotalPeople,
    paidPeople: reportedPaidPeople,
    totalAmount: reportedTotalAmount,
    reportedTotalPeople,
    reportedPaidPeople,
    reportedTotalAmount,
    actualConfirmedAmount:
      transfer.actual_confirmed_amount === null ||
      transfer.actual_confirmed_amount === undefined
        ? null
        : Number(transfer.actual_confirmed_amount),
    additionalAmountDue: 0,
    hasAdditionalSettlement: false,
    status: transfer.status ?? 'sent',
    sentAt: transfer.sent_at ?? null,
  };
}

export async function confirmCampusTransferById(params: {
  transferId: string;
  confirmedBy: string;
  actualConfirmedAmount: number;
}) {
  if (params.transferId.startsWith('empty-')) {
    throw new Error('아직 campus_transfers에 생성된 행이 없습니다. 먼저 송금 완료 처리를 해야 합니다.');
  }

  const normalizedAmount = Math.max(
    0,
    Math.floor(Number(params.actualConfirmedAmount) || 0)
  );

  const { data, error } = await supabase.rpc(
    'confirm_campus_transfer_amount',
    {
      p_transfer_id: params.transferId,
      p_confirmed_by: params.confirmedBy,
      p_actual_confirmed_amount: normalizedAmount,
    }
  );

  if (error) {
    const canFallback =
      error.code === 'PGRST202' ||
      error.code === '42883' ||
      error.message.includes('confirm_campus_transfer_amount');

    if (!canFallback) {
      console.error('Failed to confirm campus transfer:', error);
      throw new Error(error.message);
    }

    const { data: fallbackData, error: fallbackError } = await supabase
      .from('campus_transfers')
      .update({
        status: 'confirmed',
        confirmed_by: params.confirmedBy,
        confirmed_at: new Date().toISOString(),
        actual_confirmed_amount: normalizedAmount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.transferId)
      .select('id, status, actual_confirmed_amount')
      .maybeSingle();

    if (fallbackError) {
      console.error('Failed to confirm campus transfer:', fallbackError);
      throw new Error(fallbackError.message);
    }

    if (!fallbackData) {
      throw new Error('업데이트할 캠퍼스 송금 정보를 찾지 못했습니다. 권한 또는 id 값을 확인해주세요.');
    }

    const fallbackTransfer = fallbackData as Pick<
      CampusTransferMutationRow,
      'id' | 'status' | 'actual_confirmed_amount'
    >;

    return {
      id: fallbackTransfer.id,
      status: fallbackTransfer.status ?? 'confirmed',
      actualConfirmedAmount:
        fallbackTransfer.actual_confirmed_amount === null ||
        fallbackTransfer.actual_confirmed_amount === undefined
          ? normalizedAmount
          : Number(fallbackTransfer.actual_confirmed_amount),
    };
  }

  if (!data) {
    throw new Error('업데이트할 캠퍼스 송금 정보를 찾지 못했습니다. 권한 또는 id 값을 확인해주세요.');
  }

  const transfer = data as CampusTransferMutationRow;

  return {
    id: transfer.id,
    status: transfer.status ?? 'confirmed',
    actualConfirmedAmount:
      transfer.actual_confirmed_amount === null ||
      transfer.actual_confirmed_amount === undefined
        ? normalizedAmount
        : Number(transfer.actual_confirmed_amount),
  };
}

export async function revertCampusTransferConfirmationById(params: {
  transferId: string;
}) {
  if (!params.transferId || params.transferId.startsWith('empty-')) {
    throw new Error(
      '아직 campus_transfers에 생성된 행이 없습니다. 되돌릴 수 없습니다.'
    );
  }

  const { data, error } = await supabase
    .from('campus_transfers')
    .update({
      status: 'sent',
      confirmed_by: null,
      confirmed_at: null,
      actual_confirmed_amount: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.transferId)
    .select('id, status')
    .maybeSingle();

  if (error) {
    console.error('Failed to revert campus transfer confirmation:', error);
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error(
      '되돌릴 캠퍼스 송금 정보를 찾지 못했습니다. 권한 또는 id 값을 확인해주세요.'
    );
  }

  return data;
}

export async function markCampusTransferSent({
  district,
  team,
  campus,
  sentBy,
  totalPeople,
  paidPeople,
  totalAmount,
}: {
  district: string;
  team: string;
  campus: string;
  sentBy: string;
  totalPeople: number;
  paidPeople: number;
  totalAmount: number;
}) {
  const { data, error } = await supabase.rpc('mark_campus_transfer_sent', {
    p_district: district,
    p_team: team,
    p_campus: campus,
    p_total_people: totalPeople,
    p_paid_people: paidPeople,
    p_total_amount: totalAmount,
    p_sent_by: sentBy,
  });

  if (error) {
    console.error('캠퍼스 송금 완료 RPC 실패:', error);
    throw new Error(error.message);
  }

  const transfer = data as CampusTransferMutationRow;

  return {
    id: transfer.id,
    district: transfer.district ?? district,
    team: transfer.team ?? team,
    campus: transfer.campus ?? campus,
    campusAdminName: null,
    campusAdminPhone: null,
    totalPeople,
    paidPeople,
    totalAmount,
    reportedTotalPeople: Number(transfer.total_people ?? totalPeople),
    reportedPaidPeople: Number(transfer.paid_people ?? paidPeople),
    reportedTotalAmount: Number(transfer.total_amount ?? totalAmount),
    actualConfirmedAmount:
      transfer.actual_confirmed_amount === null ||
      transfer.actual_confirmed_amount === undefined
        ? null
        : Number(transfer.actual_confirmed_amount),
    additionalAmountDue: 0,
    hasAdditionalSettlement: false,
    status: transfer.status ?? 'sent',
    sentAt: transfer.sent_at ?? new Date().toISOString(),
  } satisfies CampusTransferStat;
}

// ===== 캠퍼스 문의 게시판 =====

export interface CampusRequest {
  id: string;
  type: CampusRequestType;
  status: CampusRequestStatus;
  title: string;
  content: string;
  adminResponse: string | null;
  isGlobalNotice: boolean;
  district: string;
  team: string;
  campus: string;
  createdBy: string;
  handledBy: string | null;
  handledAt: string | null;
  createdAt: string;
  updatedAt: string;
  messages: CampusRequestMessage[];
}

export interface CampusRequestMessage {
  id: string;
  requestId: string;
  senderId: string;
  senderRole: AdminRoleType;
  message: string;
  createdAt: string;
}

export interface CampusRequestPageResult {
  items: CampusRequest[];
  total: number;
}

export interface CampusRequestPageParams {
  page: number;
  pageSize: number;
  kind?: 'requests' | 'notices';
  status?: CampusRequestStatus | 'all';
  type?: CampusRequestType | 'all';
  search?: string;
}

export interface CampusRequestSummary {
  total: number;
  notices: number;
  unresolved: number;
  open: number;
  inProgress: number;
  resolved: number;
}

const mapCampusRequestMessage = (
  row: CampusRequestMessageRow
): CampusRequestMessage => ({
  id: row.id,
  requestId: row.request_id,
  senderId: row.sender_id,
  senderRole: row.sender_role,
  message: row.message,
  createdAt: row.created_at,
});

const sortCampusRequestMessages = (messages: CampusRequestMessage[]) =>
  [...messages].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

const isMissingGlobalNoticeColumnError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;

  const source = error as Record<string, unknown>;
  const message = String(source.message ?? '');
  const details = String(source.details ?? '');

  return (
    message.includes('is_global_notice') ||
    details.includes('is_global_notice')
  );
};

const isRowLevelSecurityError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;

  const source = error as Record<string, unknown>;
  const message = String(source.message ?? '');
  const code = String(source.code ?? '');

  return code === '42501' || message.includes('row-level security');
};

const getSupabaseErrorMessage = (error: unknown) => {
  if (!error || typeof error !== 'object') return String(error);

  const source = error as Record<string, unknown>;
  const parts = [
    source.code ? `code=${String(source.code)}` : null,
    source.message ? String(source.message) : null,
    source.details ? `details=${String(source.details)}` : null,
    source.hint ? `hint=${String(source.hint)}` : null,
  ].filter(Boolean);

  return parts.join(' / ') || JSON.stringify(source);
};

const mapCampusRequest = (
  row: CampusRequestRow,
  messages: CampusRequestMessage[] = []
): CampusRequest => ({
  id: row.id,
  type: row.type,
  status: row.status,
  title: row.title,
  content: row.content,
  adminResponse: row.admin_response,
  isGlobalNotice: Boolean(row.is_global_notice),
  district: row.district,
  team: row.team,
  campus: row.campus,
  createdBy: row.created_by,
  handledBy: row.handled_by,
  handledAt: row.handled_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  messages: sortCampusRequestMessages(messages),
});

async function getGlobalCampusNoticeRows() {
  const { data, error } = await supabase.rpc('get_global_campus_notices');

  return {
    data: (data ?? []) as CampusRequestRow[],
    error,
  };
}

export async function getCampusRequests(adminRole: AdminRole) {
  const baseQuery = () =>
    supabase
      .from('campus_requests')
      .select('*')
      .order('created_at', { ascending: false });

  let requestRows: CampusRequestRow[];

  if (adminRole.role === 'campus_admin') {
    const [scopedResult, noticeResult] = await Promise.all([
      baseQuery()
        .eq('district', adminRole.district)
        .eq('team', adminRole.team)
        .eq('campus', adminRole.campus)
        .eq('is_global_notice', false),
      getGlobalCampusNoticeRows(),
    ]);

    if (
      isMissingGlobalNoticeColumnError(scopedResult.error) ||
      isMissingGlobalNoticeColumnError(noticeResult.error)
    ) {
      const { data, error } = await baseQuery()
        .eq('district', adminRole.district)
        .eq('team', adminRole.team)
        .eq('campus', adminRole.campus);

      if (error) {
        console.error('캠퍼스 문의 조회 실패:', error);
        throw new Error(error.message);
      }

      requestRows = (data ?? []) as CampusRequestRow[];
    } else {
      if (scopedResult.error) {
        console.error('캠퍼스 문의 조회 실패:', scopedResult.error);
        throw new Error(scopedResult.error.message);
      }

      if (
        'error' in noticeResult &&
        noticeResult.error &&
        !String(noticeResult.error.code ?? '').includes('PGRST202')
      ) {
        console.error('전체 공지 조회 실패:', noticeResult.error);
        throw new Error(noticeResult.error.message);
      }

      const rowMap = new Map<string, CampusRequestRow>();

      [
        ...(scopedResult.data ?? []),
        ...(('error' in noticeResult && noticeResult.error
          ? []
          : noticeResult.data) ?? []),
      ].forEach(
        (request) => {
          rowMap.set(request.id, request as CampusRequestRow);
        }
      );

      requestRows = Array.from(rowMap.values()).sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }
  } else {
    const { data, error } = await baseQuery();

    if (error) {
      console.error('캠퍼스 문의 조회 실패:', error);
      throw new Error(error.message);
    }

    requestRows = (data ?? []) as CampusRequestRow[];
  }

  const requestIds = requestRows.map((request) => request.id);

  if (requestIds.length === 0) {
    return [];
  }

  const { data: messageData, error: messageError } = await supabase
    .from('campus_request_messages')
    .select('*')
    .in('request_id', requestIds)
    .order('created_at', { ascending: true });

  if (messageError) {
    console.error('캠퍼스 문의 메시지 조회 실패:', messageError);
    throw new Error(messageError.message);
  }

  const messagesByRequest = new Map<string, CampusRequestMessage[]>();

  ((messageData ?? []) as CampusRequestMessageRow[]).forEach((messageRow) => {
    const nextMessage = mapCampusRequestMessage(messageRow);
    const currentMessages = messagesByRequest.get(nextMessage.requestId) ?? [];

    messagesByRequest.set(nextMessage.requestId, [
      ...currentMessages,
      nextMessage,
    ]);
  });

  return requestRows.map((request) =>
    mapCampusRequest(request, messagesByRequest.get(request.id) ?? [])
  );
}

export async function getCampusRequestsPage(
  adminRole: AdminRole,
  {
    page,
    pageSize,
    kind = 'requests',
    status = 'all',
    type = 'all',
    search = '',
  }: CampusRequestPageParams
): Promise<CampusRequestPageResult> {
  const from = Math.max(0, page - 1) * pageSize;
  const to = from + pageSize - 1;
  let query = supabase
    .from('campus_requests')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (adminRole.role === 'campus_admin') {
    query = query
      .eq('district', adminRole.district)
      .eq('team', adminRole.team)
      .eq('campus', adminRole.campus)
      .eq('is_global_notice', false);
  } else {
    query = query.eq('is_global_notice', kind === 'notices');
  }

  if (kind === 'requests' && status !== 'all') {
    query = query.eq('status', status);
  }

  if (type !== 'all') {
    query = query.eq('type', type);
  }

  const normalizedSearch = search.trim().replaceAll(',', ' ');
  if (normalizedSearch) {
    const keyword = `%${normalizedSearch}%`;
    query = query.or(
      `title.ilike.${keyword},content.ilike.${keyword},admin_response.ilike.${keyword},district.ilike.${keyword},team.ilike.${keyword},campus.ilike.${keyword}`
    );
  }

  const { data, count, error } = await query;

  if (error) {
    console.error('캠퍼스 문의 페이지 조회 실패:', error);
    throw new Error(error.message);
  }

  const requestRows = (data ?? []) as CampusRequestRow[];
  const requestIds = requestRows.map((request) => request.id);

  if (requestIds.length === 0) {
    return { items: [], total: count ?? 0 };
  }

  const { data: messageData, error: messageError } = await supabase
    .from('campus_request_messages')
    .select('*')
    .in('request_id', requestIds)
    .order('created_at', { ascending: true });

  if (messageError) {
    console.error('캠퍼스 문의 페이지 메시지 조회 실패:', messageError);
    throw new Error(messageError.message);
  }

  const messagesByRequest = new Map<string, CampusRequestMessage[]>();

  ((messageData ?? []) as CampusRequestMessageRow[]).forEach((messageRow) => {
    const nextMessage = mapCampusRequestMessage(messageRow);
    const currentMessages = messagesByRequest.get(nextMessage.requestId) ?? [];
    currentMessages.push(nextMessage);
    messagesByRequest.set(nextMessage.requestId, currentMessages);
  });

  return {
    items: requestRows.map((request) =>
      mapCampusRequest(request, messagesByRequest.get(request.id) ?? [])
    ),
    total: count ?? 0,
  };
}

export async function getCampusRequestSummary(
  adminRole: AdminRole
): Promise<CampusRequestSummary> {
  const countRequests = async (status?: CampusRequestStatus) => {
    let query = supabase
      .from('campus_requests')
      .select('id', { count: 'exact', head: true })
      .eq('is_global_notice', false);

    if (adminRole.role === 'campus_admin') {
      query = query
        .eq('district', adminRole.district)
        .eq('team', adminRole.team)
        .eq('campus', adminRole.campus);
    }

    if (status) query = query.eq('status', status);

    const { count, error } = await query;
    if (error) throw new Error(error.message);
    return count ?? 0;
  };

  const countNotices = async () => {
    const { count, error } = await supabase
      .from('campus_requests')
      .select('id', { count: 'exact', head: true })
      .eq('is_global_notice', true);

    if (error) throw new Error(error.message);
    return count ?? 0;
  };

  const [total, notices, open, inProgress, resolved] = await Promise.all([
    countRequests(),
    countNotices(),
    countRequests('open'),
    countRequests('in_progress'),
    countRequests('resolved'),
  ]);

  return {
    total,
    notices,
    unresolved: Math.max(0, total - resolved),
    open,
    inProgress,
    resolved,
  };
}

export async function getGlobalCampusNotices() {
  const { data, error } = await getGlobalCampusNoticeRows();

  if (error) {
    return { data: null, error };
  }

  return {
    data: (data ?? []).map((row) => mapCampusRequest(row)),
    error: null,
  };
}

export async function createGlobalCampusNotice(params: {
  title: string;
  content: string;
  createdBy: string;
}) {
  const { data, error } = await supabase
    .from('campus_requests')
    .insert({
      type: 'notice',
      status: 'open',
      title: params.title,
      content: params.content,
      is_global_notice: true,
      district: '전체',
      team: '전체',
      campus: '전체',
      created_by: params.createdBy,
    })
    .select('*')
    .single();

  if (error) {
    console.error('전체 공지 작성 실패:', error);
    if (isMissingGlobalNoticeColumnError(error)) {
      throw new Error(
        '전체 공지 기능을 사용하려면 Supabase에 문의 게시판 SQL 업데이트를 먼저 적용해야 합니다.'
      );
    }

    if (isRowLevelSecurityError(error)) {
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'create_global_campus_notice',
        {
          p_title: params.title,
          p_content: params.content,
        }
      );

      if (rpcError) {
        console.error('전체 공지 작성 RPC 실패:', rpcError);
        throw new Error(
          `전체 공지 저장 권한 설정 확인이 필요합니다: ${getSupabaseErrorMessage(rpcError)}`
        );
      }

      return mapCampusRequest(rpcData as CampusRequestRow);
    }

    throw new Error(error.message);
  }

  return mapCampusRequest(data as CampusRequestRow);
}

export async function createCampusRequest(params: {
  type: CampusRequestType;
  title: string;
  content: string;
  district: string;
  team: string;
  campus: string;
  createdBy: string;
}) {
  const { data, error } = await supabase
    .from('campus_requests')
    .insert({
      type: params.type,
      title: params.title,
      content: params.content,
      district: params.district,
      team: params.team,
      campus: params.campus,
      created_by: params.createdBy,
    })
    .select('*')
    .single();

  if (error) {
    console.error('캠퍼스 문의 작성 실패:', error);
    throw new Error(error.message);
  }

  const createdRequest = mapCampusRequest(data as CampusRequestRow);
  const firstMessage = await createCampusRequestMessage({
    requestId: createdRequest.id,
    senderId: params.createdBy,
    senderRole: 'campus_admin',
    message: params.content,
  });

  return {
    ...createdRequest,
    messages: [firstMessage],
  };
}

export async function createCampusRequestMessage(params: {
  requestId: string;
  senderId: string;
  senderRole: AdminRoleType;
  message: string;
}) {
  const { data, error } = await supabase
    .from('campus_request_messages')
    .insert({
      request_id: params.requestId,
      sender_id: params.senderId,
      sender_role: params.senderRole,
      message: params.message.trim(),
    })
    .select('*')
    .single();

  if (error) {
    console.error('罹좏띁??臾몄쓽 硫붿떆吏 ?깅줉 ?ㅽ뙣:', error);
    throw new Error(error.message);
  }

  return mapCampusRequestMessage(data as CampusRequestMessageRow);
}

export async function updateCampusRequestMessage(params: {
  messageId: string;
  message: string;
}) {
  const { data, error } = await supabase
    .from('campus_request_messages')
    .update({
      message: params.message.trim(),
    })
    .eq('id', params.messageId)
    .select('*')
    .single();

  if (error) {
    console.error('캠퍼스 문의 메시지 수정 실패:', error);
    throw new Error(error.message);
  }

  return mapCampusRequestMessage(data as CampusRequestMessageRow);
}

export async function deleteCampusRequestMessage(messageId: string) {
  const { error } = await supabase
    .from('campus_request_messages')
    .delete()
    .eq('id', messageId);

  if (error) {
    console.error('캠퍼스 문의 메시지 삭제 실패:', error);
    throw new Error(error.message);
  }
}

export async function updateCampusRequestStatus(params: {
  requestId: string;
  status: CampusRequestStatus;
  adminResponse: string;
  handledBy: string;
}) {
  const isResolved = params.status === 'resolved';

  const { data, error } = await supabase
    .from('campus_requests')
    .update({
      status: params.status,
      admin_response: params.adminResponse.trim() || null,
      handled_by: params.handledBy,
      handled_at: isResolved ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.requestId)
    .select('*')
    .single();

  if (error) {
    console.error('캠퍼스 문의 처리 실패:', error);
    throw new Error(error.message);
  }

  return mapCampusRequest(data as CampusRequestRow);
}

// ===== 캠퍼스 예약 조회 =====

export async function getCampusReservationsByTeam(campus: string, team?: string) {
  try {
    let query = supabase
      .from('reservations')
      .select(
        'id, user_id, name, phone, district, team, campus, station_preferences, status, confirmed_ticket, created_at'
      )
      .eq('campus', campus);

    if (team) {
      query = query.eq('team', team);
    }

    const { data, error } = await query.order('created_at', {
      ascending: false,
    });

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Failed to get campus reservations:', error);
    throw error;
  }
}

export async function getReservationsWithPaymentByTeamCampus(
  campus: string,
  team?: string
) {
  try {
    let query = supabase
      .from('reservations')
      .select(`
        id,
        user_id,
        name,
        phone,
        district,
        team,
        campus,
        station_preferences,
        status,
        confirmed_ticket,
        created_at,
        updated_at,
        payments (
          id,
          amount,
          status,
          paid_at,
          verified_by,
          verified_at,
          notes,
          created_at,
          updated_at
        )
      `)
      .eq('campus', campus);

    if (team && team.trim()) {
      query = query.eq('team', team.trim());
    }

    const { data, error } = await query.order('created_at', {
      ascending: false,
    });

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Failed to get reservations with payment:', error);
    throw error;
  }
}

// ===== 통계 =====

export async function getDestinationStats() {
  try {
    const { data, error } = await supabase.rpc('get_destination_stats');

    if (error) throw error;

    const stats: Record<
      string,
      { rank1: number; rank2: number; total: number }
    > = {};

    ((data || []) as DestinationStatsRow[]).forEach((row) => {
      stats[row.station_name] = {
        rank1: Number(row.rank1),
        rank2: Number(row.rank2),
        total: Number(row.total),
      };
    });

    return stats;
  } catch (error) {
    console.error('Failed to get destination stats:', error);
    throw error;
  }
}

// ===== 버스 옵션 =====

export async function addBusOption(
  capacity: number,
  estimatedPrice: number,
  notes?: string,
  maxCount = 999
) {
  try {
    const { error } = await supabase.from('bus_options').insert({
      capacity,
      estimated_price: estimatedPrice,
      notes,
      max_count: maxCount,
    });

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('Failed to add bus option:', error);
    throw error;
  }
}

export async function getBusOptions() {
  try {
    const { data, error } = await supabase
      .from('bus_options')
      .select('*')
      .order('capacity', { ascending: false });

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Failed to get bus options:', error);
    throw error;
  }
}

export async function deleteBusOption(id: string) {
  try {
    const { error } = await supabase.from('bus_options').delete().eq('id', id);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('Failed to delete bus option:', error);
    throw error;
  }
}

// ===== 버스 배분 =====

export async function saveBusAllocation(
  allocationName: string,
  allocationData: unknown,
  totalCost: number,
  totalCapacity: number,
  createdBy: string
) {
  try {
    const { error } = await supabase.from('bus_allocations').insert({
      allocation_name: allocationName,
      allocation_data: allocationData,
      total_cost: totalCost,
      total_capacity: totalCapacity,
      created_by: createdBy,
    });

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('Failed to save bus allocation:', error);
    throw error;
  }
}

export async function getBusAllocations() {
  try {
    const { data, error } = await supabase
      .from('bus_allocations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Failed to get bus allocations:', error);
    throw error;
  }
}

export { calculateOptimalBusAllocation } from './admin/busAllocationAlgorithm';
export type {
  BusAllocationCalculateOptions,
  BusAllocationResult,
  BusOptionInput,
  DestinationStats,
} from './admin/busAllocationAlgorithm';

export async function getBusTicketPrice(): Promise<number> {
  const { data, error } = await supabase.rpc('get_bus_ticket_price');

  if (error) {
    console.error('Failed to get bus ticket price:', error);
    throw new Error(error.message);
  }

  return Number(data ?? 0);
}

export async function updateBusTicketPrice(price: number): Promise<number> {
  const normalizedPrice = Math.max(0, Math.floor(Number(price)));

  const { data, error } = await supabase.rpc('update_bus_ticket_price', {
    p_price: normalizedPrice,
  });

  if (error) {
    console.error('Failed to update bus ticket price:', error);
    throw new Error(error.message);
  }

  return Number(data ?? normalizedPrice);
}

export async function getReservationDataResetStats(): Promise<ReservationDataResetStats> {
  const [
    reservations,
    payments,
    campusTransfers,
    busAllocations,
    campusRequests,
    campusRequestMessages,
    stations,
    busOptions,
    appSettings,
    homeAnnouncements,
    campusAdminRoles,
    districts,
    teams,
    campuses,
    userAccounts,
  ] = await Promise.all([
    getTableCount('reservations'),
    getTableCount('payments'),
    getTableCount('campus_transfers'),
    getTableCount('bus_allocations'),
    getTableCount('campus_requests'),
    getTableCount('campus_request_messages'),
    getTableCount('stations'),
    getTableCount('bus_options'),
    getTableCount('app_settings'),
    getTableCount('home_announcements'),
    getCampusAdminRoleCount(),
    getTableCount('districts'),
    getTableCount('teams'),
    getTableCount('campuses'),
    getDeletableUserCount(),
  ]);

  return {
    ...emptyReservationDataResetStats(),
    reservations,
    payments,
    campusTransfers,
    busAllocations,
    campusRequests,
    campusRequestMessages,
    stations,
    busOptions,
    appSettings,
    homeAnnouncements,
    campusAdminRoles,
    organization: districts + teams + campuses,
    userAccounts,
  };
}

export async function resetReservationData(
  options: ReservationDataResetOptions
): Promise<ReservationDataResetStats> {
  const operationOptions = {
    p_reset_reservations: options.reservations,
    p_reset_payments: options.payments,
    p_reset_campus_transfers: options.campusTransfers,
    p_reset_bus_allocations: options.busAllocations,
    p_reset_campus_requests: options.campusRequests,
  };
  const hasSelectedSetupReset =
    options.stations ||
    options.busOptions ||
    options.appSettings ||
    options.homeAnnouncements ||
    options.campusAdminRoles ||
    options.organization ||
    options.userAccounts;
  const isMissingResetRpc = (error: { code?: string; message: string }) =>
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    error.message.includes('schema cache') ||
    error.message.includes('Could not find the function');

  const { data, error } = await supabase.rpc('reset_reservation_data', {
    ...operationOptions,
    p_reset_stations: options.stations,
    p_reset_bus_options: options.busOptions,
    p_reset_app_settings: options.appSettings,
    p_reset_home_announcements: options.homeAnnouncements,
    p_reset_campus_admin_roles: options.campusAdminRoles,
    p_reset_organization: options.organization,
    p_reset_user_accounts: options.userAccounts,
  });

  if (!error) {
    return toReservationDataResetStats(data);
  }

  if (!isMissingResetRpc(error)) {
    console.error('Failed to reset reservation data:', error);
    throw new Error(error.message);
  }

  if (hasSelectedSetupReset) {
    throw new Error(
      '선택한 확장 초기화 항목을 처리하려면 Supabase에 sql/setup/60_reset_reservation_data.sql을 적용해야 합니다.'
    );
  }

  const legacyResult = await supabase.rpc(
    'reset_reservation_data',
    operationOptions
  );

  if (!legacyResult.error) {
    return toReservationDataResetStats(legacyResult.data);
  }

  const resetsAllOperationData = Object.values(operationOptions).every(Boolean);

  if (isMissingResetRpc(legacyResult.error) && resetsAllOperationData) {
    const oldestResult = await supabase.rpc('reset_reservation_data');

    if (!oldestResult.error) {
      return toReservationDataResetStats(oldestResult.data);
    }

    console.error('Failed to reset reservation data:', oldestResult.error);
    throw new Error(oldestResult.error.message);
  }

  console.error('Failed to reset reservation data:', legacyResult.error);
  throw new Error(legacyResult.error.message);
}
