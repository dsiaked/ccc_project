import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { describeAllocationWorkspaceChanges } from '../src/lib/admin/allocationWorkspaceHistory.js';

const bus = (id: string, label: string) => ({
  id,
  label,
  capacity: 45,
  price: 900000,
  destination: '서울역',
  departureTime: '10:00',
  boardingPlace: '본관',
  minimumPassengers: 36,
});

const passenger = (
  reservationId: string,
  name: string,
  busId: string | null,
  seatNumber: number | null
) => ({
  reservationId,
  name,
  busId,
  seatNumber,
});

describe('describeAllocationWorkspaceChanges', () => {
  it('describes the first saved snapshot', () => {
    const changes = describeAllocationWorkspaceChanges(undefined, {
      buses: [bus('bus-1', '1호차')],
      passengers: [passenger('p-1', '홍길동', 'bus-1', 1)],
    });

    assert.deepEqual(changes, ['최초 저장 상태: 버스 1대, 탑승자 1명.']);
  });

  it('summarizes bus settings and passenger assignment changes', () => {
    const previous = {
      buses: [bus('bus-1', '1호차')],
      passengers: [passenger('p-1', '홍길동', 'bus-1', 1)],
    };
    const current = {
      buses: [
        { ...bus('bus-1', '1호차'), departureTime: '11:00' },
        bus('bus-2', '2호차'),
      ],
      passengers: [passenger('p-1', '홍길동', 'bus-2', 3)],
    };

    const changes = describeAllocationWorkspaceChanges(previous, current);

    assert.equal(
      changes[0],
      '버스 변경: 추가 1대, 삭제 0대, 설정 수정 1대.'
    );
    assert.equal(
      changes[1],
      '탑승자 변경: 추가 0명, 제외 0명, 호차 이동 1명, 좌석 변경 0명.'
    );
    assert.ok(changes.includes('1호차: 출발 시각 10:00 → 11:00'));
    assert.ok(changes.includes('홍길동: 1호차 1번 → 2호차 3번'));
  });

  it('reports when the saved allocation did not change', () => {
    const snapshot = {
      buses: [bus('bus-1', '1호차')],
      passengers: [passenger('p-1', '홍길동', 'bus-1', 1)],
    };

    assert.deepEqual(describeAllocationWorkspaceChanges(snapshot, snapshot), [
      '직전 저장 버전과 배차 구성 변경이 없습니다.',
    ]);
  });
});
