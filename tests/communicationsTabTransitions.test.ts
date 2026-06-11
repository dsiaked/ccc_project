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
const communicationsStyles = readFileSync(
  'src/pages/admin/AdminCampusRequestsPage.module.css',
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

test('global notices use one management tab for public and campus audiences', () => {
  assert.match(communicationsPage, /type GlobalAdminTab = 'requests' \| 'notices'/);
  assert.match(communicationsPage, /<strong>공지 관리<\/strong>/);
  assert.match(communicationsPage, /<HomeAnnouncementManager \/>/);
  assert.match(communicationsPage, /<h2>캠퍼스 운영 공지<\/h2>/);
  assert.doesNotMatch(communicationsPage, /handleGlobalTabChange\('home'\)/);
});

test('global inquiry operations default to unresolved work and use one response action', () => {
  assert.match(
    communicationsPage,
    /useState<RequestStatusFilter>\(\s*'active'\s*\)/
  );
  assert.match(communicationsPage, /<span>미처리<\/span>/);
  assert.match(communicationsPage, /답변 및 상태 저장/);
  assert.doesNotMatch(communicationsPage, /<span>접수<\/span>/);
  assert.doesNotMatch(communicationsPage, /<span>처리 중<\/span>/);
  assert.doesNotMatch(communicationsPage, /<span>보류<\/span>/);
  assert.match(
    communicationsPage,
    /\{!request\.isGlobalNotice && !isGlobalAdmin && \(/
  );
});

test('global notices are edited inline instead of browser prompts', () => {
  assert.match(communicationsPage, /const startEditGlobalNotice/);
  assert.match(communicationsPage, /className=\{styles\.noticeEditPanel\}/);
  assert.doesNotMatch(communicationsPage, /window\.prompt/);
});

test('mobile communications keeps filters compact and avoids horizontal summary clipping', () => {
  assert.match(communicationsPage, /aria-controls="communications-filter-details"/);
  assert.match(communicationsPage, /styles\.filterDetailsOpen/);
  assert.match(communicationsPage, /globalAdminTab === 'notices' \? styles\.noticeFilterPanel/);
  assert.doesNotMatch(communicationsPage, /등록된 공지 \{summary\.notices\}건/);
  assert.doesNotMatch(communicationsPage, /<span>전체 조건<\/span>/);
  assert.match(communicationsPage, /전체 \{globalAdminTab === 'notices'/);
  assert.match(
    communicationsStyles,
    /@media \(max-width: 560px\)[\s\S]*?\.summaryGrid \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/
  );
  assert.match(
    communicationsStyles,
    /@media \(max-width: 560px\)[\s\S]*?\.filterDetails \{[\s\S]*?display: none;[\s\S]*?\.filterDetailsOpen \{[\s\S]*?display: grid;/
  );
});
