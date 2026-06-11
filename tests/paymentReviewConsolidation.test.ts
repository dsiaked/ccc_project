import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const reviewPage = readFileSync(
  'src/pages/admin/AdminFinalPaymentReviewPage.tsx',
  'utf8'
);
const reviewService = readFileSync(
  'src/lib/admin/finalPaymentReviewService.ts',
  'utf8'
);
const adminRoutes = readFileSync('src/routes/adminRoutes.tsx', 'utf8');
const adminHeader = readFileSync('src/pages/admin/AdminHeader.tsx', 'utf8');

test('the consolidated payment review defaults to every campus and offers a review-needed filter', () => {
  assert.match(reviewPage, /useState<CampusFilter>\('all'\)/);
  assert.match(reviewPage, /<option value="all">전체 캠퍼스<\/option>/);
  assert.match(reviewPage, /<option value="review-needed">처리 필요 캠퍼스<\/option>/);
  assert.match(reviewPage, /<option value="personal-unpaid">개인 미입금 있음<\/option>/);
  assert.match(reviewPage, /<option value="personal-paid">개인 미입금 없음<\/option>/);
  assert.match(reviewPage, /<option value="transfer-sent">캠퍼스 송금 보고 완료<\/option>/);
  assert.match(reviewPage, /<option value="confirmed">본부 확인 완료<\/option>/);
  assert.doesNotMatch(reviewPage, /transfer-unconfirmed/);
  assert.match(
    reviewPage,
    /campusFilter === 'personal-paid' &&[\s\S]*campus\.paidPeople >= campus\.totalPeople/
  );
  assert.match(reviewPage, /<th>송금 정산 상태<\/th>/);
  assert.doesNotMatch(reviewPage, /본부 송금 상태/);
  assert.match(reviewPage, /confirmCampusTransferById/);
  assert.match(reviewPage, /revertCampusTransferConfirmationById/);
});

test('campus settlement and individual review lists are separated into accessible tabs', () => {
  assert.match(reviewPage, /useState<ReviewTab>\('campuses'\)/);
  assert.match(reviewPage, /role="tablist"/);
  assert.match(reviewPage, /캠퍼스 정산/);
  assert.match(reviewPage, /개별 확인 대상 명단/);
  assert.match(reviewPage, /activeTab === 'campuses' &&/);
  assert.match(reviewPage, /activeTab === 'people' &&/);
  assert.match(reviewPage, /role="tabpanel"/);
});

