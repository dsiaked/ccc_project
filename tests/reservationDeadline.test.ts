import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatReservationDeadlineValue,
  isReservationDeadlineClosed,
  normalizeReservationDeadline,
} from '../src/utils/reservationDeadline.js';

test('reservation deadlines reject malformed setting values without crashing', () => {
  assert.equal(normalizeReservationDeadline('not-a-date'), null);
  assert.equal(normalizeReservationDeadline(123), null);
  assert.equal(isReservationDeadlineClosed('not-a-date', Date.now()), false);
  assert.equal(formatReservationDeadlineValue('not-a-date'), '미설정');
});

test('reservation deadlines normalize valid values and compare them to the clock', () => {
  const deadline = '2026-06-09T12:00:00.000Z';

  assert.equal(normalizeReservationDeadline(` ${deadline} `), deadline);
  assert.equal(
    isReservationDeadlineClosed(deadline, Date.parse('2026-06-09T12:00:01.000Z')),
    true
  );
  assert.equal(
    isReservationDeadlineClosed(deadline, Date.parse('2026-06-09T11:59:59.000Z')),
    false
  );
});
