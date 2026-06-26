import { supabase } from '../supabase.js';

export type BoardingStatus = 'unchecked' | 'boarded' | 'no_show';
export type BoardingEventActorType =
  | 'passenger'
  | 'boarding_manager'
  | 'automatic';

export interface BoardingBus {
  id: string;
  label: string;
  destination: string;
  departureTime: string;
  boardingPlace: string;
  capacity: number;
  departedAt?: string | null;
  departedBy?: string | null;
  checkInCode?: string | null;
  checkInCodeExpiresAt?: string | null;
}

export interface BoardingPassenger {
  reservationId: string;
  passengerKind?: 'reservation' | 'walk_in';
  busId?: string;
  name: string;
  phone: string;
  district: string;
  team: string;
  campus: string;
  busNumber: string;
  seatNumber: string;
  stationPreferences?: string[];
  assignedDestination?: string;
  boardingStatus: BoardingStatus;
  boardingNote?: string | null;
  fieldExceptionReason?: string | null;
  boardingNoteUpdatedAt?: string | null;
  boardingNoteUpdatedByName?: string | null;
  accountSource?: 'self_signup' | 'admin_created' | 'ccc_summer';
  updatedAt?: string | null;
  updatedByName?: string | null;
}

export interface BoardingEvent {
  id: string;
  reservationId: string;
  fromStatus: BoardingStatus;
  toStatus: BoardingStatus;
  actorType?: BoardingEventActorType;
  actorName?: string | null;
  createdAt: string;
  note?: string | null;
}

export interface BoardingSnapshot {
  allocationId: string;
  allocationName: string;
  buses: BoardingBus[];
  passengers: BoardingPassenger[];
  events: BoardingEvent[];
}

export interface BoardingMoveTargetBus {
  id: string;
  label: string;
  destination: string;
  capacity: number;
  remainingCapacity: number;
  departedAt?: string | null;
  canManage: boolean;
}

export interface BoardingMoveRequest {
  id: string;
  reservationId: string;
  passengerName: string;
  passengerPhone: string;
  sourceBusId: string;
  sourceBusLabel: string;
  targetBusId: string;
  targetBusLabel: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedByName?: string | null;
  requestedAt: string;
  respondedByName?: string | null;
  respondedAt?: string | null;
  responseReason?: string | null;
  canRespond: boolean;
  isMine: boolean;
}

export interface BoardingMoveRequestSnapshot {
  targetBuses: BoardingMoveTargetBus[];
  requests: BoardingMoveRequest[];
}

export interface BoardingManagerUser {
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  district: string | null;
  team: string | null;
  campus: string | null;
  isBoardingManager: boolean;
  assignedBusIds: string[];
  isStaff: boolean;
}

export interface BoardingManagerAssignmentBus {
  id: string;
  label: string;
  destination: string;
}

export interface BoardingManagerAssignmentOptions {
  isAvailable: boolean;
  allocationId: string | null;
  allocationName: string | null;
  buses: BoardingManagerAssignmentBus[];
}

export interface BoardingRosterGoogleSheetSyncResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  allocationName: string;
  passengerCount: number;
  busCount: number;
  syncedAt: string;
}

const isMissingBoardingManagerAssignmentRpc = (error: {
  code?: string;
  message?: string;
}) =>
  error.code === 'PGRST202' ||
  error.code === '42883' ||
  error.message?.includes('schema cache') ||
  error.message?.includes('Could not find the function');

const isMissingBoardingTransitionReasonRpc = (error: {
  code?: string;
  message?: string;
}) =>
  isMissingBoardingManagerAssignmentRpc(error) &&
  error.message?.includes('p_reason');

const boardingTransitionReasonUpgradeMessage =
  '탑승 상태 변경 DB 기능이 최신 버전이 아닙니다. Supabase에 sql/setup/150_require_boarding_transition_reason.sql을 적용해주세요.';

export const getBoardingManagementSnapshot = async () => {
  const { data, error } = await supabase.rpc('get_boarding_management_snapshot');
  if (error) throw new Error(error.message);
  return (data ?? null) as BoardingSnapshot | null;
};

