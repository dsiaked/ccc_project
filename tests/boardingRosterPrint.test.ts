import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const boardingRosterExport = readFileSync(
  'src/utils/boardingRosterExport.ts',
  'utf8'
);

test('boarding roster PDF is paginated for A4 landscape printing', () => {
  assert.match(boardingRosterExport, /const PDF_ROWS_PER_PAGE = 38/);
  assert.match(boardingRosterExport, /chunkPassengersForPdf\(passengers\)/);
  assert.match(boardingRosterExport, /@page \{ size: A4 landscape; margin: 8mm; \}/);
  assert.match(
    boardingRosterExport,
    /\.a4-page \{ width: 281mm; height: 194mm; overflow: hidden;/
  );
  assert.match(boardingRosterExport, /thead \{ display: table-header-group; \}/);
});
