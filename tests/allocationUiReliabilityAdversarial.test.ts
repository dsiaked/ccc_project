import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const exactAllocationPage = readFileSync(
  'src/pages/admin/AdminExactAllocationPage.tsx',
  'utf8'
);
const workspacePage = readFileSync(
  'src/pages/admin/AdminAllocationWorkspacePage.tsx',
  'utf8'
);

test('allocation calculation mutations reject duplicate clicks and remain retryable', () => {
  assert.match(
    exactAllocationPage,
    /const jobMutationInFlightRef = useRef\(false\)/
  );
  assert.match(exactAllocationPage, /const startInFlightRef = useRef\(false\)/);
  assert.match(
    exactAllocationPage,
    /jobMutationInFlightRef\.current \|\| startInFlightRef\.current[\s\S]*startInFlightRef\.current = true;[\s\S]*createExactAllocationJob[\s\S]*startInFlightRef\.current = false/
  );
  assert.match(exactAllocationPage, /const cancelInFlightRef = useRef\(false\)/);
  assert.match(
    exactAllocationPage,
    /!currentJob \|\|[\s\S]*jobMutationInFlightRef\.current \|\|[\s\S]*cancelInFlightRef\.current[\s\S]*cancelInFlightRef\.current = true;[\s\S]*cancelExactAllocationJob\(jobId\)[\s\S]*cancelInFlightRef\.current = false/
  );
  assert.match(
    exactAllocationPage,
    /const detailedBalanceInFlightRef = useRef\(false\)[\s\S]*detailedBalanceInFlightRef\.current = true;[\s\S]*createDetailedBalanceJob[\s\S]*detailedBalanceInFlightRef\.current = false/
  );
});

test('calculation start, cancellation, detailed balance, and reset are mutually exclusive', () => {
  assert.match(
    exactAllocationPage,
    /handleStart = async \(\) => \{[\s\S]*jobMutationInFlightRef\.current[\s\S]*jobMutationInFlightRef\.current = true;[\s\S]*createExactAllocationJob[\s\S]*jobMutationInFlightRef\.current = false/
  );
  assert.match(
    exactAllocationPage,
    /handleCancel = async \(\) => \{[\s\S]*jobMutationInFlightRef\.current[\s\S]*jobMutationInFlightRef\.current = true;[\s\S]*cancelExactAllocationJob[\s\S]*jobMutationInFlightRef\.current = false/
  );
  assert.match(
    exactAllocationPage,
    /confirmReset = async \(\) => \{[\s\S]*jobMutationInFlightRef\.current[\s\S]*jobMutationInFlightRef\.current = true;[\s\S]*resetExactAllocationJobs[\s\S]*jobMutationInFlightRef\.current = false/
  );
});

test('selecting a calculation invalidates stale list and polling responses', () => {
  assert.match(
    exactAllocationPage,
    /const requestRevision = jobsStateRevisionRef\.current \+ 1;\s*jobsStateRevisionRef\.current = requestRevision;\s*setCalculationViewReset\(false\);\s*setCurrentJob\(job\);[\s\S]*getExactAllocationJob\(job\.id\)[\s\S]*requestRevision === jobsStateRevisionRef\.current/
  );
});

test('overlapping allocation list and active-job polls ignore older responses', () => {
  assert.match(
    exactAllocationPage,
    /const recentJobsRequestIdRef = useRef\(0\)[\s\S]*const requestId = \+\+recentJobsRequestIdRef\.current[\s\S]*requestId !== recentJobsRequestIdRef\.current/
  );
  assert.match(
    exactAllocationPage,
    /const activeJobPollRequestIdRef = useRef\(0\)[\s\S]*const requestId = \+\+activeJobPollRequestIdRef\.current[\s\S]*requestId !== activeJobPollRequestIdRef\.current/
  );
  assert.match(
    exactAllocationPage,
    /const detail = await getExactAllocationJob\(targetJob\.id\);[\s\S]*currentJobRequestId !== currentJobRequestIdRef\.current/
  );
});

test('late mutation responses do not replace a newer selected calculation', () => {
  assert.match(
    exactAllocationPage,
    /const actionRevision = jobsStateRevisionRef\.current;[\s\S]*cancelExactAllocationJob\(jobId\)[\s\S]*actionRevision === jobsStateRevisionRef\.current[\s\S]*setCurrentJob\(job\)/
  );
  assert.match(
    exactAllocationPage,
    /createExactAllocationJob[\s\S]*job && actionRevision === jobsStateRevisionRef\.current[\s\S]*setCurrentJob\(job\)/
  );
  assert.match(
    exactAllocationPage,
    /createDetailedBalanceJob[\s\S]*job && actionRevision === jobsStateRevisionRef\.current[\s\S]*setCurrentJob\(job\)/
  );
});

test('workspace load ignores a stale response after the allocation id changes', () => {
  assert.match(
    workspacePage,
    /useEffect\(\(\) => \{\s*let cancelled = false;[\s\S]*if \(cancelled\) return;\s*setRow\(nextRow\);[\s\S]*return \(\) => \{\s*cancelled = true;/
  );
  assert.match(
    workspacePage,
    /catch \(loadError\) \{\s*if \(cancelled\) return;/
  );
});

test('workspace save rejects duplicate clicks and releases the guard after failure', () => {
  assert.match(workspacePage, /const saveInFlightRef = useRef\(false\)/);
  assert.match(
    workspacePage,
    /if \(!row \|\| !workspace \|\| saveInFlightRef\.current\) return;[\s\S]*saveInFlightRef\.current = true;[\s\S]*saveAllocationWorkspace[\s\S]*finally \{[\s\S]*saveInFlightRef\.current = false/
  );
});
