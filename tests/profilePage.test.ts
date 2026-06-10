import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sidebar = readFileSync('src/components/Sidebar.tsx', 'utf8');
const routes = readFileSync('src/routes/publicRoutes.tsx', 'utf8');
const page = readFileSync('src/pages/ProfilePage.tsx', 'utf8');
const handoffService = readFileSync('src/lib/cccSummerHandoffService.ts', 'utf8');

test('sidebar exposes a protected profile page', () => {
  assert.match(sidebar, /handleProtectedMenuClick\('\/profile'\)/);
  assert.match(routes, /path: '\/profile'/);
  assert.ok(
    sidebar.indexOf("handleProtectedMenuClick('/profile')") <
      sidebar.indexOf("handleProtectedMenuClick('/reservation')")
  );
});

test('profile page keeps authenticated users on the page when session lookup fails', () => {
  assert.match(page, /if \(sessionError\) \{\s*throw sessionError;/);
  assert.match(page, /setLoadError\(/);
  assert.match(page, /setLoadAttempt\(\(current\) => current \+ 1\)/);
  assert.doesNotMatch(
    page,
    /if \(sessionError \|\| !session\) \{[\s\S]*navigate\('\/login'/
  );
});

test('profile page loads the authenticated profile and limits edits to basic information', () => {
  assert.match(page, /\.from\('profiles'\)/);
  assert.match(
    page,
    /\.update\(\{ name: normalizedName, phone: normalizedPhone \}\)/
  );
  assert.match(
    page,
    /CCC Summer에서 받은 소속을 기준으로 버스 캠퍼스가 연결됩니다\./
  );
  assert.doesNotMatch(page, /\.update\(\{[\s\S]*campus_id/);
});

test('profile page attaches validation errors to the edited fields', () => {
  assert.match(page, /nameInputRef\.current\?\.focus\(\)/);
  assert.match(page, /phoneInputRef\.current\?\.focus\(\)/);
  assert.match(page, /aria-invalid=\{Boolean\(fieldErrors\.name\)\}/);
  assert.match(page, /aria-describedby=\{\s*fieldErrors\.name \? 'profile-name-error'/);
  assert.match(page, /id="profile-name-error"/);
  assert.match(page, /aria-invalid=\{Boolean\(fieldErrors\.phone\)\}/);
  assert.match(page, /aria-describedby=\{\s*fieldErrors\.phone \? 'profile-phone-error'/);
  assert.match(page, /id="profile-phone-error"/);
});

test('profile page displays every field received from CCC Summer', () => {
  assert.match(page, /getCccSummerLinkedProfile/);
  assert.match(page, /cccSummerProfile\.subjectId/);
  assert.match(page, /cccSummerProfile\.isStaff/);
  assert.match(page, /cccSummerProfile\.univNo/);
  assert.match(page, /cccSummerProfile\.univName/);
  assert.match(page, /cccSummerProfile\.branchNo/);
  assert.match(page, /cccSummerProfile\.branchName/);
  assert.match(handoffService, /body: \{ action: 'profile' \}/);
});

test('profile page prioritizes bus information and progressively discloses CCC technical fields', () => {
  assert.ok(
    page.indexOf('<h2>버스 소속 정보</h2>') <
      page.indexOf('<h2>CCC Summer 연결 정보</h2>')
  );
  assert.match(page, /<details className=\{styles\.technicalDetails\}>/);
  assert.match(page, /<summary>기술 정보 보기<\/summary>/);
  assert.match(page, /cccSummerLoading/);
  assert.match(page, /다시 불러오기/);
  assert.match(page, /CCC 스태프 여부/);
  assert.match(page, /스태프 아님/);
  assert.match(page, /CCC에 등록된 정보로 변경될 수 있습니다\./);
});
