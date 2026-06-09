import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('changed reservations are not displayed as an immediately reused result', () => {
  const source = readFileSync(
    'src/pages/admin/AdminExactAllocationPage.tsx',
    'utf8'
  );

  assert.match(
    source,
    /const reusedResult =\s*currentJob\?\.result_reused === true && !reservationsChanged/
  );
  assert.match(
    source,
    /job\.result_reused && !job\.reservations_changed\s*\?\s*'즉시 재사용'/
  );
  assert.match(
    source,
    /job\.result_reused && !job\.reservations_changed\s*\?\s*'저장된 최적해 사용 · 계산 생략'/
  );
});
