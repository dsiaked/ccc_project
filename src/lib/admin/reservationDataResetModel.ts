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

export const emptyReservationDataResetStats = (): ReservationDataResetStats => ({
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

export const toReservationDataResetStats = (
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

export const getOperationResetOptions = (options: ReservationDataResetOptions) => ({
  p_reset_reservations: options.reservations,
  p_reset_payments: options.payments,
  p_reset_campus_transfers: options.campusTransfers,
  p_reset_bus_allocations: options.busAllocations,
  p_reset_campus_requests: options.campusRequests,
});

export const hasSelectedSetupReset = (options: ReservationDataResetOptions) =>
  options.stations ||
  options.busOptions ||
  options.appSettings ||
  options.homeAnnouncements ||
  options.campusAdminRoles ||
  options.organization ||
  options.userAccounts;

export const resetsAllOperationData = (
  operationOptions: ReturnType<typeof getOperationResetOptions>
) => Object.values(operationOptions).every(Boolean);

export const isMissingResetRpc = (error: {
  code?: string;
  message: string;
}) =>
  error.code === 'PGRST202' ||
  error.code === '42883' ||
  error.message.includes('schema cache') ||
  error.message.includes('Could not find the function');
