export interface ReservationDataResetStats {
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
}

export interface ReservationDataResetOptions {
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
}

export interface CampusOptionRow {
  campus_id: string | null;
  district: string | null;
  team: string | null;
  campus: string | null;
}

export interface CampusAdminRoleRow {
  district: string | null;
  team: string | null;
  campus: string | null;
}

export interface CampusSetupRow {
  key: string;
  campusId: string;
  district: string;
  team: string;
  campus: string;
  target: number;
  hasAdmin: boolean;
}

export interface StationSetupRow {
  id: string;
  name: string;
  line: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  is_active: boolean;
}

export interface NewStationDraft {
  name: string;
  line: string;
  address: string;
}

export interface NewCampusDraft {
  district: string;
  team: string;
  campus: string;
}

export interface BusOptionRow {
  id: string;
  capacity: number;
  estimated_price: number;
  max_count?: number | null;
  notes?: string | null;
}

export interface BusOptionDraft {
  capacity: string;
  estimatedPrice: string;
  maxCount: string;
  notes: string;
}

export type SetupDetailId =
  | 'organization'
  | 'campus-payment-accounts'
  | 'campus-admins'
  | 'destinations'
  | 'bus-options';

export const RESET_CONFIRM_TEXT = '신청정보 초기화';

export const emptyNewStationDraft: NewStationDraft = {
  name: '',
  line: '',
  address: '',
};

export const emptyNewCampusDraft: NewCampusDraft = {
  district: '',
  team: '',
  campus: '',
};

export const emptyBusOptionDraft: BusOptionDraft = {
  capacity: '',
  estimatedPrice: '',
  maxCount: '999',
  notes: '',
};

export const emptyResetStats: ReservationDataResetStats = {
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
};

export const defaultResetOptions: ReservationDataResetOptions = {
  reservations: true,
  payments: true,
  campusTransfers: true,
  busAllocations: true,
  campusRequests: true,
  stations: false,
  busOptions: false,
  appSettings: false,
  homeAnnouncements: false,
  campusAdminRoles: false,
  organization: false,
  userAccounts: false,
};

export const getSetupDetailFromSearch = (
  search: string
): SetupDetailId | null => {
  const detail = new URLSearchParams(search).get('detail');

  return detail === 'organization' ||
    detail === 'campus-payment-accounts' ||
    detail === 'campus-admins' ||
    detail === 'destinations' ||
    detail === 'bus-options'
    ? detail
    : null;
};

export const getCampusKey = (
  district: string,
  team: string,
  campus: string
) => `campus|${district}|${team}|${campus}`;

export const normalizeCampusRows = (rows: CampusOptionRow[]) =>
  rows.map((row, index, array) => {
    const district = row.district?.trim() || '미등록 지구';
    const team = row.team?.trim() || '미등록 팀';
    const campus = row.campus?.trim() || '미등록 캠퍼스';
    const baseKey = getCampusKey(district, team, campus);
    const duplicateIndex = array
      .slice(0, index)
      .filter(
        (target) =>
          (target.district?.trim() || '미등록 지구') === district &&
          (target.team?.trim() || '미등록 팀') === team &&
          (target.campus?.trim() || '미등록 캠퍼스') === campus
      ).length;

    return {
      key: duplicateIndex > 0 ? `${baseKey}|${duplicateIndex}` : baseKey,
      baseKey,
      campusId: row.campus_id ?? '',
      district,
      team,
      campus,
    };
  });

export const summarizeCampusSetup = (
  campuses: CampusSetupRow[],
  savedPaymentAccountIds: Set<string>
) => ({
  districtCount: new Set(campuses.map((row) => row.district)).size,
  teamCount: new Set(campuses.map((row) => `${row.district}|${row.team}`)).size,
  campusCount: campuses.length,
  totalTarget: campuses.reduce((sum, row) => sum + row.target, 0),
  missingTargetCount: campuses.filter((row) => row.target <= 0).length,
  missingAdminCount: campuses.filter((row) => !row.hasAdmin).length,
  missingPaymentAccountCount: campuses.filter(
    (row) => !savedPaymentAccountIds.has(row.campusId)
  ).length,
});

export const summarizeBusOptions = (busOptions: BusOptionRow[]) => {
  if (busOptions.length === 0) {
    return {
      headline: '미설정',
      detail: '배차 계산에 사용할 버스를 등록해주세요.',
    };
  }

  const capacities = busOptions.map((option) => option.capacity);
  const prices = busOptions.map((option) => option.estimated_price);
  const totalMaxCount = busOptions.reduce(
    (sum, option) => sum + (option.max_count ?? 999),
    0
  );
  const minCapacity = Math.min(...capacities);
  const maxCapacity = Math.max(...capacities);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  if (busOptions.length === 1) {
    return {
      headline: `${minCapacity.toLocaleString()}인승 · 최대 ${totalMaxCount.toLocaleString()}대`,
      detail: `대당 예상 ${minPrice.toLocaleString()}원`,
    };
  }

  return {
    headline: `${busOptions.length.toLocaleString()}개 옵션 · ${minCapacity.toLocaleString()}~${maxCapacity.toLocaleString()}인승`,
    detail: `대당 ${minPrice.toLocaleString()}~${maxPrice.toLocaleString()}원 · 최대 ${totalMaxCount.toLocaleString()}대`,
  };
};

export const countSelectedResetRows = (
  stats: ReservationDataResetStats,
  options: ReservationDataResetOptions
) =>
  (options.reservations ? stats.reservations : 0) +
  (options.reservations || options.payments ? stats.payments : 0) +
  (options.campusTransfers ? stats.campusTransfers : 0) +
  (options.busAllocations ? stats.busAllocations : 0) +
  (options.campusRequests
    ? stats.campusRequests + stats.campusRequestMessages
    : 0) +
  (options.stations ? stats.stations : 0) +
  (options.busOptions ? stats.busOptions : 0) +
  (options.appSettings ? stats.appSettings : 0) +
  (options.homeAnnouncements ? stats.homeAnnouncements : 0) +
  (options.campusAdminRoles ? stats.campusAdminRoles : 0) +
  (options.organization ? stats.organization : 0) +
  (options.userAccounts ? stats.userAccounts : 0);

export const hasSelectedSetupReset = (options: ReservationDataResetOptions) =>
  options.stations ||
  options.busOptions ||
  options.appSettings ||
  options.homeAnnouncements ||
  options.campusAdminRoles ||
  options.organization ||
  options.userAccounts;

export const parseBusOptionDraft = (draft: BusOptionDraft) => {
  const capacity = Number(draft.capacity);
  const estimatedPrice = Number(draft.estimatedPrice);
  const maxCount = Number(draft.maxCount);

  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new Error('좌석 수는 1명 이상의 정수로 입력해주세요.');
  }

  if (!Number.isInteger(estimatedPrice) || estimatedPrice < 0) {
    throw new Error('예상 가격은 0원 이상의 정수로 입력해주세요.');
  }

  if (!Number.isInteger(maxCount) || maxCount < 1) {
    throw new Error('사용 가능 대수는 1대 이상의 정수로 입력해주세요.');
  }

  return {
    capacity,
    estimatedPrice,
    maxCount,
    notes: draft.notes.trim() || null,
  };
};

export const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;

  if (error && typeof error === 'object') {
    const errorRecord = error as Record<string, unknown>;

    return String(
      errorRecord.message ||
        errorRecord.details ||
        errorRecord.hint ||
        errorRecord.code ||
        JSON.stringify(errorRecord)
    );
  }

  return '알 수 없는 오류가 발생했습니다.';
};
