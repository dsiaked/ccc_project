import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const signupPage = readFileSync('src/pages/SignupPage.tsx', 'utf8');
const signupPageStyles = readFileSync('src/pages/SignupPage.module.css', 'utf8');

test('signup tells non-CCC members to select the campus they came with', () => {
  assert.match(signupPage, /본인이 CCC 회원이 아닌 경우/);
  assert.match(signupPage, /함께 온 캠퍼스의 지구·팀·캠퍼스/);
  assert.match(signupPage, /className=\{styles\.affiliationGuide\}/);
  assert.match(signupPageStyles, /\.affiliationGuide\s*\{/);
});
