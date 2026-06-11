import { supabase } from '../supabase';
import {
  emptyReservationDataResetStats,
  getOperationResetOptions,
  hasSelectedSetupReset,
  isMissingResetRpc,
  resetsAllOperationData,
  toReservationDataResetStats,
} from './reservationDataResetModel';
import type {
  ReservationDataResetOptions,
  ReservationDataResetStats,
} from './reservationDataResetModel';

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
  const operationOptions = getOperationResetOptions(options);
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

  if (hasSelectedSetupReset(options)) {
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

  if (
    isMissingResetRpc(legacyResult.error) &&
    resetsAllOperationData(operationOptions)
  ) {
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
