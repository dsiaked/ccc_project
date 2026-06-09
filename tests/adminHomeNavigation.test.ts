import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const adminHeader = readFileSync('src/pages/admin/AdminHeader.tsx', 'utf8');

test('admin sidebar logo and home button both return to the service home screen', () => {
  assert.equal(
    adminHeader.match(/onClick=\{\(\) => navigate\('\/'\)\}/g)?.length,
    2
  );
  assert.match(adminHeader, /aria-label="서비스 홈 화면으로 이동"/);
  assert.match(adminHeader, /className=\{styles\.homeButton\}/);
  assert.match(adminHeader, />홈 화면으로<\/span>/);
});
