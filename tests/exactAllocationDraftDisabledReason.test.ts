import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('draft creation button displays its disabled reason', () => {
  const source = readFileSync(
    'src/pages/admin/AdminExactAllocationPage.tsx',
    'utf8'
  );

  assert.match(source, /const draftCreationDisabledReason = creatingDraft/);
  assert.match(source, /disabled=\{draftCreationDisabledReason !== null\}/);
  assert.match(source, /title=\{draftCreationDisabledReason \?\? undefined\}/);
  assert.match(source, /\{draftCreationDisabledReason && \(/);
  assert.match(source, /현재 생성할 수 없는 이유/);
});
