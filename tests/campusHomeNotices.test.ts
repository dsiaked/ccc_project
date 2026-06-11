import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const homeNotices = readFileSync(
  'src/components/HomeNoticeSection.tsx',
  'utf8'
);
const campusPage = readFileSync(
  'src/pages/admin/AdminCampusPage.tsx',
  'utf8'
);
const adminRoutes = readFileSync('src/routes/adminRoutes.tsx', 'utf8');

test('campus notices appear in the home notice list with an audience tag', () => {
  assert.match(homeNotices, /getGlobalCampusNotices/);
  assert.match(homeNotices, /getUnreadCampusNotices/);
  assert.match(homeNotices, /markCampusNoticesRead/);
  assert.match(homeNotices, /캠퍼스 공지/);
  assert.match(homeNotices, /전체 공지/);
});

test('campus dashboard no longer owns notices or the legacy inquiry board', () => {
  assert.doesNotMatch(campusPage, /campusNotices/);
  assert.doesNotMatch(campusPage, /문의 게시판 열기/);
  assert.match(
    adminRoutes,
    /path: 'communications',[\s\S]*?globalAdminOnly/
  );
});
