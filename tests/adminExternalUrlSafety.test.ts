import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const boardingPage = readFileSync(
  'src/pages/admin/AdminBoardingPage.tsx',
  'utf8'
);

test('administrator external sheet links require HTTPS before opening', () => {
  assert.match(boardingPage, /const getSafeExternalHttpsUrl/);
  assert.match(boardingPage, /url\.protocol === 'https:'/);
  assert.match(
    boardingPage,
    /window\.open\(\s*boardingRosterGoogleSheetUrl,\s*'_blank',\s*'noopener,noreferrer'/
  );
});
