import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readCss = (path: string) => readFileSync(path, 'utf8');

const scrollableDialogs = [
  ['allocation workspace', 'src/pages/admin/AdminAllocationWorkspacePage.module.css', 'confirmDialog'],
  ['final payment review', 'src/pages/admin/AdminFinalPaymentReviewPage.module.css', 'confirmDialog'],
  ['remaining seat sales', 'src/pages/admin/AdminRemainingSeatSalesPage.module.css', 'confirmDialog'],
  ['personal ticket operation', 'src/pages/admin/AdminPersonalTicketPage.module.css', 'operationModal'],
  ['manual allocation draft', 'src/pages/admin/AdminExactAllocationPage.module.css', 'manualDraftModal'],
] as const;

for (const [name, path, className] of scrollableDialogs) {
  test(`${name} dialog remains scrollable inside the mobile viewport`, () => {
    const css = readCss(path);
    const rule = new RegExp(
      `\\.${className}\\s*\\{[\\s\\S]*?max-height:\\s*calc\\(100dvh\\s*-\\s*40px\\)[\\s\\S]*?overflow-y:\\s*auto[\\s\\S]*?\\}`
    );

    assert.match(css, rule);
  });
}

test('mobile confirmation sheets preserve bottom safe area', () => {
  for (const path of [
    'src/pages/admin/AdminAllocationWorkspacePage.module.css',
    'src/pages/admin/AdminFinalPaymentReviewPage.module.css',
    'src/pages/admin/AdminRemainingSeatSalesPage.module.css',
  ]) {
    const css = readCss(path);
    assert.match(css, /env\(safe-area-inset-bottom\)/);
    assert.match(css, /align-items:\s*end/);
  }
});
