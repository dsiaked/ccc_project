import { supabase } from '../supabase';

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
  busId?: string;
  name: string;
  phone: string;
  district: string;
  team: string;
  campus: string;
  busNumber: string;
  seatNumber: string;
  boardingStatus: BoardingStatus;
  boardingNote?: string | null;
  boardingNoteUpdatedAt?: string | null;
  boardingNoteUpdatedByName?: string | null;
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
  status: BoardingStatus
) => {
  const { error } = await supabase.rpc('set_passenger_boarding_status', {
    p_reservation_id: reservationId,
    p_status: status,
  });
  if (error) throw new Error(error.message);
};

export const updatePassengerBoardingNote = async (
  reservationId: string,
  note: string
) => {
  const { error } = await supabase.rpc('update_passenger_boarding_note', {
    p_reservation_id: reservationId,
    p_note: note,
  });
  if (error) throw new Error(error.message);
};

export const markBoardingBusDeparted = async (busId: string) => {
  const { error } = await supabase.rpc('mark_boarding_bus_departed', {
    p_bus_id: busId,
  });
  if (error) throw new Error(error.message);
};

export const cancelBoardingBusDeparture = async (busId: string) => {
  const { error } = await supabase.rpc('cancel_boarding_bus_departure', {
    p_bus_id: busId,
  });
  if (error) throw new Error(error.message);
};

export const rotateBoardingCheckInCode = async (busId: string) => {
  const { data, error } = await supabase.rpc('rotate_boarding_check_in_code', {
    p_bus_id: busId,
  });
  if (error) throw new Error(error.message);
  return String(data ?? '');
};

export const getBoardingManagerUsers = async (search: string) => {
  const { data, error } = await supabase.rpc('get_boarding_manager_users', {
    p_search: search,
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
        '담당 호차 지정 DB 기능이 설치되지 않았습니다. Supabase에 sql/setup/96_boarding_manager_bus_assignments.sql을 적용해 주세요.'
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
