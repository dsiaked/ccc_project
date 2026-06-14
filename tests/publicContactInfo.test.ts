import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const contactService = readFileSync('src/lib/contactInfoService.ts', 'utf8');
const footer = readFileSync('src/components/Footer.tsx', 'utf8');
const sidebar = readFileSync('src/components/Sidebar.tsx', 'utf8');
const reservationPage = readFileSync('src/pages/ReservationPage.tsx', 'utf8');
const setupPage = readFileSync(
  'src/pages/admin/AdminSetupCheckPage.tsx',
  'utf8'
);
const setupSql = readFileSync('sql/setup/186_public_contact_info.sql', 'utf8');
const migrationSql = readFileSync(
  'sql/setup/186_public_contact_info.sql',
  'utf8'
);

test('public contact info uses a narrow anonymous RPC and global-admin-only writes', () => {
  assert.equal(migrationSql, setupSql);
  assert.match(contactService, /get_public_contact_info/);
  assert.match(contactService, /update_app_setting_as_global_admin/);
  assert.match(setupSql, /security definer[\s\S]*get_public_contact_info/i);
  assert.match(
    setupSql,
    /grant execute on function public\.get_public_contact_info\(\)[\s\S]*to anon, authenticated, service_role/
  );
  assert.match(setupSql, /'public_contact_info'/);
});

test('public contact details stay hidden when operations has not saved them', () => {
  for (const source of [footer, sidebar, reservationPage]) {
    assert.match(source, /contactInfo\.email \|\| contactInfo\.phone/);
    assert.doesNotMatch(source, /info@ccc-bus\.org|02-1234-5678/);
  }
});

test('operations settings can save or clear public contact details', () => {
  assert.match(setupPage, /사용자 문의처/);
  assert.match(setupPage, /updateContactInfo\(contactInfoInput\)/);
  assert.match(setupPage, /둘 다 비우면 문의 정보가 숨겨집니다/);
});
