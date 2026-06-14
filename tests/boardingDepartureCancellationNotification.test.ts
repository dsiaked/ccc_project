import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'sql/setup/184_notify_boarding_managers_on_departure_cancel.sql',
  'utf8'
);
const notifications = readFileSync(
  'src/components/HomeNoticeSection.tsx',
  'utf8'
);
const boardingPage = readFileSync(
  'src/pages/admin/AdminBoardingPage.tsx',
  'utf8'
);

test('departure cancellation notifies every assigned boarding manager', () => {
  assert.match(migration, /insert into public\.personal_notifications/i);
  assert.match(migration, /select distinct\s+assignment\.manager_user_id/i);
  assert.match(migration, /assignment\.allocation_id = p_departure\.allocation_id/i);
  assert.match(migration, /assignment\.bus_id = p_departure\.bus_id/i);
  assert.match(migration, /'boarding'/i);
  assert.match(migration, /자동 미탑승 '/);
  assert.match(migration, /취소 사유: '/);
});

test('departure cancellation and notifications share one transaction', () => {
  assert.match(
    migration,
    /update public\.boarding_bus_departures[\s\S]*perform public\.notify_boarding_managers_of_departure_cancel[\s\S]*return v_restored_total/i
  );
  assert.match(notifications, /getMyPersonalNotifications/);
  assert.match(
    boardingPage,
    /event: 'INSERT', schema: 'public', table: 'personal_notifications'[\s\S]*notification\.category === 'boarding'[\s\S]*setMessage/
  );
});
