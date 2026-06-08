import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const announcementService = readFileSync(
  'src/lib/announcementService.ts',
  'utf8'
);

test('published announcement queries enforce the schedule for global admins too', () => {
  assert.match(
    announcementService,
    /\.or\(`publish_start_at\.is\.null,publish_start_at\.lte\.\$\{now\}`\)/
  );
  assert.match(
    announcementService,
    /\.or\(`publish_end_at\.is\.null,publish_end_at\.gt\.\$\{now\}`\)/
  );

  const startFilter = announcementService.indexOf('publish_start_at.is.null');
  const endFilter = announcementService.indexOf('publish_end_at.is.null');
  const limit = announcementService.indexOf('.limit(limit)');

  assert.ok(startFilter < limit);
  assert.ok(endFilter < limit);
});
