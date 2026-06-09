import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const exactAllocationPage = readFileSync(
  'src/pages/admin/AdminExactAllocationPage.tsx',
  'utf8'
);

test('optimal result warnings are displayed with Korean messages', () => {
  assert.match(
    exactAllocationPage,
    /warning\.code === 'FIRST_CHOICE_DESTINATION_REMOVED'/
  );
  assert.match(
    exactAllocationPage,
    /warning\.code === 'BELOW_RECOMMENDED_MINIMUM'/
  );
  assert.match(exactAllocationPage, /\{formatWarningMessage\(warning\)\}/);
  assert.doesNotMatch(exactAllocationPage, /\{warning\.message\}/);
});
