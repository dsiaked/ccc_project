import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const communicationsPage = readFileSync(
  'src/pages/admin/AdminCampusRequestsPage.tsx',
  'utf8'
);
const homeAnnouncementManager = readFileSync(
  'src/pages/admin/HomeAnnouncementManager.tsx',
  'utf8'
);

test('communications tab changes refresh board data without replacing the page with loading state', () => {
  const loadRequestsStart = communicationsPage.indexOf(
    'const loadRequests = async'
  );
  const loadSummaryStart = communicationsPage.indexOf(
    'const loadSummary = async'
  );
  const loadRequestsBody = communicationsPage.slice(
    loadRequestsStart,
    loadSummaryStart
  );

  assert.doesNotMatch(loadRequestsBody, /setLoading\(true\)/);
  assert.match(loadRequestsBody, /setLoading\(false\)/);
});

test('home announcement data stays visible while tabs remount or refresh it', () => {
  assert.match(
    homeAnnouncementManager,
    /let cachedHomeAnnouncements: HomeAnnouncement\[\] \| null = null;/
  );
  assert.match(
    homeAnnouncementManager,
    /\(\) => cachedHomeAnnouncements \?\? \[\]/
  );
  assert.match(homeAnnouncementManager, /setRefreshing\(true\)/);
  assert.doesNotMatch(
    homeAnnouncementManager,
    /const loadAnnouncements = async \(\) => \{\s*setLoading\(true\)/
  );
});
