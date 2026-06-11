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
    /<span>소속<\/span>/
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

test('profile page uses read mode until the user starts editing basic information', () => {
  assert.match(page, /const \[isEditing, setIsEditing\] = useState\(false\)/);
  assert.match(page, /!isEditing && \(/);
  assert.match(page, /onClick=\{\(\) => setIsEditing\(true\)\}/);
  assert.match(page, />\s*수정\s*<\/button>/);
  assert.match(page, /isEditing \? \(/);
  assert.match(page, /<span>이름<\/span>/);
  assert.match(page, /<span>연락처<\/span>/);
  assert.match(page, /handleCancelEdit/);
  assert.match(page, />\s*취소\s*<\/button>/);
});

test('profile page only enables saving for changed values and shows transient success feedback', () => {
  assert.match(page, /const hasChanges = Boolean\(/);
  assert.match(page, /disabled=\{saving \|\| !hasChanges\}/);
  assert.match(page, /window\.setTimeout\(\(\) => setSuccess\(''\), 3000\)/);
  assert.match(page, /className=\{styles\.toast\}/);
  assert.match(page, /\{saving \? '저장 중\.\.\.' : '저장'\}/);
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

test('profile page includes affiliation in basic information and progressively discloses CCC technical fields', () => {
  assert.ok(
    page.indexOf('<span>소속</span>') <
      page.indexOf('<h2>CCC Summer 연결 정보</h2>')
  );
  assert.match(page, /<h2>기본 정보<\/h2>/);
  assert.doesNotMatch(page, /버스 소속 정보|현재 버스 소속/);
  assert.match(page, /<details className=\{styles\.technicalDetails\}>/);
  assert.match(page, /<summary>기술 정보 보기<\/summary>/);
  assert.match(page, /cccSummerLoading/);
  assert.match(page, /다시 불러오기/);
  assert.match(page, /CCC 스태프 여부/);
  assert.match(page, /스태프 아님/);
  assert.match(page, /CCC에 등록된 정보로 변경될 수 있습니다\./);
});
