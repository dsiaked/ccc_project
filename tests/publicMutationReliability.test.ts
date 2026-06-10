import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const reservationPage = readFileSync('src/pages/ReservationPage.tsx', 'utf8');
const remainingSeatPage = readFileSync('src/pages/RemainingSeatPage.tsx', 'utf8');
const confirmedTicketPage = readFileSync(
  'src/pages/ConfirmedTicketPage.tsx',
  'utf8'
);

test('public reservation mutations reject same-tick duplicate requests', () => {
  assert.match(
    reservationPage,
    /const reservationSubmitInFlightRef = useRef\(false\)[\s\S]*const handleSubmit = async \(\) => \{[\s\S]*if \(reservationSubmitInFlightRef\.current\) return;[\s\S]*reservationSubmitInFlightRef\.current = true;[\s\S]*saveReservation\(reservation\)[\s\S]*finally \{\s*reservationSubmitInFlightRef\.current = false;/
  );
  assert.match(
    remainingSeatPage,
    /const claimInFlightRef = useRef\(false\)[\s\S]*const handleConfirmPaid = async \(\) => \{[\s\S]*if \(claimInFlightRef\.current\) return;[\s\S]*claimInFlightRef\.current = true;[\s\S]*claimRemainingSeat\([\s\S]*finally \{\s*claimInFlightRef\.current = false;/
  );
  assert.match(
    confirmedTicketPage,
    /const boardingConfirmationInFlightRef = useRef\(false\)[\s\S]*const handleConfirmBoarding = async \(\) => \{[\s\S]*boardingConfirmationInFlightRef\.current[\s\S]*boardingConfirmationInFlightRef\.current = true;[\s\S]*submitBoardingCheckInCode\(boardingCode\)[\s\S]*finally \{\s*boardingConfirmationInFlightRef\.current = false;/
  );
});
