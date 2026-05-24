import { supabase } from './supabase';

// ===== 공통 타입 =====

export type AdminRoleType = 'global_admin' | 'campus_admin';

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


// ===== 관리자 권한 기본 =====

export async function getAdminRole(userId: string) {
  const { data, error } = await supabase
    .from('admin_roles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Failed to get admin role:', error);
    return null;
  }

  return data as AdminRole | null;
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

  return { success: true };
}

export async function cancelCampusAdmin(adminRoleId: string) {
  const { error } = await supabase
    .from('admin_roles')
    .delete()
    .eq('id', adminRoleId)
    .eq('role', 'campus_admin');

  if (error) throw error;

  return { success: true };
}

// 기존 코드 호환용 함수
export async function assignCampusAdmin(userId: string, campus: string) {
  const { error } = await supabase.from('admin_roles').upsert(
    {
      user_id: userId,
      role: 'campus_admin',
      campus,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: 'user_id',
    }
  );

  if (error) {
    console.error('Failed to assign campus admin:', error);
    throw error;
  }

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

    (data || []).forEach((payment: any) => {
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

  return (data ?? []).map((item: any) => ({
    id: item.id ?? `empty-${item.district}-${item.team}-${item.campus}`,
    district: item.district ?? '',
    team: item.team ?? '',
    campus: item.campus ?? '',
    campusAdminName: item.campus_admin_name ?? null,
    campusAdminPhone: item.campus_admin_phone ?? null,
    totalPeople: Number(item.total_people ?? 0),
    paidPeople: Number(item.paid_people ?? 0),
    totalAmount: Number(item.total_amount ?? 0),
    status: item.status ?? 'pending',
    sentAt: item.sent_at ?? null,
  }));
}

export async function confirmCampusTransferById(params: {
  transferId: string;
  confirmedBy: string;
}) {
  if (params.transferId.startsWith('empty-')) {
    throw new Error('아직 campus_transfers에 생성된 행이 없습니다. 먼저 송금 완료 처리를 해야 합니다.');
  }

  const { data, error } = await supabase
    .from('campus_transfers')
    .update({
      status: 'confirmed',
      confirmed_by: params.confirmedBy,
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.transferId)
    .select('id, status')
    .maybeSingle();

  if (error) {
    console.error('Failed to confirm campus transfer:', error);
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('업데이트할 캠퍼스 송금 정보를 찾지 못했습니다. 권한 또는 id 값을 확인해주세요.');
  }

  return data;
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

  return data;
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
    const { data: reservations, error } = await supabase
      .from('reservations')
      .select('station_preferences, status')
      .eq('status', 'requested');

    if (error) throw error;

    const stats: Record<
      string,
      { rank1: number; rank2: number; rank3: number; total: number }
    > = {};

    (reservations || []).forEach((res: any) => {
      const prefs = res.station_preferences;

      if (!Array.isArray(prefs)) return;

      prefs.forEach((pref: any) => {
        const stationName = pref.station?.name;
        const rank = Number(pref.rank);

        if (!stationName) return;
        if (![1, 2, 3].includes(rank)) return;

        if (!stats[stationName]) {
          stats[stationName] = {
            rank1: 0,
            rank2: 0,
            rank3: 0,
            total: 0,
          };
        }

        const rankKey = `rank${rank}` as 'rank1' | 'rank2' | 'rank3';

        stats[stationName][rankKey] += 1;
        stats[stationName].total += 1;
      });
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
  notes?: string
) {
  try {
    const { error } = await supabase.from('bus_options').insert({
      capacity,
      estimated_price: estimatedPrice,
      notes,
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
  allocationData: any,
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

// ===== 자동 배분 알고리즘 =====

interface BusAllocationResult {
  combination: Array<{ count: number; capacity: number; price: number }>;
  totalCost: number;
  totalCapacity: number;
  totalBuses: number;
  efficiency: number;
}

export function calculateOptimalBusAllocation(
  destinationStats: Record<
    string,
    { rank1: number; rank2: number; rank3: number; total: number }
  >,
  busOptions: Array<{ id: string; capacity: number; estimated_price: number }>
): BusAllocationResult[] {
  const destinations = Object.entries(destinationStats).map(([name, stats]) => ({
    name,
    ...stats,
  }));

  const totalPeople = destinations.reduce((sum, dest) => sum + dest.total, 0);

  const results: BusAllocationResult[] = [];

  function findCombination(
    remaining: number,
    options: typeof busOptions,
    current: BusAllocationResult['combination'] = [],
    totalCost = 0
  ): BusAllocationResult | null {
    if (remaining <= 0) {
      const totalCapacity = current.reduce(
        (sum, bus) => sum + bus.capacity * bus.count,
        0
      );

      return {
        combination: current,
        totalCost,
        totalCapacity,
        totalBuses: current.reduce((sum, bus) => sum + bus.count, 0),
        efficiency: totalCapacity > 0 ? (totalPeople / totalCapacity) * 100 : 0,
      };
    }

    for (const option of options) {
      const count = Math.ceil(remaining / option.capacity);

      if (count > 0) {
        const capacity = option.capacity * count;
        const cost = option.estimated_price * count;

        if (capacity >= remaining) {
          return {
            combination: [
              ...current,
              {
                count,
                capacity: option.capacity,
                price: option.estimated_price,
              },
            ],
            totalCost: totalCost + cost,
            totalCapacity: capacity,
            totalBuses: count,
            efficiency: capacity > 0 ? (totalPeople / capacity) * 100 : 0,
          };
        }
      }
    }

    return null;
  }

  for (const option of busOptions) {
    const result = findCombination(totalPeople, [option]);

    if (result) {
      results.push(result);
    }
  }

  for (let i = 0; i < busOptions.length && results.length < 3; i += 1) {
    for (let j = i; j < busOptions.length; j += 1) {
      const result = findCombination(totalPeople, [busOptions[i], busOptions[j]]);

      if (
        result &&
        !results.find((item) => JSON.stringify(item) === JSON.stringify(result))
      ) {
        results.push(result);
      }
    }
  }

  return results.sort((a, b) => a.totalCost - b.totalCost).slice(0, 3);
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