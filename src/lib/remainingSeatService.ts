import { supabase } from './supabase';
import type { ConfirmedTicket, RemainingSeatClaim } from '../types/reservation';
import {
  DESTINATION_QUEUE_REMAINING_SEAT_LABEL,
  isDestinationQueueRemainingSeatId,
} from './admin/destinationQueueAllocation';

export interface RemainingSeatOption {
  allocationId: string;
  allocationName: string;
  busId: string;
  busLabel: string;
  destination: string;
  departureTime: string;
  boardingPlace: string;
  capacity: number;
  remainingSeats: number;
  price: number;
  transferAccount: string;
}

export const formatRemainingSeatBusLabel = (busId: string, busLabel: string) =>
  isDestinationQueueRemainingSeatId(busId)
    ? DESTINATION_QUEUE_REMAINING_SEAT_LABEL
    : busLabel;

export const isDestinationQueueRemainingSeat = (busId: string) =>
  isDestinationQueueRemainingSeatId(busId);

export const formatRemainingSeatPosition = (busId: string, seatNumber: string) =>
  isDestinationQueueRemainingSeatId(busId) ? '탑승 시 호차 배정' : `${seatNumber}번`;

interface RemainingSeatRow {
  allocation_id: string;
  allocation_name: string;
  bus_id: string;
  bus_label: string;
  destination: string;
  departure_time: string;
  boarding_place: string;
  capacity: number;
  remaining_seats: number;
  price: number;
  transfer_account: string;
}

const throwRemainingSeatError = (error: { code?: string; message?: string }) => {
  const message = error.message ?? '';

  if (
    error.code === 'PGRST202' ||
    message.includes('get_available_remaining_seats') ||
    message.includes('claim_remaining_seat') ||
    message.includes('cancel_remaining_seat_claim')
  ) {
    throw new Error(
      '잔여 좌석 DB 기능이 설치되지 않았습니다. 관리자에게 문의해주세요.'
    );
  }

  if (message.includes('A reservation already exists')) {
    throw new Error('이미 신청 내역이 있어 잔여 좌석을 신청할 수 없습니다.');
  }
  if (message.includes('No remaining seats')) {
    throw new Error('선택한 버스의 잔여 좌석이 방금 마감되었습니다.');
  }
  if (message.includes('Remaining seat sales are closed')) {
    throw new Error('잔여 좌석 신청이 현재 마감되었습니다.');
  }
  if (message.includes('not open for remaining seat sales')) {
    throw new Error('선택한 버스의 잔여 좌석 신청이 중단되었습니다.');
  }
  if (message.includes('Depositor name is required')) {
    throw new Error('입금자명을 입력해주세요.');
  }
  if (message.includes('only after the deadline')) {
    throw new Error('잔여 좌석은 일반 신청 마감 후에 선택할 수 있습니다.');
  }
  if (message.includes('Complete your profile')) {
    throw new Error('잔여 좌석 신청 전에 이름, 연락처, 소속 정보를 입력해주세요.');
  }
  if (
    message.includes('confirmed allocation is no longer available') ||
    message.includes('selected bus is not available')
  ) {
    throw new Error('선택한 버스 정보를 더 이상 사용할 수 없습니다.');
  }

  throw error;
};

export const getAvailableRemainingSeats = async () => {
  const { data, error } = await supabase.rpc('get_available_remaining_seats');

  if (error) throwRemainingSeatError(error);

  return ((data ?? []) as RemainingSeatRow[]).map((row) => ({
    allocationId: row.allocation_id,
    allocationName: row.allocation_name,
    busId: row.bus_id,
    busLabel: row.bus_label,
    destination: row.destination,
    departureTime: row.departure_time,
    boardingPlace: row.boarding_place,
    capacity: Number(row.capacity),
    remainingSeats: Number(row.remaining_seats),
    price: Number(row.price),
    transferAccount: row.transfer_account,
  })) satisfies RemainingSeatOption[];
};

export const claimRemainingSeat = async (
  allocationId: string,
  busId: string,
  depositorName: string
) => {
  const { data, error } = await supabase.rpc('claim_remaining_seat', {
    p_allocation_id: allocationId,
    p_bus_id: busId,
    p_depositor_name: depositorName.trim(),
  });

  if (error) throwRemainingSeatError(error);

  return data as RemainingSeatClaim;
};

export const cancelRemainingSeatClaim = async (reservationId: string) => {
  const { error } = await supabase.rpc('cancel_remaining_seat_claim', {
    p_reservation_id: reservationId,
  });

  if (error) throwRemainingSeatError(error);
};

export interface RemainingSeatSalesSettings {
  enabled: boolean;
  hiddenBusIds: string[];
}

export const getRemainingSeatSalesSettings = async () => {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'remaining_seat_sales')
    .maybeSingle();

  if (error) throw error;

  const value = (data?.value ?? {}) as {
    enabled?: boolean;
    hidden_bus_ids?: string[];
  };

  return {
    enabled: value.enabled ?? true,
    hiddenBusIds: Array.isArray(value.hidden_bus_ids) ? value.hidden_bus_ids : [],
  } satisfies RemainingSeatSalesSettings;
};

export const updateRemainingSeatSalesSettings = async (
  settings: RemainingSeatSalesSettings
) => {
  const { error } = await supabase.rpc('update_remaining_seat_sales_settings', {
    p_enabled: settings.enabled,
    p_hidden_bus_ids: settings.hiddenBusIds,
  });

  if (error) throw error;
};

export const confirmRemainingSeatPayment = async (reservationId: string) => {
  const { data, error } = await supabase.rpc('confirm_remaining_seat_payment', {
    p_reservation_id: reservationId,
  });

  if (error) throw error;
  return data as ConfirmedTicket;
};
