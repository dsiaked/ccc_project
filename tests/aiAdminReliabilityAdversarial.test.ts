import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const reportsPage = readFileSync(
  'src/pages/admin/AdminAiOperationsReportsPage.tsx',
  'utf8'
);
const activityLogsPage = readFileSync(
  'src/pages/admin/AdminAiActivityLogsPage.tsx',
  'utf8'
);

test('AI report generation and settings saves reject same-tick duplicate actions', () => {
  assert.match(
    reportsPage,
    /if \(generationInFlightRef\.current\) return;\s*generationInFlightRef\.current = true;[\s\S]*generateAiOperationsReport[\s\S]*finally \{\s*generationInFlightRef\.current = false;/
  );
  assert.match(
    reportsPage,
    /if \(settingsSaveInFlightRef\.current \|\| !settings\) return;\s*settingsSaveInFlightRef\.current = true;[\s\S]*updateAiReportLogSettings\(settingsToSave\)[\s\S]*finally \{\s*settingsSaveInFlightRef\.current = false;/
  );
});

test('AI report generation errors survive the follow-up report refresh', () => {
  assert.match(
    reportsPage,
    /const loadReports = useCallback\(async \(clearError = true\)[\s\S]*if \(clearError\) setError\(null\);/
  );
  assert.match(
    reportsPage,
    /const generateErrorMessage =[\s\S]*await loadReports\(false\);\s*setError\(generateErrorMessage\);/
  );
});

test('AI report and activity log lists ignore stale responses', () => {
  assert.match(
    reportsPage,
    /const requestRevision = \+\+reportsRequestRevisionRef\.current;[\s\S]*if \(requestRevision !== reportsRequestRevisionRef\.current\) return;[\s\S]*if \(requestRevision === reportsRequestRevisionRef\.current\)/
  );
  assert.match(
    activityLogsPage,
    /const requestRevision = \+\+logsRequestRevisionRef\.current;[\s\S]*if \(requestRevision !== logsRequestRevisionRef\.current\) return;[\s\S]*if \(requestRevision === logsRequestRevisionRef\.current\)/
  );
  assert.match(
    activityLogsPage,
    /const resetActivityPagination = \(\) => \{\s*logsRequestRevisionRef\.current \+= 1;[\s\S]*const resetAuditPagination = \(\) => \{\s*logsRequestRevisionRef\.current \+= 1;/
  );
});

test('AI settings loads and saves cannot overwrite newer edits', () => {
  assert.match(
    reportsPage,
    /const requestRevision = \+\+settingsRequestRevisionRef\.current;\s*const editRevision = settingsEditRevisionRef\.current;[\s\S]*requestRevision !== settingsRequestRevisionRef\.current \|\|[\s\S]*editRevision !== settingsEditRevisionRef\.current/
  );
  assert.match(
    reportsPage,
    /const handleSaveSettings[\s\S]*settingsRequestRevisionRef\.current \+= 1;[\s\S]*const editRevision = settingsEditRevisionRef\.current;[\s\S]*if \(editRevision === settingsEditRevisionRef\.current\) \{\s*setSettings\(saved\);/
  );
  assert.match(
    reportsPage,
    /onChange=\{\(\) => \{\s*settingsEditRevisionRef\.current \+= 1;[\s\S]*setSettingsSaved\(false\);/
  );
});

test('AI settings remain safe while the initial settings request is pending', () => {
  assert.match(
    reportsPage,
    /setSettings\(\(current\) =>\s*current \? \{ \.\.\.current, \[key\]: !current\[key\] \} : current\s*\)/
  );
  assert.match(
    reportsPage,
    /settingsLoading \? \(\s*<p className=\{styles\.empty\}>AI 로그 설정을 불러오는 중입니다\.<\/p>/
  );
  assert.match(
    reportsPage,
    /checked=\{settings\[key\]\}\s*disabled=\{savingSettings\}/
  );
});
