import { memo, useEffect, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';

import {
  isRemainingSeatPassenger,
  type AllocationWorkspaceBus,
  type AllocationWorkspacePassenger,
} from '../../../lib/admin/allocationWorkspaceService';
import { formatBusLabel } from '../../../utils/busLabel';
import type { PassengerIssueField } from '../allocationWorkspaceViewModel';
import styles from '../AdminAllocationWorkspacePage.module.css';

const PASSENGER_ROW_HEIGHT = 58;
const PASSENGER_TABLE_VIEWPORT_HEIGHT = 520;
const PASSENGER_TABLE_OVERSCAN = 6;

interface PassengerRowProps {
  passenger: AllocationWorkspacePassenger;
  buses: AllocationWorkspaceBus[];
  passengerCountByBus: Map<string, number>;
  issueFields?: Set<PassengerIssueField>;
  readOnly: boolean;
  onAssign: (passengerId: string, busId: string | null) => void;
  onSeat: (passengerId: string, seat: number | null) => void;
}

const PassengerRow = memo(function PassengerRow({
  passenger,
  buses,
  passengerCountByBus,
  issueFields,
  readOnly,
  onAssign,
  onSeat,
}: PassengerRowProps) {
  const remainingSeat = isRemainingSeatPassenger(passenger);
  const assignedBus = buses.find((bus) => bus.id === passenger.busId);
  const remainingSeatLabel =
    passenger.remainingSeatStatus === 'pending_payment'
      ? '잔여 좌석 · 입금 대기'
      : '잔여 좌석 · 입금 완료';

  return (
    <tr
      id={`passenger-${passenger.reservationId}`}
      className={issueFields?.size ? styles.passengerRowWithError : undefined}
      draggable={!readOnly && !remainingSeat}
      onDragStart={(event) =>
        !readOnly &&
        !remainingSeat &&
        event.dataTransfer.setData(
          'text/allocation-passenger',
          passenger.reservationId
        )
      }
    >
      <td className={styles.dragHandleCell}>
        <span
          className={styles.dragHandle}
          title={
            remainingSeat
              ? '잔여 좌석 탑승자의 배차는 이 화면에서 직접 변경할 수 없습니다.'
              : '끌어서 다른 버스로 이동'
          }
        >
          <GripVertical size={16} />
          <small>{remainingSeat ? '잠금' : '이동'}</small>
        </span>
      </td>
      <td>
        <strong>{passenger.name}</strong>
        {remainingSeat && (
          <span
            className={
              passenger.remainingSeatStatus === 'pending_payment'
                ? styles.remainingSeatPendingBadge
                : styles.remainingSeatConfirmedBadge
            }
          >
            {remainingSeatLabel}
          </span>
        )}
      </td>
      <td className={styles.passengerPhone}>{passenger.phone || '-'}</td>
      <td>
        {passenger.campus} · {passenger.team}
      </td>
      <td
        className={
          issueFields?.has('preferences') ? styles.cellWithError : undefined
        }
      >
        {remainingSeat
          ? `직접 선택 · ${passenger.preferences[0] ?? '행선지 확인 필요'}`
          : passenger.preferences.join(' / ') || '지망 정보 없음'}
      </td>
      <td
        className={
          issueFields?.has('assignment') ? styles.cellWithError : undefined
        }
      >
        <select
          disabled={readOnly || remainingSeat}
          title={
            remainingSeat
              ? '잔여 좌석 탑승자의 배차는 이 화면에서 직접 변경할 수 없습니다.'
              : undefined
          }
          className={
            issueFields?.has('assignment') ? styles.controlWithError : undefined
          }
          value={passenger.busId ?? ''}
          onChange={(event) => {
            if (readOnly) return;
            onAssign(passenger.reservationId, event.target.value || null);
          }}
        >
          <option value="">미배차</option>
          {buses.map((bus) => {
            const unavailable =
              bus.id !== passenger.busId &&
              (passengerCountByBus.get(bus.id) ?? 0) >= bus.capacity;

            return (
              <option key={bus.id} value={bus.id} disabled={unavailable}>
                {formatBusLabel(bus.label)} ·{' '}
                {bus.destination || '행선지 미설정'}
                {unavailable ? ' · 이동 불가(만석)' : ''}
              </option>
            );
          })}
        </select>
      </td>
      <td
        className={issueFields?.has('seat') ? styles.cellWithError : undefined}
      >
        <input
          title={
            remainingSeat
              ? '잔여 좌석 탑승자의 좌석은 이 화면에서 직접 변경할 수 없습니다.'
              : undefined
          }
          className={
            issueFields?.has('seat') ? styles.controlWithError : undefined
          }
          type="number"
          min="1"
          max={assignedBus?.capacity}
          value={passenger.seatNumber ?? ''}
          disabled={readOnly || !passenger.busId || remainingSeat}
          onChange={(event) => {
            if (readOnly) return;
            onSeat(
              passenger.reservationId,
              event.target.value ? Number(event.target.value) : null
            );
          }}
        />
      </td>
    </tr>
  );
});

interface VirtualPassengerTableProps {
  passengers: AllocationWorkspacePassenger[];
  buses: AllocationWorkspaceBus[];
  passengerCountByBus: Map<string, number>;
  passengerIssueFields: Map<string, Set<PassengerIssueField>>;
  revealPassengerId?: string | null;
  onRevealComplete?: () => void;
  readOnly?: boolean;
  onAssign: (passengerId: string, busId: string | null) => void;
  onSeat: (passengerId: string, seat: number | null) => void;
}

export const VirtualPassengerTable = memo(function VirtualPassengerTable({
  passengers,
  buses,
  passengerCountByBus,
  passengerIssueFields,
  revealPassengerId,
  onRevealComplete,
  readOnly = false,
  onAssign,
  onSeat,
}: VirtualPassengerTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const visibleRowCount = Math.ceil(
    PASSENGER_TABLE_VIEWPORT_HEIGHT / PASSENGER_ROW_HEIGHT
  );
  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / PASSENGER_ROW_HEIGHT) - PASSENGER_TABLE_OVERSCAN
  );
  const endIndex = Math.min(
    passengers.length,
    startIndex + visibleRowCount + PASSENGER_TABLE_OVERSCAN * 2
  );
  const visiblePassengers = passengers.slice(startIndex, endIndex);
  const topSpacerHeight = startIndex * PASSENGER_ROW_HEIGHT;
  const bottomSpacerHeight =
    (passengers.length - endIndex) * PASSENGER_ROW_HEIGHT;

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const maximumScrollTop = Math.max(
      0,
      passengers.length * PASSENGER_ROW_HEIGHT -
        PASSENGER_TABLE_VIEWPORT_HEIGHT
    );
    if (viewport.scrollTop > maximumScrollTop) {
      viewport.scrollTop = maximumScrollTop;
    }
  }, [passengers.length]);

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport || !revealPassengerId) return;
    const passengerIndex = passengers.findIndex(
      (passenger) => passenger.reservationId === revealPassengerId
    );
    if (passengerIndex < 0) return;

    const nextScrollTop = Math.max(
      0,
      passengerIndex * PASSENGER_ROW_HEIGHT -
        (PASSENGER_TABLE_VIEWPORT_HEIGHT - PASSENGER_ROW_HEIGHT) / 2
    );
    viewport.scrollTop = nextScrollTop;
    onRevealComplete?.();
  }, [onRevealComplete, passengers, revealPassengerId]);

  return (
    <div className={styles.passengerTableArea}>
      <div className={styles.passengerDragGuide}>
        <GripVertical size={15} />
        <span>행 왼쪽의 이동 핸들을 끌어 원하는 버스 카드에 놓으세요.</span>
      </div>
      <div
        ref={scrollRef}
        className={styles.passengerTableWrap}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <table className={styles.passengerTable}>
          <colgroup>
            <col className={styles.passengerDragColumn} />
            <col className={styles.passengerNameColumn} />
            <col className={styles.passengerPhoneColumn} />
            <col className={styles.passengerTeamColumn} />
            <col className={styles.passengerPreferenceColumn} />
            <col className={styles.passengerBusColumn} />
            <col className={styles.passengerSeatColumn} />
          </colgroup>
          <thead>
            <tr>
              <th aria-label="드래그 이동" />
              <th>탑승자</th>
              <th>전화번호</th>
              <th>캠퍼스·팀</th>
              <th>1·2지망</th>
              <th>버스 이동</th>
              <th>좌석</th>
            </tr>
          </thead>
          <tbody>
            {topSpacerHeight > 0 && (
              <tr aria-hidden="true" className={styles.virtualSpacerRow}>
                <td colSpan={7} style={{ height: topSpacerHeight }} />
              </tr>
            )}
            {visiblePassengers.map((passenger) => (
              <PassengerRow
                key={passenger.reservationId}
                passenger={passenger}
                buses={buses}
                passengerCountByBus={passengerCountByBus}
                issueFields={passengerIssueFields.get(passenger.reservationId)}
                readOnly={readOnly}
                onAssign={onAssign}
                onSeat={onSeat}
              />
            ))}
            {bottomSpacerHeight > 0 && (
              <tr aria-hidden="true" className={styles.virtualSpacerRow}>
                <td colSpan={7} style={{ height: bottomSpacerHeight }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});
