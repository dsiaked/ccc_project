import { supabase } from '../supabase';
import type {
  ConfirmedTicket,
  ReturnBusReservation,
  StationPreference,
} from '../../types/reservation';

export type PersonalTicketPersonStatus =
  | ReturnBusReservation['status']
  | 'not_applied';
export type PersonalTicketPaymentStatus =
  | 'pending'
  | 'completed'
  | 'refund_required'
  | 'refunded';

export interface PersonalTicketAdminRole {
  id: string;
  user_id: string;
  role: 'global_admin' | 'campus_admin' | 'boarding_manager';
  district: string | null;
  team: string | null;
  campus: string | null;
}

export interface PersonalTicketItem {
  id: string;
  dbId: string | null;
  userId: string;
  email: string | null;
  name: string;
  phone: string;
  district: string;
  team: string;
  campus: string;
  stationPreferences: StationPreference[];
  status: PersonalTicketPersonStatus;
  paymentStatus: PersonalTicketPaymentStatus | null;
  confirmedTicket?: ConfirmedTicket;
  requestedAt: string;
  updatedAt?: string;
  rawData: Partial<ReturnBusReservation> | null;
  hasReservation: boolean;
  adminRoles: PersonalTicketAdminRole[];
  isStaff: boolean;
}

export interface PersonalTicketSummary {
  total: number;
  applied: number;
  confirmed: number;
  pending: number;
  paid: number;
  cancelled: number;
  notApplied: number;
}

export interface PersonalTicketCampus {
  name: string;
}

export interface PersonalTicketDistrict {
  name: string;
}

export interface PersonalTicketPageParams {
  page: number;
  pageSize: number;
  search: string;
  status: string[];
  ticket: string;
  adminRole: string[];
  district: string;
  campus: string;
}

export interface PersonalTicketPageResult {
  items: PersonalTicketItem[];
  total: number;
  filteredTotal: number;
  summary: PersonalTicketSummary;
  districts: PersonalTicketDistrict[];
  campuses: PersonalTicketCampus[];
}

type PersonalTicketRpcItem = {
  id: string;
  db_id: string | null;
  user_id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  district: string | null;
  team: string | null;
  campus: string | null;
  station_preferences: StationPreference[] | null;
  status: PersonalTicketPersonStatus;
  payment_status: PersonalTicketPaymentStatus | null;
  confirmed_ticket: ConfirmedTicket | null;
  requested_at: string | null;
  updated_at: string | null;
  raw_data: Partial<ReturnBusReservation> | null;
  has_reservation: boolean;
  admin_roles: PersonalTicketAdminRole[] | null;
  is_staff: boolean | null;
};

type PersonalTicketRpcResponse = {
  items?: PersonalTicketRpcItem[];
  total?: number;
  filtered_total?: number;
  summary?: {
    total?: number;
    applied?: number;
    confirmed?: number;
    pending?: number;
    paid?: number;
    cancelled?: number;
    not_applied?: number;
  };
  campuses?: Array<{
    name?: string;
  }>;
  districts?: Array<{
    name?: string;
  }>;
};

const emptySummary: PersonalTicketSummary = {
  total: 0,
  applied: 0,
  confirmed: 0,
  pending: 0,
  paid: 0,
  cancelled: 0,
  notApplied: 0,
};

const mapItem = (row: PersonalTicketRpcItem): PersonalTicketItem => ({
  id: row.id,
  dbId: row.db_id,
  userId: row.user_id,
  email: row.email,
  name: row.name ?? '',
  phone: row.phone ?? '',
  district: row.district ?? '',
  team: row.team ?? '',
  campus: row.campus ?? '',
  stationPreferences: row.station_preferences ?? [],
  status: row.status,
  paymentStatus: row.payment_status,
  confirmedTicket: row.confirmed_ticket ?? undefined,
  requestedAt: row.requested_at ?? '',
  updatedAt: row.updated_at ?? undefined,
  rawData: row.raw_data,
  hasReservation: row.has_reservation,
  adminRoles: row.admin_roles ?? [],
  isStaff: row.is_staff ?? false,
});

const mapSummary = (
  summary: PersonalTicketRpcResponse['summary']
): PersonalTicketSummary => ({
  total: Number(summary?.total ?? 0),
  applied: Number(summary?.applied ?? 0),
  confirmed: Number(summary?.confirmed ?? 0),
  pending: Number(summary?.pending ?? 0),
  paid: Number(summary?.paid ?? 0),
  cancelled: Number(summary?.cancelled ?? 0),
  notApplied: Number(summary?.not_applied ?? 0),
});

const mapNamedOptions = (options?: Array<{ name?: string }>) =>
  (options ?? [])
    .filter((option): option is { name: string } => Boolean(option.name))
    .map((option) => ({ name: option.name }));

const isMissingPersonalTicketRpcSignature = (error: {
  code?: string;
  message?: string;
}) =>
  error.code === 'PGRST202' ||
  Boolean(error.message?.includes('get_admin_personal_ticket_page'));

let personalTicketRpcVersion: 'current' | 'legacy' | null = null;

