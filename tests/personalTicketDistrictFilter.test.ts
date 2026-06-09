import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('personal ticket management supports filtering users by district', () => {
  const page = readFileSync(
    'src/pages/admin/AdminPersonalTicketPage.tsx',
    'utf8'
  );
  const service = readFileSync(
    'src/lib/admin/personalTicketService.ts',
    'utf8'
  );
  const migration = readFileSync(
    'supabase/migrations/20260610130001_130_personal_ticket_district_filter.sql',
    'utf8'
  );

  assert.match(page, /aria-label="지구"/u);
  assert.match(page, /서울 외 지구 · 전체/u);
  assert.match(page, /district:\s*districtFilter/u);
  assert.match(service, /p_district:\s*params\.district/u);
  assert.match(migration, /p_district text default 'all'/iu);
  assert.match(
    migration,
    /p_district = 'outside_seoul'[\s\S]*person\.district <> '서울지구'/iu
  );
  assert.match(migration, /'districts'/iu);
});

test('personal ticket detailed filters support checkbox multi-selection', () => {
  const page = readFileSync(
    'src/pages/admin/AdminPersonalTicketPage.tsx',
    'utf8'
  );
  const service = readFileSync(
    'src/lib/admin/personalTicketService.ts',
    'utf8'
  );
  const migration = readFileSync(
    'supabase/migrations/20260610130001_130_personal_ticket_district_filter.sql',
    'utf8'
  );

  assert.match(page, /type="checkbox"/u);
  assert.match(page, /setStatusFilters/u);
  assert.match(page, /setAdminRoleFilters/u);
  assert.match(service, /params\.status\.join\(','\) \|\| 'all'/u);
  assert.match(service, /params\.adminRole\.join\(','\) \|\| 'all'/u);
  assert.match(
    migration,
    /person\.status = any\(string_to_array\(p_status, ','\)\)/iu
  );
  assert.match(
    migration,
    /person\.role_names && string_to_array\(p_admin_role, ','\)/iu
  );
});

test('personal ticket management falls back while the new RPC migration is pending', () => {
  const service = readFileSync(
    'src/lib/admin/personalTicketService.ts',
    'utf8'
  );

  assert.match(service, /isMissingPersonalTicketRpcSignature/u);
  assert.match(service, /getLegacyCompatiblePersonalTicketPage/u);
  assert.match(service, /personalTicketRpcVersion/u);
  assert.match(service, /p_status:\s*'all'/u);
  assert.match(service, /p_admin_role:\s*'all'/u);
  assert.match(service, /matchesLegacyFilters/u);
});

test('personal ticket filters keep the current page visible while refreshing results', () => {
  const page = readFileSync(
    'src/pages/admin/AdminPersonalTicketPage.tsx',
    'utf8'
  );

  assert.match(
    page,
    /const \[hasCompletedInitialLoad, setHasCompletedInitialLoad\] = useState\(false\)/u
  );
  assert.match(page, /if \(loading && !hasCompletedInitialLoad\)/u);
  assert.match(page, /<main className=\{styles\.main\} aria-busy=\{loading\}>/u);
  assert.match(page, /필터 적용 중\.\.\./u);
});
