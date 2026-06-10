import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(
  'src/pages/admin/AdminBoardingManagerPage.tsx',
  'utf8'
);

test('boarding manager assignments can toggle every bus for a destination', () => {
  assert.match(page, /const handleDestinationAssignmentToggle/);
  assert.match(
    page,
    /allDestinationBusesAssigned[\s\S]*assignedBusIds\.filter[\s\S]*new Set/
  );
  assert.match(
    page,
    /aria-label=\{`\$\{destination\}행 버스 전체 선택`\}/
  );
  assert.match(page, /input\.indeterminate =/);
});
