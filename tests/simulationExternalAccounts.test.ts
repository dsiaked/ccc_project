import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const simulationPage = readFileSync(
  'src/pages/admin/AdminSimulationPage.tsx',
  'utf8'
);
const simulationService = readFileSync(
  'src/lib/admin/simulationService.ts',
  'utf8'
);
const simulationRunner = readFileSync(
  'supabase/functions/simulation-runner/index.ts',
  'utf8'
);

test('simulation account stage creates external-district subscribers within the general-user total', () => {
  assert.match(simulationRunner, /const EXTERNAL_USER_RATIO = 0\.05/);
  assert.match(
    simulationRunner,
    /const externalUserCount = getExternalUserCount\(userCount\)[\s\S]*const seoulUserCount = userCount - externalUserCount/
  );
  assert.match(
    simulationRunner,
    /const externalSpecs = Array\.from\([\s\S]*affiliation_type: 'external'[\s\S]*coordinator_name:[\s\S]*coordinator_phone:/
  );
  assert.match(
    simulationRunner,
    /coordinator_phone: `010-7000-\$\{String\(coordinatorSequence\)\.padStart\(4, '0'\)\}`/
  );
  assert.match(
    simulationRunner,
    /const specs = \[\.\.\.seoulGeneralSpecs, \.\.\.externalSpecs, \.\.\.adminSpecs\]/
  );
  assert.match(simulationRunner, /external_users: externalSpecs\.length/);
  assert.match(simulationRunner, /verified_external_profiles: verifiedExternalProfiles/);
});

test('simulation account stage reuses existing campus-admin roles', () => {
  assert.doesNotMatch(
    simulationRunner,
    /실제 캠퍼스 회계 순장님 권한 \$\{conflictingRoles\.length\}개가 있어 2단계를 실행할 수 없습니다/
  );
  assert.match(
    simulationRunner,
    /const existingCampusAdminRoles = \(campusAdminRoleResult\.data \?\? \[\]\)\.filter/
  );
  assert.match(
    simulationRunner,
    /const \[campusAdminRoleResult, simulationUsers\] = await Promise\.all\([\s\S]*getSimulationUsers\(serviceClient\)/
  );
  assert.match(
    simulationRunner,
    /const simulationUserIds = new Set\([\s\S]*simulationUsers\.map\(\(simulationUser\) => simulationUser\.userId\)/
  );
  assert.doesNotMatch(
    simulationRunner,
    /const \[campusAdminRoleResult, simulationProfileResult\]/
  );
  assert.match(
    simulationRunner,
    /const uncoveredCampuses = allCampuses\.filter[\s\S]*existingCampusAdminIds\.has\(campus\.campus_id\)/
  );
  assert.match(
    simulationRunner,
    /existing_campus_admin_roles: existingCampusAdminRoles\.length[\s\S]*generated_campus_admin_roles: uncoveredCampuses\.length/
  );
  assert.match(
    simulationRunner,
    /verifiedSimulationAdminRoles !== uncoveredCampuses\.length/
  );
});

test('simulation account stage reconciles existing account metadata and profiles', () => {
  assert.match(
    simulationRunner,
    /const existingUserId = existingByEmail\.get\(spec\.email\.toLowerCase\(\)\)[\s\S]*auth\.admin\.updateUserById\(existingUserId,[\s\S]*user_metadata: userMetadata/
  );
  assert.match(
    simulationRunner,
    /\.from\('profiles'\)[\s\S]*\.update\(\{[\s\S]*affiliation_type: spec\.affiliation_type,[\s\S]*coordinator_name: spec\.coordinator_name,[\s\S]*coordinator_phone: spec\.coordinator_phone/
  );
});

test('simulation reservations preserve external subscriber affiliation details', () => {
  assert.match(
    simulationRunner,
    /affiliation_type: simulationUser\.affiliation_type[\s\S]*coordinator_name: simulationUser\.coordinator_name \|\| null[\s\S]*coordinator_phone: simulationUser\.coordinator_phone \|\| null/
  );
  assert.match(
    simulationRunner,
    /affiliationType: simulationUser\.affiliation_type[\s\S]*coordinatorName: simulationUser\.coordinator_name \|\| null[\s\S]*coordinatorPhone: simulationUser\.coordinator_phone \|\| null/
  );
});

test('simulation campus transfers exclude external-district reservations', () => {
  assert.match(
    simulationRunner,
    /reservation\.affiliation_type !== 'external'[\s\S]*reservation\.status === 'requested'/
  );
  assert.match(simulationRunner, /external_reservations_excluded:/);
});

test('simulation payment and transfer stages can use existing campus admins', () => {
  assert.match(
    simulationRunner,
    /const adminByScope = new Map\(\s*\(campusAdminRoles \?\? \[\]\)\s*\.map\(\(role\) => \[getCampusKey\(role\), role\.user_id\]\)/
  );
  assert.doesNotMatch(
    simulationRunner,
    /\(campusAdminRoles \?\? \[\]\)\s*\.filter\(\(role\) => simulationUserIds\.has\(role\.user_id\)\)/
  );
});

test('simulation account preview displays external-district subscribers', () => {
  assert.match(simulationService, /externalUserCount: number/);
  assert.match(
    simulationService,
    /generalUserCount - externalUserCount/
  );
  assert.match(simulationPage, /서울 외 지구 일반 회원/);
  assert.match(simulationPage, /서울 외 지구 가입자/);
});

test('simulation account preview does not count covered campuses as new admins', () => {
  assert.match(
    simulationService,
    /\.from\('admin_roles'\)[\s\S]*\.select\('user_id,campus_id'\)[\s\S]*\.eq\('role', 'campus_admin'\)/
  );
  assert.match(
    simulationService,
    /\.like\('email', 'sim-admin-campus-%@ccc-bus\.test'\)[\s\S]*!simulationCampusAdminIds\.has\(role\.user_id\)/
  );
  assert.match(
    simulationService,
    /campusAdminCount: coveredCampusIds\.has\(campus\.campus_id\) \? 0 : 1/
  );
  assert.match(simulationPage, /기존 캠퍼스 회계 순장님 권한 재사용/);
});

test('simulation account preview and runner use the saved campus scope', () => {
  assert.match(
    simulationPage,
    /const accountReferenceConfig = preview\?\.referenceConfig \?\? referenceConfig;[\s\S]*new Set\(accountReferenceConfig\.selectedCampusIds\)/
  );
  assert.match(
    simulationService,
    /const allocationCampuses = selectedCampusIdSet\.size > 0[\s\S]*allocateGeneralUsers\(\s*allocationCampuses/
  );
  assert.match(
    simulationService,
    /\.order\('district_sort_order', \{ ascending: true \}\)[\s\S]*\.order\('campus_sort_order', \{ ascending: true \}\)/
  );
  assert.match(
    simulationRunner,
    /const assignments = buildCampusAssignments\(\s*allCampuses,\s*seoulUserCount/
  );
});