export const syncBoardingRosterGoogleSheet = async () => {
  const { data, error } = await supabase.functions.invoke(
    'boarding-roster-google-sheet',
    { body: {} }
  );
  if (error) {
    const context =
      'context' in error
        ? (error as { context?: unknown }).context
        : null;
    if (context instanceof Response) {
      const body = (await context.clone().json().catch(() => null)) as {
        error?: string;
      } | null;
      if (body?.error) throw new Error(body.error);
    }
    throw error;
  }
  if (data?.error) throw new Error(String(data.error));
  return data as BoardingRosterGoogleSheetSyncResult;
};

export const setPassengerBoardingStatus = async (
  reservationId: string,
  status: BoardingStatus,
  reason = ''
) => {
  if (status === 'no_show' && !reason.trim()) {
    throw new Error('미탑승 사유를 반드시 입력해주세요.');
  }
  const { error } = await supabase.rpc('set_passenger_boarding_status', {
    p_reservation_id: reservationId,
    p_status: status,
    p_reason: reason,
  });
  if (!error) return;
  if (!isMissingBoardingTransitionReasonRpc(error)) {
    throw new Error(error.message);
  }
  if (reason.trim()) {
    throw new Error(boardingTransitionReasonUpgradeMessage);
  }

  const { error: legacyError } = await supabase.rpc('set_passenger_boarding_status', {
    p_reservation_id: reservationId,
    p_status: status,
  });
  if (legacyError) throw new Error(legacyError.message);
};

export const updatePassengerBoardingNote = async (
  passengerId: string,
  passengerKind: BoardingPassenger['passengerKind'],
  note: string
) => {
  const { error } =
    passengerKind === 'walk_in'
      ? await supabase.rpc('update_walk_in_boarding_note', {
          p_walk_in_id: passengerId,
          p_note: note,
        })
      : await supabase.rpc('update_passenger_boarding_note', {
          p_reservation_id: passengerId,
          p_note: note,
        });
  if (error) throw new Error(error.message);
};

export const getBoardingMoveRequestSnapshot = async () => {
  const { data, error } = await supabase.rpc('get_boarding_move_request_snapshot');
  if (!error) return (data ?? null) as BoardingMoveRequestSnapshot | null;
  if (isMissingBoardingManagerAssignmentRpc(error)) return null;
  throw new Error(error.message);
};

export const setBoardingPassengerStatus = async (
  passenger: Pick<BoardingPassenger, 'reservationId' | 'passengerKind'>,
  status: BoardingStatus,
  reason = ''
) => {
  if (status === 'no_show' && !reason.trim()) {
    throw new Error('미탑승 사유를 반드시 입력해주세요.');
  }
  if (passenger.passengerKind !== 'walk_in') {
    return setPassengerBoardingStatus(passenger.reservationId, status, reason);
  }

  const { error } = await supabase.rpc('set_walk_in_boarding_status', {
    p_walk_in_id: passenger.reservationId,
    p_status: status,
    p_reason: reason,
  });
  if (!error) return;
  if (!isMissingBoardingTransitionReasonRpc(error)) {
    throw new Error(error.message);
  }
  if (reason.trim()) {
    throw new Error(boardingTransitionReasonUpgradeMessage);
  }

  const { error: legacyError } = await supabase.rpc('set_walk_in_boarding_status', {
    p_walk_in_id: passenger.reservationId,
    p_status: status,
  });
  if (legacyError) throw new Error(legacyError.message);
};

