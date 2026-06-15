import type { StationOption } from '../types/station';

export type ReservationStatus = 'requested' | 'confirmed' | 'cancelled';

export interface StationPreference {
  rank: 1 | 2;
  station: StationOption;
}

export interface ConfirmedTicket {
  allocationStrategy?: 'preassigned_bus' | 'destination_queue';
  busId?: string;
  busNumber: string;
  seatNumber?: string;
  departureTime: string;
  boardingPlace: string;
  dropoffStation: string;
  dropoffDetail?: string;
  managerNote?: string;
  confirmedAt: string;
}

export interface RemainingSeatClaim {
  allocationStrategy?: 'preassigned_bus' | 'destination_queue';
  allocationId: string;
  allocationName: string;
  busId: string;
  busLabel: string;
  destination: string;
  departureTime: string;
  boardingPlace: string;
  seatNumber: string;
  amount: number;
  depositorName: string;
  transferAccount: string;
  status: 'pending_payment' | 'confirmed';
  requestedAt: string;
  confirmedAt?: string;
}

export interface ReturnBusReservation {
  id: string;

  name: string;
  phone: string;

  district: string;
  team: string;
  campus: string;
  affiliationType?: 'seoul' | 'external';
  coordinatorName?: string;
  coordinatorPhone?: string;

  stationPreferences: StationPreference[];

  status: ReservationStatus;

  confirmedTicket?: ConfirmedTicket;
  boardingConfirmedAt?: string;
  remainingSeatClaim?: RemainingSeatClaim;

  requestedAt: string;
  updatedAt?: string;
}