test('personal unpaid rows can be marked paid from the consolidated review', () => {
  assert.match(reviewPage, /handleConfirmPerson/);
  assert.match(reviewPage, /setPendingPersonConfirmation\(person\)/);
  assert.match(reviewPage, /createOrUpdatePaymentStatus/);
  assert.match(reviewPage, /confirmRemainingSeatPayment/);
  assert.match(
    reviewPage,
    /const needsRemainingSeatConfirmation =[\s\S]*person\.remainingSeatStatus !== 'confirmed'[\s\S]*person\.reservationStatus === 'confirmed'[\s\S]*person\.confirmedTicket[\s\S]*if \(needsRemainingSeatConfirmation\(person\)\)[\s\S]*confirmRemainingSeatPayment/
  );
  assert.match(reviewPage, /잔여 좌석 결제 확정/);
  assert.match(reviewPage, /실제 계좌 입금 내역을 확인한 뒤 처리해주세요/);
  assert.match(reviewPage, /const personConfirmationInFlightRef = useRef\(false\)/);
  assert.doesNotMatch(
    reviewPage,
    /person\.name \|\| '이름 없는 신청자'\}님의 \$\{formatCurrency\([\s\S]*window\.confirm/
  );
  assert.match(reviewService, /remainingSeatStatus: getRemainingSeatStatus\(row\.data\)/);
  assert.match(reviewPage, /입금 완료 처리/);
});

test('individual review targets remain visible after payment completion', () => {
  assert.match(
    reviewService,
    /export type FinalPaymentStatus = 'missing' \| 'pending' \| 'completed' \| 'refunded'/
  );
  assert.match(
    reviewService,
    /const individualReviewReservations =[\s\S]*individualReviewTargets\.map<IndividualReviewReservation>/
  );
  assert.match(
    reviewService,
    /payment\?\.status === 'completed'[\s\S]*\? 'completed'/
  );
  assert.match(reviewPage, /<option value="completed">입금 완료<\/option>/);
  assert.match(reviewPage, /person\.paymentStatus === 'completed' \? \(/);
  assert.match(reviewPage, /<span className=\{styles\.completedText\}>처리 완료<\/span>/);
});

test('single campus confirmation shows the campus and amount and blocks duplicate processing', () => {
  assert.match(reviewPage, /const campusConfirmationInFlightRef = useRef\(false\)/);
  assert.match(reviewPage, /setPendingCampusConfirmation\(campus\)/);
  assert.match(reviewPage, /role="dialog"/);
  assert.match(reviewPage, /입금 확인 인원/);
  assert.match(reviewPage, /확인 금액/);
  assert.match(
    reviewPage,
    /const actualConfirmedAmount = campus\.paidPeople \* review\.ticketPrice/
  );
  assert.doesNotMatch(reviewPage, /campus\.campus\}의 본부 입금을 확인할까요[\s\S]*window\.confirm/);
  assert.match(
    reviewPage,
    /campusConfirmationInFlightRef\.current = true[\s\S]*confirmCampusTransferById[\s\S]*campusConfirmationInFlightRef\.current = false/
  );
  assert.match(reviewPage, /isProcessing \? '처리 중\.\.\.' : '본부 입금 확인'/);
});

test('payment review surfaces structured Supabase error messages', () => {
  assert.match(reviewPage, /const getErrorMessage = \(error: unknown/);
  assert.match(reviewPage, /'message' in error/);
  assert.match(
    reviewPage,
    /개인 입금 완료 처리 중 오류가 발생했습니다: \$\{getErrorMessage\(error\)\}/
  );
});

test('visible sent campus bulk confirmation snapshots targets and explains scope and partial completion risk', () => {
  assert.match(reviewPage, /setPendingBulkCampusConfirmation\(targets\)/);
  assert.match(
    reviewPage,
    /const targets = pendingBulkCampusConfirmation[\s\S]*bulkCampusConfirmationInFlightRef\.current = true/
  );
  assert.match(reviewPage, /모달을 연 시점의 현재 필터·검색 결과만 처리합니다/);
  assert.match(reviewPage, /일부 캠퍼스만 완료될 수 있습니다/);
  assert.match(reviewPage, /총 확인 금액/);
  assert.match(reviewPage, /campusFilterLabels\[campusFilter\]/);
  assert.doesNotMatch(
    reviewPage,
    /현재 목록의 송금 보고 캠퍼스 \$\{targets\.length\}곳을 모두 본부 입금 확인 처리할까요\?[\s\S]*window\.confirm/
  );
});

test('campus confirmation revert explains the state change and blocks duplicate processing', () => {
  assert.match(reviewPage, /setPendingCampusRevert\(campus\)/);
  assert.match(reviewPage, /const campusRevertInFlightRef = useRef\(false\)/);
  assert.match(
    reviewPage,
    /campusRevertInFlightRef\.current = true[\s\S]*revertCampusTransferConfirmationById[\s\S]*campusRevertInFlightRef\.current = false/
  );
  assert.match(reviewPage, /실제 환불이나[\s\S]*입금 취소를 처리하는 기능은 아닙니다/);
  assert.match(reviewPage, /기존 확인 금액/);
  assert.match(reviewPage, /송금 보고됨 · 본부 재확인 필요/);
  assert.doesNotMatch(
    reviewPage,
    /campus\.campus\}의 본부 입금 확인을 취소할까요\?[\s\S]*window\.confirm/
  );
});

test('summary combines campus review counts and shows unpaid people out of all review targets', () => {
  assert.match(reviewPage, /<span>정산 확인 완료 \/ 확인 필요 캠퍼스<\/span>/);
  assert.match(
    reviewPage,
    /\{campusSummary\.confirmed\.toLocaleString\(\)\} \/[\s\S]*\{campusSummary\.reviewNeeded\.toLocaleString\(\)\}곳/
  );
  assert.doesNotMatch(reviewPage, /<span>확인 필요 캠퍼스<\/span>/);
  assert.match(reviewPage, /개인 미입금 \/ 전체 확인 대상/);
  assert.match(
    reviewPage,
    /\{unpaidIndividualReviewReservations\.length\.toLocaleString\(\)\} \/[\s\S]*\{review\.totalIndividualReviewTargets\.toLocaleString\(\)\}명/
  );
});

test('amount summary uses every active reservation including individual review targets', () => {
  assert.match(reviewService, /totalPaymentTargets: reservations\.length/);
  assert.match(
    reviewService,
    /paidPaymentTargets: reservations\.filter\([\s\S]*getPayment\(reservation\.payments\)\?\.status === 'completed'/
  );
  assert.match(
    reviewPage,
    /const expectedAmount = review\.totalPaymentTargets \* review\.ticketPrice/
  );
  assert.match(
    reviewPage,
    /const confirmedAmount = review\.paidPaymentTargets \* review\.ticketPrice/
  );
  assert.match(reviewPage, /입금 확인액 \/ 전체 입금 예정액/);
  assert.match(reviewPage, /입금 예정액 \{formatCurrency\(campusSummary\.expectedAmount\)\} = 신청 인원/);
  assert.match(reviewPage, /\{review\.totalPaymentTargets\.toLocaleString\(\)\}명 ×/);
});

test('payment review clearly identifies the all-paid state', () => {
  assert.match(
    reviewPage,
    /const hasNoUnpaidPeople =[\s\S]*!errorMessage[\s\S]*unpaidIndividualReviewReservations\.length === 0/
  );
  assert.match(reviewPage, /hasNoUnpaidPeople \? styles\.successCard : styles\.dangerCard/);
  assert.match(reviewPage, /개인 미입금 없음/);
  assert.match(reviewPage, /전원 입금 완료/);
  assert.match(reviewPage, /입금 완료 처리 후에도 이 명단에 남아 상태를 확인할 수 있습니다/);
});

test('campus settlement does not show the former campus administrator request warning', () => {
  assert.doesNotMatch(reviewPage, /캠퍼스 회계 순장님 요청을 먼저 확인해주세요/);
  assert.doesNotMatch(
    reviewPage,
    /캠퍼스 회계 순장님의 요청이 접수되기 전에는 전체 관리자가 입금 상태/
  );
});

test('the former campus transfer route and navigation resolve to the consolidated review', () => {
  assert.match(
    adminRoutes,
    /path: 'payments\/campus-transfers'[\s\S]*RedirectWithSearch to="\/admin\/payments\/final-review"/
  );
  assert.doesNotMatch(adminRoutes, /AdminCampusTransferPage/);
  assert.match(adminHeader, /label: '개인 입금 · 캠퍼스별 송금 관리'/);
  assert.doesNotMatch(adminHeader, /label: '캠퍼스 송금 확인'/);
});