const matchesLegacyFilters = (
  item: PersonalTicketItem,
  params: PersonalTicketPageParams
) => {
  const matchesStatus =
    params.status.length === 0 || params.status.includes(item.status);
  const matchesAdminRole =
    params.adminRole.length === 0 ||
    (params.adminRole.includes('general') && item.adminRoles.length === 0) ||
    item.adminRoles.some((role) => params.adminRole.includes(role.role));
  const matchesDistrict =
    params.district === 'all' ||
    (params.district === 'outside_seoul'
      ? Boolean(item.district) && item.district !== '서울지구'
      : item.district === params.district);

  return matchesStatus && matchesAdminRole && matchesDistrict;
};

async function getLegacyCompatiblePersonalTicketPage(
  params: PersonalTicketPageParams
): Promise<PersonalTicketPageResult> {
  const pageSize = 100;
  const items: PersonalTicketItem[] = [];
  let page = 1;
  let total = 0;
  let summary = emptySummary;
  let campuses: PersonalTicketCampus[] = [];

  while (true) {
    const { data, error } = await supabase.rpc('get_admin_personal_ticket_page', {
      p_page: page,
      p_page_size: pageSize,
      p_search: params.search.trim(),
      p_status: 'all',
      p_ticket: params.ticket,
      p_admin_role: 'all',
      p_campus_issue: 'all',
      p_campus: params.campus,
    });

    if (error) throw error;

    const response = (data ?? {}) as PersonalTicketRpcResponse;
    const responseItems = (response.items ?? []).map(mapItem);
    if (responseItems.length === 0) break;

    items.push(...responseItems);
    total = Number(response.total ?? 0);
    summary = mapSummary(response.summary);
    campuses = mapNamedOptions(response.campuses);
    if (items.length >= Number(response.filtered_total ?? items.length)) break;

    page += 1;
  }

  const filteredItems = items.filter((item) =>
    matchesLegacyFilters(item, params)
  );
  const offset = (params.page - 1) * params.pageSize;
  const districts = Array.from(
    new Set(items.map((item) => item.district).filter(Boolean))
  )
    .sort((left, right) => left.localeCompare(right, 'ko'))
    .map((name) => ({ name }));

  return {
    items: filteredItems.slice(offset, offset + params.pageSize),
    total,
    filteredTotal: filteredItems.length,
    summary,
    districts,
    campuses,
  };
}

async function getCurrentPersonalTicketPage(
  params: PersonalTicketPageParams
): Promise<PersonalTicketPageResult> {
  const { data, error } = await supabase.rpc('get_admin_personal_ticket_page', {
    p_page: params.page,
    p_page_size: params.pageSize,
    p_search: params.search.trim(),
    p_status: params.status.join(',') || 'all',
    p_ticket: params.ticket,
    p_admin_role: params.adminRole.join(',') || 'all',
    p_campus_issue: 'all',
    p_campus: params.campus,
    p_district: params.district,
  });

  if (error) {
    throw error;
  }

  const response = (data ?? {}) as PersonalTicketRpcResponse;

  return {
    items: (response.items ?? []).map(mapItem),
    total: Number(response.total ?? 0),
    filteredTotal: Number(response.filtered_total ?? 0),
    summary: mapSummary(response.summary),
    districts: mapNamedOptions(response.districts),
    campuses: mapNamedOptions(response.campuses),
  };
}

export async function getPersonalTicketPage(
  params: PersonalTicketPageParams
): Promise<PersonalTicketPageResult> {
  if (personalTicketRpcVersion !== 'current') {
    try {
      const result = await getLegacyCompatiblePersonalTicketPage(params);
      personalTicketRpcVersion = 'legacy';
      return result;
    } catch (error) {
      if (!isMissingPersonalTicketRpcSignature(error as { message?: string })) {
        throw error;
      }

      personalTicketRpcVersion = 'current';
    }
  }

  try {
    return await getCurrentPersonalTicketPage(params);
  } catch (error) {
    if (!isMissingPersonalTicketRpcSignature(error as { message?: string })) {
      throw error;
    }

    personalTicketRpcVersion = 'legacy';

    try {
      return await getLegacyCompatiblePersonalTicketPage(params);
    } catch (legacyError) {
      if (
        isMissingPersonalTicketRpcSignature(
          legacyError as { message?: string }
        )
      ) {
        throw new Error(
          '개인 버스표 페이지 조회 DB 함수가 없습니다. Supabase SQL Editor에서 sql/setup/130_personal_ticket_district_filter.sql을 적용해주세요.',
          { cause: legacyError }
        );
      }

      throw legacyError;
    }
  }
}

export async function getCampusAdminRoleForScope(params: {
  district: string;
  team: string;
  campus: string;
  excludeUserId?: string;
}) {
  let query = supabase
    .from('admin_roles')
    .select('id, user_id, role, district, team, campus')
    .eq('role', 'campus_admin')
    .eq('district', params.district)
    .eq('team', params.team)
    .eq('campus', params.campus);

  if (params.excludeUserId) {
    query = query.neq('user_id', params.excludeUserId);
  }

  const { data, error } = await query.limit(1).maybeSingle();

  if (error) throw error;

  return (data ?? null) as PersonalTicketAdminRole | null;
}
