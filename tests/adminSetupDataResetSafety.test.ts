import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('src/pages/admin/AdminSetupCheckPage.tsx', 'utf8');

test('admin data reset uses a typed-confirmation safety modal', () => {
  assert.match(page, /setDataResetDialogOpen\(true\)/);
  assert.match(page, /role="dialog"/);
  assert.match(page, /DB 정보 영구 초기화/);
  assert.match(page, /현재 화면 기준 \{selectedResetRows\.toLocaleString\(\)\}건이 삭제 대상으로/);
  assert.match(page, /삭제 후에는 복구할 수 없습니다/);
  assert.match(page, /selectedResetTargets\.map/);
  assert.match(page, /계속하려면 아래 문구를 정확히 입력하세요/);
  assert.match(
    page,
    /disabled=\{[\s\S]*resettingData \|\| dataResetConfirmInput !== resetConfirmText/
  );
  assert.doesNotMatch(page, /window\.prompt/);
});

test('admin data reset explains preserved accounts and blocks duplicate execution', () => {
  assert.match(page, /const dataResetInFlightRef = useRef\(false\)/);
  assert.match(
    page,
    /dataResetInFlightRef\.current = true[\s\S]*resetReservationData\(resetOptions\)[\s\S]*dataResetInFlightRef\.current = false/
  );
  assert.match(page, /현재 로그인한 전체 관리자 계정과 프로필만 유지되며/);
  assert.match(page, /인증 계정, 프로필, 전체 관리자 권한은 유지됩니다/);
  assert.match(page, /className=\{styles\.dataResetDialogError\} role="alert"/);
  assert.match(page, /onClick=\{\(\) => void confirmResetReservationData\(\)\}/);
});
