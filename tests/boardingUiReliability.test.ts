import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const boardingPage = readFileSync('src/pages/admin/AdminBoardingPage.tsx', 'utf8');
const exceptionsPage = readFileSync(
  'src/pages/admin/AdminBoardingExceptionsPage.tsx',
  'utf8'
);
const managerPage = readFileSync(
  'src/pages/admin/AdminBoardingManagerPage.tsx',
  'utf8'
);

test('boarding mutations use synchronous locks to reject duplicate actions', () => {
  assert.match(
    boardingPage,
    /if \(pendingPassengerIdsRef\.current\.has\(passenger\.reservationId\)\) return;[\s\S]*pendingPassengerIdsRef\.current\.add\(passenger\.reservationId\);[\s\S]*setBoardingPassengerStatus[\s\S]*\.finally\(\(\) => \{\s*pendingPassengerIdsRef\.current\.delete\(passenger\.reservationId\)/
  );
  assert.match(
    boardingPage,
    /if \(departureActionInFlightRef\.current\) return;\s*departureActionInFlightRef\.current = true;[\s\S]*await action\(\);[\s\S]*finally \{\s*departureActionInFlightRef\.current = false;/
  );
  assert.match(
    boardingPage,
    /rotatingCodeInFlightRef\.current\) return;[\s\S]*rotatingCodeInFlightRef\.current = true;[\s\S]*rotateBoardingCheckInCode[\s\S]*finally \{\s*rotatingCodeInFlightRef\.current = false;/
  );
  assert.match(
    boardingPage,
    /if \(exceptionInFlightRef\.current\) return;[\s\S]*exceptionInFlightRef\.current = true;[\s\S]*finally \{\s*exceptionInFlightRef\.current = false;/
  );
  assert.match(
    boardingPage,
    /if \(moveRequestInFlightRef\.current\) return;[\s\S]*moveRequestInFlightRef\.current = true;[\s\S]*respondToBoardingMoveRequest[\s\S]*finally \{\s*moveRequestInFlightRef\.current = false;/
  );
});

test('note saves reject duplicate submissions and unlock after failures', () => {
  assert.match(
    boardingPage,
    /if \(savingNoteIdsRef\.current\.has\(passenger\.reservationId\)\) return;[\s\S]*savingNoteIdsRef\.current\.add\(passenger\.reservationId\);[\s\S]*updatePassengerBoardingNote[\s\S]*finally \{\s*savingNoteIdsRef\.current\.delete\(passenger\.reservationId\)/
  );
});

test('boarding refreshes ignore stale responses', () => {
  assert.match(
    boardingPage,
    /const requestRevision = \+\+snapshotRequestRevisionRef\.current;[\s\S]*if \(requestRevision !== snapshotRequestRevisionRef\.current\) return;[\s\S]*if \(requestRevision === snapshotRequestRevisionRef\.current\)/
  );
  assert.match(
    exceptionsPage,
    /const requestRevision = \+\+snapshotRequestRevisionRef\.current;[\s\S]*if \(requestRevision !== snapshotRequestRevisionRef\.current\) return;[\s\S]*if \(requestRevision === snapshotRequestRevisionRef\.current\)/
  );
  assert.match(
    managerPage,
    /const requestRevision = \+\+usersRequestRevisionRef\.current;[\s\S]*if \(requestRevision !== usersRequestRevisionRef\.current\) return;[\s\S]*if \(requestRevision === usersRequestRevisionRef\.current\) setLoading\(false\);/
  );
});

test('exception record writes share the archive action lock', () => {
  assert.match(
    exceptionsPage,
    /const handleReasonUpdate[\s\S]*actionInFlightRef\.current[\s\S]*actionInFlightRef\.current = true;[\s\S]*updateBoardingExceptionReason[\s\S]*finally \{\s*actionInFlightRef\.current = false;/
  );
  assert.match(
    exceptionsPage,
    /const handleRecordCreate[\s\S]*actionInFlightRef\.current[\s\S]*actionInFlightRef\.current = true;[\s\S]*createManualBoardingExceptionRecord[\s\S]*finally \{\s*actionInFlightRef\.current = false;/
  );
});

test('manual exception creation separates committed writes from refresh failures', () => {
  assert.match(
    exceptionsPage,
    /createManualBoardingExceptionRecord[\s\S]*finally \{[\s\S]*actionInFlightRef\.current = false;[\s\S]*\}[\s\S]*try \{[\s\S]*await loadSnapshot\(true\)[\s\S]*기록은 생성되었지만/
  );
});

test('manager assignment writes cannot overlap role mutations or duplicate saves', () => {
  assert.match(
    managerPage,
    /const handleAssignmentSave[\s\S]*if \(actionUserId \|\| roleActionInFlightRef\.current\) return;[\s\S]*roleActionInFlightRef\.current = true;[\s\S]*saveBoardingManagerBusAssignments[\s\S]*finally \{\s*roleActionInFlightRef\.current = false;/
  );
});
