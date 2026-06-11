import { supabase } from './supabase';
import type { ConfirmedTicket, ReturnBusReservation } from '../types/reservation';

// ===== 공통 타입 =====

export const campusRequestReadEventName = 'campus-request-read';

export type AdminRoleType = 'global_admin' | 'campus_admin' | 'boarding_manager';
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
  campus_id: string | null;
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
  managedCampuses?: Array<{
    id: string;
    district: string | null;
    team: string | null;
    campus: string | null;
  }>;
}

export interface SelectOption {
  id: string;
  name: string;
}

export interface AdminCampusScope {
  campusId: string;
  district: string;
  team: string;
  campus: string;
}

export interface CampusAdminAssignment extends AdminCampusScope {
  adminRoleId: string;
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
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
  query?: string;
  page?: number;
  pageSize?: number;
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

export type AdminCreateUserInput = {
  email: string;
  password: string;
  name: string;
  phone: string;
  organizationMode: 'registered' | 'external';
  districtId?: string;
  teamId?: string;
  campusId?: string;
  district?: string;
  team?: string;
  campus?: string;
  coordinatorName?: string;
  coordinatorPhone?: string;
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
  is_archived?: boolean | null;
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

type AtomicCampusRequestMutationRow = {
  request: CampusRequestRow;
  message: CampusRequestMessageRow | null;
};

type CampusRequestAuditLogRow = {
  id: string;
  request_id: string;
  message_id: string | null;
  actor_id: string | null;
  action: CampusRequestAuditAction;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
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
const ACTIVE_ADMIN_ROLE_KEY = 'ccc-bus-active-admin-role';
const adminRoleCache = new Map<
  string,
  { value: AdminRole[]; expiresAt: number }
>();
const adminRoleRequests = new Map<string, Promise<AdminRole[]>>();

const getActiveCampusAdminRoleStorageKey = (userId: string) =>
  `${ACTIVE_ADMIN_ROLE_KEY}:${userId}`;

const getStoredActiveCampusAdminRoleId = (userId: string) => {
  if (typeof window === 'undefined') return null;

  return window.localStorage.getItem(getActiveCampusAdminRoleStorageKey(userId));
};

const invalidateAdminRoleCache = (userId?: string) => {
  if (userId) {
    adminRoleCache.delete(userId);
    adminRoleRequests.delete(userId);
    return;
  }

  adminRoleCache.clear();
  adminRoleRequests.clear();
};

export const clearAdminRoleCache = (userId?: string) => {
  invalidateAdminRoleCache(userId);
};

export async function getAdminRoles(userId: string) {
  const cached = adminRoleCache.get(userId);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const pendingRequest = adminRoleRequests.get(userId);

  if (pendingRequest) {
    return pendingRequest;
  }

  const request = (async () => {
    const rpcResult = await supabase.rpc('get_my_admin_roles');
    let roles = ((rpcResult.data ?? []) as AdminRole[]).filter(
      (role) => role.user_id === userId
    );

    if (rpcResult.error || roles.length === 0) {
      const directResult = await supabase
        .from('admin_roles')
        .select('*')
        .eq('user_id', userId)
        .order('role', { ascending: false })
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false, nullsFirst: false });

      if (directResult.error) {
        if (rpcResult.error) throw rpcResult.error;
        throw directResult.error;
      }

      roles = (directResult.data ?? []) as AdminRole[];
    }

    adminRoleCache.set(userId, {
      value: roles,
      expiresAt: Date.now() + ADMIN_ROLE_CACHE_TTL_MS,
    });

    return roles;
  })();

  adminRoleRequests.set(userId, request);

  try {
    return await request;
  } finally {
    adminRoleRequests.delete(userId);
  }
}

export async function getAdminRole(userId: string) {
  const roles = await getAdminRoles(userId);
  const globalAdminRole = roles.find((item) => item.role === 'global_admin');

  if (globalAdminRole) return globalAdminRole;

  const activeRoleId = getStoredActiveCampusAdminRoleId(userId);
  const storedRole = roles.find((item) => item.id === activeRoleId);
  if (storedRole) return storedRole;

  const boardingManagerRole = roles.find(
    (item) => item.role === 'boarding_manager'
  );
  if (boardingManagerRole) return boardingManagerRole;

  const campusAdminRoles = roles.filter(
    (item) => item.role === 'campus_admin'
  );

  return campusAdminRoles[0] || null;
}

export async function setActiveAdminRole(userId: string, roleId: string) {
  const roles = await getAdminRoles(userId);
  const targetRole = roles.find(
    (item) => item.id === roleId && item.role !== 'global_admin'
  );

  if (!targetRole) {
    throw new Error('선택한 관리자 권한을 찾을 수 없습니다.');
  }

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(
      getActiveCampusAdminRoleStorageKey(userId),
      targetRole.id
    );
  }

