import type {
  BoardingEvent,
  BoardingPassenger,
  BoardingSnapshot,
} from '../../lib/admin/boardingManagementService.js';

export type BoardingExceptionKind =
  | 'manual'
  | 'walk_in'
  | 'bus_move'
  | 'no_show'
  | 'no_show_reversed';

export interface BoardingExceptionRecord {
  id: string;
  allocationId: string;
  allocationName: string;
  kind: BoardingExceptionKind;
  passengerId: string;
  passengerName: string;
  passengerPhone: string;
  campus: string;
  busId: string;
  busNumber: string;
  seatNumber: string;
  actorName: string;
  createdAt: string | null;
  reason: string;
  reasonUpdatedAt?: string;
  reasonUpdatedByName?: string;
  isAutomatic: boolean;
  archivedAt?: string;
  archivedByName?: string;
}

const transitionReasonPrefix = 'boarding_status_changed:';
const busMoveReasonPrefix = '[호차 이동]';

const getLatestBusMoveReason = (passenger: BoardingPassenger) =>
  (passenger.boardingNote ?? '')
    .split('\n')
    .reverse()
    .find((line) => line.trim().startsWith(busMoveReasonPrefix))
    ?.trim()
    .slice(busMoveReasonPrefix.length)
    .trim() ?? '';

const getTransitionReason = (event: BoardingEvent) =>
  event.note?.startsWith(transitionReasonPrefix)
    ? event.note.slice(transitionReasonPrefix.length).trim()
    : '';

const getNoShowReason = (
  event: BoardingEvent,
  passenger: BoardingPassenger
) => {
  if (event.note === 'bus_departed_auto_no_show') {
    return '호차 출발 완료에 따른 자동 미탑승 처리';
  }

  return getTransitionReason(event) || passenger.boardingNote?.trim() || '';
};

export const buildBoardingExceptionRecords = (
  snapshot: BoardingSnapshot | null
): BoardingExceptionRecord[] => {
  if (!snapshot) return [];

  const passengersById = new Map(
    snapshot.passengers.map((passenger) => [passenger.reservationId, passenger])
  );
  const records: BoardingExceptionRecord[] = [];

  snapshot.passengers.forEach((passenger) => {
    if (passenger.passengerKind !== 'walk_in') return;

    records.push({
      id: `${snapshot.allocationId}:walk-in:${passenger.reservationId}`,
      allocationId: snapshot.allocationId,
      allocationName: snapshot.allocationName,
      kind: 'walk_in',
      passengerId: passenger.reservationId,
      passengerName: passenger.name,
      passengerPhone: passenger.phone,
      campus: passenger.campus,
      busId: passenger.busId ?? '',
      busNumber: passenger.busNumber,
      seatNumber: passenger.seatNumber,
      actorName: passenger.updatedByName ?? '탑승 관리 간사님',
      createdAt: passenger.updatedAt ?? null,
      reason: passenger.fieldExceptionReason?.trim() || '현장 추가 탑승',
      isAutomatic: false,
    });
  });

  snapshot.events.forEach((event) => {
    const passenger = passengersById.get(event.reservationId);
    if (!passenger) return;

    let kind: BoardingExceptionKind | null = null;
    let reason = '';

    if (event.note === 'boarding_bus_moved') {
      kind = 'bus_move';
      reason = getLatestBusMoveReason(passenger) || '호차 이동 처리';
    } else if (event.toStatus === 'no_show') {
      kind = 'no_show';
      reason = getNoShowReason(event, passenger) || '미탑승 처리';
    } else if (
      event.fromStatus === 'no_show' &&
      event.toStatus === 'boarded'
    ) {
      kind = 'no_show_reversed';
      reason = getTransitionReason(event) || '미탑승 처리 취소·탑승 전환';
    }

    if (!kind) return;

    records.push({
      id: `${snapshot.allocationId}:event:${event.id}`,
      allocationId: snapshot.allocationId,
      allocationName: snapshot.allocationName,
      kind,
      passengerId: passenger.reservationId,
      passengerName: passenger.name,
      passengerPhone: passenger.phone,
      campus: passenger.campus,
      busId: passenger.busId ?? '',
      busNumber: passenger.busNumber,
      seatNumber: passenger.seatNumber,
      actorName:
        event.actorName ??
        (event.actorType === 'automatic' ? '자동 처리' : '탑승 관리 간사님'),
      createdAt: event.createdAt,
      reason,
      isAutomatic: event.actorType === 'automatic',
    });
  });

  const passengersWithNoShowEvents = new Set(
    snapshot.events
      .filter((event) => event.toStatus === 'no_show')
      .map((event) => event.reservationId)
  );

  snapshot.passengers.forEach((passenger) => {
    if (
      passenger.boardingStatus !== 'no_show' ||
      passengersWithNoShowEvents.has(passenger.reservationId)
    ) {
      return;
    }

    records.push({
      id: `${snapshot.allocationId}:current-no-show:${passenger.reservationId}`,
      allocationId: snapshot.allocationId,
      allocationName: snapshot.allocationName,
      kind: 'no_show',
      passengerId: passenger.reservationId,
      passengerName: passenger.name,
      passengerPhone: passenger.phone,
      campus: passenger.campus,
      busId: passenger.busId ?? '',
      busNumber: passenger.busNumber,
      seatNumber: passenger.seatNumber,
      actorName: passenger.updatedByName ?? '탑승 관리 간사님',
      createdAt: passenger.updatedAt ?? null,
      reason: passenger.boardingNote?.trim() || '미탑승 처리',
      isAutomatic: false,
    });
  });

  return records.sort((left, right) => {
    if (!left.createdAt) return 1;
    if (!right.createdAt) return -1;
    return right.createdAt.localeCompare(left.createdAt);
  });
};
