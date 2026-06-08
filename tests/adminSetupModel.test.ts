import assert from 'node:assert/strict';
import test from 'node:test';

import {
  countSelectedResetRows,
  defaultResetOptions,
  emptyResetStats,
  getErrorMessage,
  getSetupDetailFromSearch,
  parseBusOptionDraft,
  summarizeBusOptions,
  normalizeCampusRows,
} from '../src/pages/admin/adminSetupModel.js';

test('setup detail query only accepts known detail panels', () => {
  assert.equal(getSetupDetailFromSearch('?detail=destinations'), 'destinations');
  assert.equal(
    getSetupDetailFromSearch('?detail=campus-payment-accounts'),
    'campus-payment-accounts'
  );
  assert.equal(getSetupDetailFromSearch('?detail=unknown'), null);
});

test('campus rows receive normalized labels and stable duplicate keys', () => {
  const rows = normalizeCampusRows([
    {
      campus_id: 'campus-1',
      district: ' 서울 ',
      team: ' 1팀 ',
      campus: ' 중앙대 ',
    },
    {
      campus_id: 'campus-2',
      district: '서울',
      team: '1팀',
      campus: '중앙대',
    },
    {
      campus_id: null,
      district: null,
      team: null,
      campus: null,
    },
  ]);

  assert.deepEqual(
    rows.map(({ key, campusId, district, team, campus }) => ({
      key,
      campusId,
      district,
      team,
      campus,
    })),
    [
      {
        key: 'campus|서울|1팀|중앙대',
        campusId: 'campus-1',
        district: '서울',
        team: '1팀',
        campus: '중앙대',
      },
      {
        key: 'campus|서울|1팀|중앙대|1',
        campusId: 'campus-2',
        district: '서울',
        team: '1팀',
        campus: '중앙대',
      },
      {
        key: 'campus|미등록 지구|미등록 팀|미등록 캠퍼스',
        campusId: '',
        district: '미등록 지구',
        team: '미등록 팀',
        campus: '미등록 캠퍼스',
      },
    ]
  );
});

test('setup errors expose useful structured messages', () => {
  assert.equal(getErrorMessage(new Error('실패')), '실패');
  assert.equal(getErrorMessage({ details: '상세 오류' }), '상세 오류');
  assert.equal(getErrorMessage(null), '알 수 없는 오류가 발생했습니다.');
});

test('bus option drafts validate and summaries describe saved options', () => {
  assert.deepEqual(
    parseBusOptionDraft({
      capacity: '45',
      estimatedPrice: '1200000',
      maxCount: '3',
      notes: ' 우등 ',
    }),
    {
      capacity: 45,
      estimatedPrice: 1200000,
      maxCount: 3,
      notes: '우등',
    }
  );
  assert.throws(
    () =>
      parseBusOptionDraft({
        capacity: '0',
        estimatedPrice: '0',
        maxCount: '1',
        notes: '',
      }),
    /좌석 수/
  );
  assert.match(
    summarizeBusOptions([
      {
        id: 'bus-option',
        capacity: 45,
        estimated_price: 1200000,
        max_count: 3,
      },
    ]).headline,
    /45인승 · 최대 3대/
  );
});

test('selected reset row count includes payments deleted with reservations', () => {
  assert.equal(
    countSelectedResetRows(
      {
        ...emptyResetStats,
        reservations: 3,
        payments: 2,
        busAllocations: 4,
      },
      {
        ...defaultResetOptions,
        campusTransfers: false,
        campusRequests: false,
      }
    ),
    9
  );
});