  return targetRole;
}

export async function setActiveCampusAdminRole(userId: string, roleId: string) {
  return setActiveAdminRole(userId, roleId);
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

export async function getCampusScopesForAdmin(): Promise<AdminCampusScope[]> {
  const { data, error } = await supabase
    .from('campus_options')
    .select('campus_id, district, team, campus')
    .order('district', { ascending: true })
    .order('team', { ascending: true })
    .order('campus', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((item) => ({
    campusId: item.campus_id,
    district: item.district,
    team: item.team,
    campus: item.campus,
  }));
}

export async function getCampusAdminAssignments(): Promise<
  CampusAdminAssignment[]
> {
  const { data: roles, error: roleError } = await supabase
    .from('admin_roles')
    .select('id, user_id, campus_id, district, team, campus')
    .eq('role', 'campus_admin');

  if (roleError) throw roleError;
  if (!roles || roles.length === 0) return [];

  const userIds = [...new Set(roles.map((role) => role.user_id))];
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, name, email, phone')
    .in('id', userIds);

  if (profileError) throw profileError;

  const profileMap = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile])
  );

  return roles.map((role) => {
    const profile = profileMap.get(role.user_id);
    return {
      campusId: role.campus_id ?? '',
      district: role.district ?? '',
      team: role.team ?? '',
      campus: role.campus ?? '',
      adminRoleId: role.id,
      userId: role.user_id,
      name: profile?.name || '이름 없음',
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
    };
  });
}

export async function deleteUserAccountForAdmin(userId: string) {
  const { data, error } = await supabase.rpc('delete_user_account_as_admin', {
    p_user_id: userId,
  });

  if (error) {
    if (
      error.code === 'PGRST202' ||
      error.message.includes('delete_user_account_as_admin')
    ) {
      throw new Error(
        '사용자 삭제 DB 함수가 설치되지 않았습니다. Supabase SQL Editor에서 sql/setup/63_admin_delete_user_account.sql을 실행해주세요.'
      );
    }

    const deletionErrorMessages: Record<string, string> = {
      'Only global admins can delete user accounts.':
        '전체 관리자 권한이 있어야 사용자 계정을 삭제할 수 있습니다.',
      'A user ID is required.': '삭제할 사용자 ID가 필요합니다.',
      'The currently signed-in account cannot be deleted.':
        '현재 로그인한 계정은 삭제할 수 없습니다.',
      'Global admin accounts cannot be deleted.':
        '전체 관리자 계정은 삭제할 수 없습니다. 먼저 전체 관리자 권한을 해제해주세요.',
    };
    const translatedMessage = deletionErrorMessages[error.message];
    if (translatedMessage) throw new Error(translatedMessage);

    throw error;
  }

  invalidateAdminRoleCache(userId);
  return Boolean(data);
}

export async function createUserAccountForAdmin(input: AdminCreateUserInput) {
  const { data, error } = await supabase.functions.invoke('admin-user-manager', {
    body: {
      action: 'create',
      ...input,
    },
  });

  if (error) {
    let message = error.message;
    const context = (error as { context?: Response }).context;

    if (context) {
      const responseBody = await context.clone().json().catch(() => null);
      if (responseBody?.error) {
        message = String(responseBody.error);
      }
    }

    throw new Error(
      message ||
        '사용자 추가 서버 함수 호출에 실패했습니다. admin-user-manager Edge Function 배포 상태를 확인해주세요.'
    );
  }

  if (data?.error) {
    throw new Error(String(data.error));
  }

  if (!data?.userId) {
    throw new Error('생성된 사용자 정보를 확인할 수 없습니다.');
  }

  return data as { userId: string; email: string };
}

