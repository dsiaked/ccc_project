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
}

export interface BoardingPassenger {
  reservationId: string;
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
}

export const getBoardingManagementSnapshot = async () => {
  const { data, error } = await supabase.rpc('get_boarding_management_snapshot');
  if (error) throw new Error(error.message);
  return (data ?? null) as BoardingSnapshot | null;
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
  }>).map((row) => ({
    userId: row.user_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    district: row.district,
    team: row.team,
    campus: row.campus,
    isBoardingManager: row.is_boarding_manager,
  }));
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
