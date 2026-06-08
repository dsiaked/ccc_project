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
  | 'refunded';

export interface PersonalTicketAdminRole {
  id: string;
  user_id: string;
  role: 'global_admin' | 'campus_admin';
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

export interface PersonalTicketPageParams {
  page: number;
  pageSize: number;
  search: string;
  status: string;
  ticket: string;
  adminRole: string;
  campus: string;
}

export interface PersonalTicketPageResult {
  items: PersonalTicketItem[];
  total: number;
  filteredTotal: number;
  summary: PersonalTicketSummary;
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
});

export async function getPersonalTicketPage(
  params: PersonalTicketPageParams
): Promise<PersonalTicketPageResult> {
  const { data, error } = await supabase.rpc('get_admin_personal_ticket_page', {
    p_page: params.page,
    p_page_size: params.pageSize,
    p_search: params.search.trim(),
    p_status: params.status,
    p_ticket: params.ticket,
    p_admin_role: params.adminRole,
    p_campus_issue: 'all',
    p_campus: params.campus,
  });

  if (error) {
    if (
      error.code === 'PGRST202' ||
      error.message.includes('get_admin_personal_ticket_page')
    ) {
      throw new Error(
        '개인 티켓 페이지 조회 DB 함수가 없습니다. Supabase SQL Editor에서 sql/setup/70_admin_personal_ticket_page.sql을 적용해주세요.'
      );
    }

    throw error;
  }

  const response = (data ?? {}) as PersonalTicketRpcResponse;
  const summary = response.summary ?? {};

  return {
    items: (response.items ?? []).map(mapItem),
    total: Number(response.total ?? 0),
    filteredTotal: Number(response.filtered_total ?? 0),
    summary: {
      total: Number(summary.total ?? 0),
      applied: Number(summary.applied ?? 0),
      confirmed: Number(summary.confirmed ?? 0),
      pending: Number(summary.pending ?? 0),
      paid: Number(summary.paid ?? 0),
      cancelled: Number(summary.cancelled ?? 0),
      notApplied: Number(summary.not_applied ?? 0),
    },
    campuses: (response.campuses ?? [])
      .filter(
        (campus): campus is { name: string } => Boolean(campus.name)
      )
      .map((campus) => ({
        name: campus.name,
      })),
  };
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