export async function searchUsersForCampusManager({
  district,
  team,
  campus,
  query,
  page = 1,
  pageSize = 50,
}: CampusManagerSearchParams) {
  const normalizedPage = Math.max(1, Math.floor(page));
  const normalizedPageSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
  const { data, error } = await supabase.rpc(
    'get_campus_admin_manage_users_page',
    {
      p_district: district ?? null,
      p_team: team ?? null,
      p_campus: campus ?? null,
      p_query: query?.trim() || null,
      p_limit: normalizedPageSize,
      p_offset: (normalizedPage - 1) * normalizedPageSize,
    }
  );

  if (error) {
    if (error.code === 'PGRST202') {
      throw new Error(
        '캠퍼스 회계 순장님 검색 DB 함수가 설치되지 않았습니다. sql/setup/75_campus_admin_manage_users_page.sql을 적용해주세요.'
      );
    }

    throw error;
  }

  const rows = (data ?? []) as Array<{
    user_id: string;
    email: string | null;
    name: string | null;
    phone: string | null;
    district: string | null;
    team: string | null;
    campus: string | null;
    role: AdminRoleType | null;
    admin_role_id: string | null;
    managed_campuses: AdminUserSearchResult['managedCampuses'];
    total_count: number | string | null;
  }>;

  return {
    users: rows.map((row) => ({
      userId: row.user_id,
      email: row.email,
      name: row.name || '이름 없음',
      phone: row.phone,
      district: row.district,
      team: row.team,
      campus: row.campus,
      role: row.role,
      adminRoleId: row.admin_role_id,
      managedCampuses: row.managed_campuses ?? [],
    })),
    totalCount: Number(rows[0]?.total_count ?? 0),
    page: normalizedPage,
    pageSize: normalizedPageSize,
  };
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
    같은 지구/팀/캠퍼스에 이미 캠퍼스 회계 순장님이 있으면 먼저 제거합니다.
    그래서 기존 관리자가 등록되어 있어도 새 관리자로 변경할 수 있습니다.
  */
  const { error } = await supabase.rpc('assign_campus_admin_as_global_admin', {
    p_user_id: userId,
    p_district: district,
    p_team: team,
    p_campus: campus,
  });

  if (error) throw error;

  invalidateAdminRoleCache();

  return { success: true };
}