export const moveBoardingPassenger = async (
  reservationId: string,
  targetBusId: string,
  reason: string
) => {
  const { error } = await supabase.rpc('move_boarding_passenger_as_global_admin', {
    p_reservation_id: reservationId,
    p_target_bus_id: targetBusId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
};

export const requestBoardingPassengerMove = async (
  reservationId: string,
  targetBusId: string,
  reason: string
) => {
  const { error } = await supabase.rpc('request_boarding_passenger_move', {
    p_reservation_id: reservationId,
    p_target_bus_id: targetBusId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
};

export const respondToBoardingMoveRequest = async (
  requestId: string,
  approve: boolean,
  responseReason = ''
) => {
  const { error } = await supabase.rpc('respond_to_boarding_move_request', {
    p_request_id: requestId,
    p_approve: approve,
    p_response_reason: responseReason,
  });
  if (error) throw new Error(error.message);
};

export const addBoardingWalkIn = async (input: {
  busId: string;
  seatNumber: number;
  name: string;
  phone: string;
  campus: string;
  reason: string;
}) => {
  const { error } = await supabase.rpc('add_boarding_walk_in_as_global_admin', {
    p_bus_id: input.busId,
    p_seat_number: input.seatNumber,
    p_name: input.name,
    p_phone: input.phone,
    p_campus: input.campus,
    p_reason: input.reason,
  });
  if (error) throw new Error(error.message);
};

export const markBoardingBusDeparted = async (busId: string) => {
  const { error } = await supabase.rpc('mark_boarding_bus_departed', {
    p_bus_id: busId,
  });
  if (error) {
    if (
      error.message ===
      'Resolve all unchecked passengers before marking departure.'
    ) {
      throw new Error(
        '탑승 미확인 인원을 모두 탑승 확인 또는 미탑승 처리한 뒤 출발 완료해주세요.'
      );
    }
    throw new Error(error.message);
  }
};

export const cancelBoardingBusDeparture = async (busId: string, reason: string) => {
  const { data, error } = await supabase.rpc('cancel_boarding_bus_departure', {
    p_bus_id: busId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
};

export const rotateBoardingCheckInCode = async (busId: string) => {
  const { data, error } = await supabase.rpc('rotate_boarding_check_in_code', {
    p_bus_id: busId,
  });
  if (error) throw new Error(error.message);
  return String(data ?? '');
};

export const getBoardingManagerUsers = async (search: string, isStaffOnly = false) => {
  const { data, error } = await supabase.rpc('get_boarding_manager_users', {
    p_search: search,
    p_is_staff_only: isStaffOnly,
  });
  if (error) throw new Error(error.message);

  return ((data ?? []) as Array<{
    user_id: string;
    name: string;
    email: string | null;
    phone: string | null;
    district: string | null;
    team: string | null;
    campus: string | null;
    is_boarding_manager: boolean;
    assigned_bus_ids: string[] | null;
    is_staff: boolean;
  }>).map((row) => ({
    userId: row.user_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    district: row.district,
    team: row.team,
    campus: row.campus,
    isBoardingManager: row.is_boarding_manager,
    assignedBusIds: row.assigned_bus_ids ?? [],
    isStaff: row.is_staff ?? false,
  }));
};

export const getBoardingManagerAssignmentOptions = async () => {
  const { data, error } = await supabase.rpc('get_boarding_manager_assignment_options');
  if (error) {
    if (isMissingBoardingManagerAssignmentRpc(error)) {
      return {
        isAvailable: false,
        allocationId: null,
        allocationName: null,
        buses: [],
      } satisfies BoardingManagerAssignmentOptions;
    }
    throw new Error(error.message);
  }

  const value = (data ?? {}) as {
    allocationId?: string | null;
    allocationName?: string | null;
    buses?: BoardingManagerAssignmentBus[];
  };

  return {
    isAvailable: true,
    allocationId: value.allocationId ?? null,
    allocationName: value.allocationName ?? null,
    buses: value.buses ?? [],
  } satisfies BoardingManagerAssignmentOptions;
};

export const saveBoardingManagerBusAssignments = async (
  userId: string,
  busIds: string[]
) => {
  const { error } = await supabase.rpc(
    'set_boarding_manager_bus_assignments_as_global_admin',
    {
      p_user_id: userId,
      p_bus_ids: busIds,
    }
  );
  if (error) {
    if (isMissingBoardingManagerAssignmentRpc(error)) {
      throw new Error(
        '담당 호차 지정 DB 기능이 설치되지 않았습니다. Supabase에 sql/setup/96_boarding_manager_bus_assignments.sql을 적용해주세요.'
      );
    }
    throw new Error(error.message);
  }
};

export const assignBoardingManager = async (userId: string) => {
  const { error } = await supabase.rpc('assign_boarding_manager_as_global_admin', {
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
};

export const cancelBoardingManager = async (userId: string) => {
  const { error } = await supabase.rpc('cancel_boarding_manager_as_global_admin', {
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
};

export interface DestinationQueueBoardingBus {
  id: string;
  allocation_id: string;
  destination: string;
  sequence_number: number;
  label: string;
  capacity: number;
  status: 'open' | 'full' | 'departed';
  check_in_code?: string | null;
  opened_at: string;
  opened_by?: string | null;
  closed_at?: string | null;
  departed_at?: string | null;
  departed_by?: string | null;
}

export interface DestinationQueueBoardingPassenger {
  reservationId: string;
  passengerKind?: 'reservation' | 'walk_in';
  name: string;
  phone: string;
  district: string;
  team: string;
  campus: string;
  assignedDestination: string;
  busId?: string | null;
  busNumber?: string | null;
  boardingStatus: BoardingStatus;
  boardingConfirmedAt?: string | null;
  boardingNote?: string | null;
  boardingNoteUpdatedAt?: string | null;
  boardingNoteUpdatedByName?: string | null;
  accountSource?: 'self_signup' | 'admin_created' | 'ccc_summer';
  updatedAt?: string | null;
  updatedByName?: string | null;
  stationPreferences?: string[];
}

export interface DestinationQueueBoardingSnapshot {
  allocationId: string;
  allocationName: string;
  commonBoarding: {
    departureTime: string;
    boardingPlace: string;
  };
  destinations: Array<{
    destination: string;
    total: number;
    boarded: number;
    unchecked: number;
    noShow: number;
    expectedBuses: number;
  }>;
  buses: DestinationQueueBoardingBus[];
  passengers: DestinationQueueBoardingPassenger[];
  events: BoardingEvent[];
  departures: DestinationQueueDepartureSnapshot[];
}

export interface DestinationQueueDepartureSnapshotPassenger {
  reservationId: string;
  name: string;
  phone: string;
  district: string;
  team: string;
  campus: string;
  boardingConfirmedAt?: string | null;
}

export interface DestinationQueueDepartureSnapshot {
  busId: string;
  destination: string;
  sequenceNumber: number;
  label: string;
  boardedCount: number;
  passengers: DestinationQueueDepartureSnapshotPassenger[];
  departedAt: string;
  departedBy?: string | null;
  departedByName: string;
}

const isMissingDestinationQueueDepartureSnapshotRpc = (error: {
  code?: string;
  message?: string;
}) =>
  error.code === 'PGRST202' ||
  error.code === '42883' ||
  error.message?.includes('Could not find the function');

export const getDestinationQueueBoardingSnapshot = async () => {
  const [snapshotResult, departuresResult] = await Promise.all([
    supabase.rpc('get_destination_queue_boarding_snapshot'),
    supabase.rpc('get_destination_queue_departure_snapshots'),
  ]);
  if (snapshotResult.error) throw new Error(snapshotResult.error.message);
  if (
    departuresResult.error &&
    !isMissingDestinationQueueDepartureSnapshotRpc(departuresResult.error)
  ) {
    throw new Error(departuresResult.error.message);
  }
  if (!snapshotResult.data) return null;
  return {
    ...(snapshotResult.data as Omit<DestinationQueueBoardingSnapshot, 'departures'>),
    departures: (departuresResult.data ?? []) as DestinationQueueDepartureSnapshot[],
  };
};

export const startDestinationQueueBus = async (destination: string) => {
  const { data, error } = await supabase.rpc('start_destination_queue_bus', {
    p_destination: destination,
  });
  if (error) throw new Error(error.message);
  return data as DestinationQueueBoardingBus;
};

export const setDestinationQueuePassengerStatus = async (
  reservationId: string,
  status: BoardingStatus,
  reason = ''
) => {
  const { data, error } = await supabase.rpc('set_destination_queue_passenger_status', {
    p_reservation_id: reservationId,
    p_status: status,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  return data;
};

export const departDestinationQueueBus = async (busId: string) => {
  const { data, error } = await supabase.rpc('depart_destination_queue_bus', {
    p_bus_id: busId,
  });
  if (error) throw new Error(error.message);
  return data as DestinationQueueBoardingBus;
};

export const cancelDestinationQueueDeparture = async (
  busId: string,
  reason: string
) => {
  const { data, error } = await supabase.rpc(
    'cancel_destination_queue_departure',
    {
      p_bus_id: busId,
      p_reason: reason,
    }
  );
  if (error) throw new Error(error.message);
  return data as {
    busId: string;
    status: 'open' | 'full';
    boardedCount: number;
    checkInCode?: string | null;
  };
};
