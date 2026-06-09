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
  assert.match(reviewPage, /<option value="all">모든 캠퍼스<\/option>/);
  assert.match(reviewPage, /<option value="review-needed">확인 필요만<\/option>/);
  assert.match(reviewPage, /<th>송금 정산 상태<\/th>/);
  assert.doesNotMatch(reviewPage, /본부 송금 상태/);
  assert.match(reviewPage, /confirmCampusTransferById/);
  assert.match(reviewPage, /revertCampusTransferConfirmationById/);
});

test('campus settlement and personal unpaid lists are separated into accessible tabs', () => {
  assert.match(reviewPage, /useState<ReviewTab>\('campuses'\)/);
  assert.match(reviewPage, /role="tablist"/);
  assert.match(reviewPage, /캠퍼스 정산/);
  assert.match(reviewPage, /개인 미입금 명단/);
  assert.match(reviewPage, /activeTab === 'campuses' &&/);
  assert.match(reviewPage, /activeTab === 'people' &&/);
  assert.match(reviewPage, /role="tabpanel"/);
});

test('personal unpaid rows can be marked paid from the consolidated review', () => {
  assert.match(reviewPage, /handleConfirmPerson/);
  assert.match(reviewPage, /createOrUpdatePaymentStatus/);
  assert.match(reviewPage, /confirmRemainingSeatPayment/);
  assert.match(
    reviewPage,
    /const needsRemainingSeatConfirmation =[\s\S]*person\.remainingSeatStatus !== 'confirmed'[\s\S]*person\.reservationStatus === 'confirmed'[\s\S]*person\.confirmedTicket[\s\S]*if \([\s\S]*needsRemainingSeatConfirmation[\s\S]*confirmRemainingSeatPayment/
  );
  assert.match(reviewService, /remainingSeatStatus: getRemainingSeatStatus\(row\.data\)/);
  assert.match(reviewPage, /입금 완료 처리/);
});

test('payment review surfaces structured Supabase error messages', () => {
  assert.match(reviewPage, /const getErrorMessage = \(error: unknown/);
  assert.match(reviewPage, /'message' in error/);
  assert.match(
    reviewPage,
    /개인 입금 완료 처리 중 오류가 발생했습니다: \$\{getErrorMessage\(error\)\}/
  );
});

test('summary combines campus review counts and shows unpaid people out of all review targets', () => {
  assert.match(reviewPage, /<span>정산 확인 완료 \/ 확인 필요 캠퍼스<\/span>/);
  assert.match(
    reviewPage,
    /\{campusSummary\.confirmed\.toLocaleString\(\)\} \/[\s\S]*\{campusSummary\.reviewNeeded\.toLocaleString\(\)\}곳/
  );
  assert.doesNotMatch(reviewPage, /<span>확인 필요 캠퍼스<\/span>/);
  assert.match(reviewPage, /<span>개인 미입금 \/ 전체 확인 대상<\/span>/);
  assert.match(
    reviewPage,
    /\{review\.unpaidReservations\.length\.toLocaleString\(\)\} \/[\s\S]*\{review\.totalIndividualReviewTargets\.toLocaleString\(\)\}명/
  );
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
