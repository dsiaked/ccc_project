import type { StationOption } from '../types/station';

export type ReservationStatus = 'requested' | 'confirmed' | 'cancelled';

export interface StationPreference {
  rank: 1 | 2 | 3;
  station: StationOption;
}

export interface ConfirmedTicket {
  busNumber: string;
  seatNumber?: string;
  departureTime: string;
  boardingPlace: string;
  dropoffStation: string;
  dropoffDetail?: string;
  managerNote?: string;
  confirmedAt: string;
}

export interface ReturnBusReservation {
  id: string;

  name: string;
  phone: string;

  district: string;
  team: string;
  campus: string;

  stationPreferences: StationPreference[];

  status: ReservationStatus;

  confirmedTicket?: ConfirmedTicket;

  requestedAt: string;
  updatedAt?: string;
}