export async function cancelCampusAdmin(adminRoleId: string) {
  const { error } = await supabase.rpc('cancel_campus_admin_as_global_admin', {
    p_admin_role_id: adminRoleId,
  });

  if (error) throw error;

  invalidateAdminRoleCache();

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

export async function updatePersonalTicketAsAdmin(
  reservationId: string,
  nextStatus: 'requested' | 'confirmed' | 'cancelled',
  ticket: ConfirmedTicket | null = null
) {
  const { data, error } = await supabase
    .rpc('update_personal_ticket_as_admin', {
      p_reservation_id: reservationId,
      p_next_status: nextStatus,
      p_ticket: ticket,
    })
    .single();

  if (error) {
    if (
      error.code === 'PGRST202' ||
      error.message.includes('update_personal_ticket_as_admin')
    ) {
      throw new Error(
        '개인 버스표 관리 DB 함수가 설치되지 않았습니다. sql/setup/66_atomic_admin_personal_ticket.sql을 적용해주세요.'
      );
    }

    const messages: Record<string, string> = {
      'Only global admins can manage personal tickets.':
        '전체 관리자 권한이 있어야 개인 버스표를 관리할 수 있습니다.',
      'Reservation not found.': '신청 정보를 찾을 수 없습니다.',
      'A valid bus and seat number are required.':
        '확정 배차안에 있는 버스와 올바른 좌석번호를 입력해주세요.',
      'The selected bus does not exist in the confirmed allocation.':
        '선택한 버스가 현재 확정 배차안에 없습니다.',
      'The selected bus name is duplicated in confirmed allocations.':
        '확정 배차안에 같은 버스 이름이 중복되어 있습니다.',
      'The selected seat number exceeds the bus capacity.':
        '선택한 좌석번호가 버스 정원을 초과합니다.',
      'The selected seat number is already assigned.':
        '선택한 좌석은 이미 다른 탑승자에게 배정되었습니다.',
    };
    throw new Error(messages[error.message] ?? error.message);
  }

  return data as {
    status: ReturnBusReservation['status'];
    confirmed_ticket: ConfirmedTicket | null;
    data: ReturnBusReservation;
    updated_at: string;
  };
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

    const { data: fallbackData, error: fallbackError } = await supabase.rpc(
      'confirm_campus_transfer_amount',
      {
        p_transfer_id: params.transferId,
        p_confirmed_by: params.confirmedBy,
        p_actual_confirmed_amount: normalizedAmount,
      }
    );

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

  const { data, error } = await supabase.rpc(
    'revert_campus_transfer_confirmation_as_global_admin',
    { p_transfer_id: params.transferId }
  );

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

export async function cancelCampusTransferReport(params: {
  transferId: string;
}) {
  if (!params.transferId || params.transferId.startsWith('empty-')) {
    throw new Error('취소할 캠퍼스 송금 보고를 찾지 못했습니다.');
  }

  const { data, error } = await supabase.rpc('cancel_campus_transfer_report', {
    p_transfer_id: params.transferId,
  });

  if (error) {
    console.error('캠퍼스 송금 보고 완료 취소 실패:', error);
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('취소할 캠퍼스 송금 보고를 찾지 못했습니다.');
  }

  return data;
}

export interface CampusRequest {
  id: string;
  type: CampusRequestType;
  status: CampusRequestStatus;
  title: string;
  content: string;
  adminResponse: string | null;
  isGlobalNotice: boolean;
  isArchived: boolean;
  noticeTargets: CampusNoticeTarget[];
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

export interface CampusNoticeTarget {
  district: string;
  team: string;
  campus: string;
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
  onHold: number;
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
  [...messages].sort((a, b) => {
    const createdAtDifference =
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();

    return createdAtDifference || a.id.localeCompare(b.id);
  });

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
  messages: CampusRequestMessage[] = [],
  noticeTargets: CampusNoticeTarget[] = []
): CampusRequest => ({
  id: row.id,
  type: row.type,
  status: row.status,
  title: row.title,
  content: row.content,
  adminResponse: row.admin_response,
  isGlobalNotice: Boolean(row.is_global_notice),
  isArchived: Boolean(row.is_archived),
  noticeTargets,
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

async function getCampusNoticeTargets(noticeIds: string[]) {
  const targetsByNotice = new Map<string, CampusNoticeTarget[]>();
  if (noticeIds.length === 0) return targetsByNotice;

  const { data, error } = await supabase
    .from('campus_notice_targets')
    .select('notice_id, district, team, campus')
    .in('notice_id', noticeIds);

  if (error) throw new Error(error.message);

  (
    (data ?? []) as Array<CampusNoticeTarget & { notice_id: string }>
  ).forEach(({ notice_id, district, team, campus }) => {
    const current = targetsByNotice.get(notice_id) ?? [];
    current.push({ district, team, campus });
    targetsByNotice.set(notice_id, current);
  });

  return targetsByNotice;
}

export type CampusRequestAuditAction =
  | 'status_changed'
  | 'response_changed'
  | 'message_updated'
  | 'message_deleted';

export interface CampusRequestAuditLog {
  id: string;
  requestId: string;
  messageId: string | null;
  actorId: string | null;
  action: CampusRequestAuditAction;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  createdAt: string;
}

async function getGlobalCampusNoticeRows() {
  const { data, error } = await supabase.rpc('get_global_campus_notices');

  return {
    data: (data ?? []) as CampusRequestRow[],
    error,
  };
}

async function getCampusRequestIdsMatchingMessages(search: string) {
  const requestIds = new Set<string>();
  const pageSize = 1000;
  let cursor: { created_at: string; id: string } | null = null;

  while (true) {
    let query = supabase
      .from('campus_request_messages')
      .select('id, request_id, created_at')
      .ilike('message', `%${search}%`)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(pageSize);

    if (cursor) {
      query = query.or(
        `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
      );
    }

    const { data, error } = await query;

    if (error) throw new Error(error.message);

    const rows = (data ?? []) as Array<{
      id: string;
      request_id: string;
      created_at: string;
    }>;
    rows.forEach((row) => requestIds.add(row.request_id));

    if (rows.length < pageSize) break;
    cursor = rows[rows.length - 1];
  }

  return [...requestIds];
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
    .order('id', { ascending: false })
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
    const matchingMessageRequestIds =
      await getCampusRequestIdsMatchingMessages(normalizedSearch);
    const searchFilters = [
      `title.ilike.${keyword}`,
      `content.ilike.${keyword}`,
      `admin_response.ilike.${keyword}`,
      `district.ilike.${keyword}`,
      `team.ilike.${keyword}`,
      `campus.ilike.${keyword}`,
    ];

    if (matchingMessageRequestIds.length > 0) {
      searchFilters.push(`id.in.(${matchingMessageRequestIds.join(',')})`);
    }

    query = query.or(searchFilters.join(','));
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

  const [{ data: messageData, error: messageError }, targetsByNotice] =
    await Promise.all([
      supabase
        .from('campus_request_messages')
        .select('*')
        .in('request_id', requestIds)
        .order('created_at', { ascending: true }),
      getCampusNoticeTargets(
        requestRows
          .filter((request) => request.is_global_notice)
          .map((request) => request.id)
      ),
    ]);

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
      mapCampusRequest(
        request,
        messagesByRequest.get(request.id) ?? [],
        targetsByNotice.get(request.id) ?? []
      )
    ),
    total: count ?? 0,
  };
}

export async function getCampusRequestSummary(): Promise<CampusRequestSummary> {
  const { data, error } = await supabase.rpc('get_campus_request_summary');
  if (error) throw new Error(error.message);

  const [row] = (data ?? []) as Array<{
    total: number;
    notices: number;
    open: number;
    in_progress: number;
    resolved: number;
    on_hold: number;
  }>;
  const total = Number(row?.total ?? 0);
  const resolved = Number(row?.resolved ?? 0);

  return {
    total,
    notices: Number(row?.notices ?? 0),
    unresolved: Math.max(0, total - resolved),
    open: Number(row?.open ?? 0),
    inProgress: Number(row?.in_progress ?? 0),
    resolved,
    onHold: Number(row?.on_hold ?? 0),
  };
}

export async function getUnreadCampusRequestIds() {
  const { data, error } = await supabase.rpc('get_unread_campus_request_ids');

  if (error) throw new Error(error.message);
  return new Set((data ?? []) as string[]);
}

export async function markCampusRequestRead(requestId: string) {
  const { error } = await supabase.rpc('mark_campus_request_read', {
    p_request_id: requestId,
  });

  if (error) throw new Error(error.message);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(campusRequestReadEventName));
  }
}

export async function getCampusRequestAuditLogs(requestId: string) {
  const { data, error } = await supabase
    .from('campus_request_audit_logs')
    .select('*')
    .eq('request_id', requestId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);

  return ((data ?? []) as CampusRequestAuditLogRow[]).map((row) => ({
    id: row.id,
    requestId: row.request_id,
    messageId: row.message_id,
    actorId: row.actor_id,
    action: row.action,
    beforeData: row.before_data,
    afterData: row.after_data,
    createdAt: row.created_at,
  })) satisfies CampusRequestAuditLog[];
}

export async function getGlobalCampusNotices() {
  const { data, error } = await getGlobalCampusNoticeRows();

  if (error) {
    return { data: null, error };
  }

  const rows = data ?? [];
  const targetsByNotice = await getCampusNoticeTargets(
    rows.map((row) => row.id)
  );

  return {
    data: rows.map((row) =>
      mapCampusRequest(row, [], targetsByNotice.get(row.id) ?? [])
    ),
    error: null,
  };
}

async function createLegacyGlobalCampusNotice(params: {
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

export async function createGlobalCampusNotice(params: {
  title: string;
  content: string;
  createdBy: string;
  targets: CampusNoticeTarget[];
}) {
  const { data, error } = await supabase.rpc('create_targeted_campus_notice', {
    p_title: params.title,
    p_content: params.content,
    p_targets: params.targets,
  });

  if (error) {
    if (String(error.message).includes('create_targeted_campus_notice')) {
      return createLegacyGlobalCampusNotice(params);
    }
    throw new Error(error.message);
  }

  return mapCampusRequest(data as CampusRequestRow, [], params.targets);
}

export async function updateGlobalCampusNotice(params: {
  noticeId: string;
  title: string;
  content: string;
  targets: CampusNoticeTarget[];
  archived: boolean;
}) {
  const { data, error } = await supabase.rpc('update_targeted_campus_notice', {
    p_notice_id: params.noticeId,
    p_title: params.title,
    p_content: params.content,
    p_targets: params.targets,
    p_archived: params.archived,
  });

  if (error) throw new Error(error.message);
  return mapCampusRequest(data as CampusRequestRow, [], params.targets);
}

export async function createCampusRequest(params: {
  type: CampusRequestType;
  title: string;
  content: string;
  district: string;
  team: string;
  campus: string;
}) {
  const { data, error } = await supabase.rpc(
    'create_campus_request_with_message',
    {
      p_type: params.type,
      p_title: params.title,
      p_content: params.content,
      p_district: params.district,
      p_team: params.team,
      p_campus: params.campus,
    }
  );

  if (error) {
    console.error('캠퍼스 문의 작성 실패:', error);
    throw new Error(error.message);
  }

  const result = data as AtomicCampusRequestMutationRow;
  const messages = result.message
    ? [mapCampusRequestMessage(result.message)]
    : [];

  return mapCampusRequest(result.request, messages);
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
    console.error('캠퍼스 문의 메시지 등록 실패:', error);
    throw new Error(error.message);
  }

  return mapCampusRequestMessage(data as CampusRequestMessageRow);
}

async function assertCampusRequestMessageIsEditable(messageId: string) {
  const { data: targetMessage, error: targetError } = await supabase
    .from('campus_request_messages')
    .select('request_id')
    .eq('id', messageId)
    .single();

  if (targetError) throw new Error(targetError.message);

  const { data: firstMessage, error: firstMessageError } = await supabase
    .from('campus_request_messages')
    .select('id')
    .eq('request_id', (targetMessage as { request_id: string }).request_id)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .single();

  if (firstMessageError) throw new Error(firstMessageError.message);

  if ((firstMessage as { id: string }).id === messageId) {
    throw new Error('최초 문의 내용은 수정하거나 삭제할 수 없습니다.');
  }
}

export async function updateCampusRequestMessage(params: {
  messageId: string;
  message: string;
}) {
  await assertCampusRequestMessageIsEditable(params.messageId);

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
  await assertCampusRequestMessageIsEditable(messageId);

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
}) {
  const { data, error } = await supabase.rpc(
    'update_campus_request_status_with_response',
    {
      p_request_id: params.requestId,
      p_status: params.status,
      p_admin_response: params.adminResponse,
    }
  );

  if (error) {
    console.error('캠퍼스 문의 처리 실패:', error);
    throw new Error(error.message);
  }

  const result = data as AtomicCampusRequestMutationRow;

  return {
    request: mapCampusRequest(result.request),
    message: result.message ? mapCampusRequestMessage(result.message) : null,
  };
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
      .eq('campus', campus)
      .neq('status', 'cancelled');

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
    const { error } = await supabase.rpc('upsert_bus_option_as_global_admin', {
      p_id: null,
      p_capacity: capacity,
      p_estimated_price: estimatedPrice,
      p_notes: notes ?? null,
      p_max_count: maxCount,
    });

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('Failed to add bus option:', error);
    throw error;
  }
}

export async function updateBusOption(
  id: string,
  capacity: number,
  estimatedPrice: number,
  notes?: string | null,
  maxCount = 999
) {
  const { error } = await supabase.rpc('upsert_bus_option_as_global_admin', {
    p_id: id,
    p_capacity: capacity,
    p_estimated_price: estimatedPrice,
    p_notes: notes ?? null,
    p_max_count: maxCount,
  });

  if (error) throw error;
  return { success: true };
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
    const { error } = await supabase.rpc('delete_bus_option_as_global_admin', {
      p_id: id,
    });

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
  allocationData: unknown
) {
  try {
    const { error } = await supabase.rpc('create_bus_allocation_as_global_admin', {
      p_allocation_name: allocationName,
      p_allocation_data: allocationData,
    });

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('Failed to save bus allocation:', error);
    throw error;
  }
}

export async function getLatestConfirmedBusAllocation() {
  try {
    const { data, error } = await supabase
      .from('bus_allocations')
      .select(
        'id, allocation_name, allocation_data, total_cost, total_capacity, created_at, updated_at'
      )
      .filter('allocation_data->>status', 'eq', 'confirmed')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Failed to get latest confirmed bus allocation:', error);
    throw error;
  }
}

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
