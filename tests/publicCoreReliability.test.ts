import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const notificationService = readFileSync(
  'src/lib/personalNotificationService.ts',
  'utf8'
);
const homeDeadlineBanner = readFileSync(
  'src/components/HomeDeadlineBanner.tsx',
  'utf8'
);

test('personal notification loads expose authentication and permission failures', () => {
  assert.match(notificationService, /error: userError/);
  assert.match(notificationService, /if \(userError\) throw userError/);
  assert.match(
    notificationService,
    /if \(error\.code === '42P01' \|\| error\.code === 'PGRST205'\)/
  );
  assert.doesNotMatch(
    notificationService,
    /error\.message\.includes\('personal_notifications'\)/
  );
});

test('home deadline banner stays hidden until a deadline or retryable error exists', () => {
  assert.match(
    homeDeadlineBanner,
    /if \(loading \|\| \(!deadlineAt && !loadError\)\) return null/
  );
  assert.match(homeDeadlineBanner, /마감 정보를 확인하지 못했습니다/);
  assert.match(homeDeadlineBanner, /다시 시도/);
  assert.doesNotMatch(
    homeDeadlineBanner,
    /신청 마감 일시가 아직 설정되지 않았습니다/
  );
});
