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
  assert.match(reviewPage, /<option value="all">?꾩껜 罹좏띁??\/option>/);
  assert.match(reviewPage, /<option value="review-needed">泥섎━ ?꾩슂 罹좏띁??\/option>/);
  assert.match(reviewPage, /<option value="personal-unpaid">媛쒖씤 誘몄엯湲??덉쓬<\/option>/);
  assert.match(reviewPage, /<option value="personal-paid">媛쒖씤 誘몄엯湲??놁쓬<\/option>/);
  assert.match(reviewPage, /<option value="transfer-sent">罹좏띁???↔툑 蹂닿퀬 ?꾨즺<\/option>/);
  assert.match(reviewPage, /<option value="confirmed">蹂몃? ?뺤씤 ?꾨즺<\/option>/);
  assert.doesNotMatch(reviewPage, /transfer-unconfirmed/);
  assert.match(
    reviewPage,
    /campusFilter === 'personal-paid' &&[\s\S]*campus\.paidPeople >= campus\.totalPeople/
  );
  assert.match(reviewPage, /<th>?↔툑 ?뺤궛 ?곹깭<\/th>/);
  assert.doesNotMatch(reviewPage, /蹂몃? ?↔툑 ?곹깭/);
  assert.match(reviewPage, /confirmCampusTransferById/);
  assert.match(reviewPage, /revertCampusTransferConfirmationById/);
});

test('campus settlement and individual review lists are separated into accessible tabs', () => {
  assert.match(reviewPage, /useState<ReviewTab>\('campuses'\)/);
  assert.match(reviewPage, /role="tablist"/);
  assert.match(reviewPage, /罹좏띁???뺤궛/);
  assert.match(reviewPage, /媛쒕퀎 ?뺤씤 ???紐낅떒/);
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
  assert.match(reviewPage, /?붿뿬 醫뚯꽍 寃곗젣 ?뺤젙/);
  assert.match(reviewPage, /?ㅼ젣 怨꾩쥖 ?낃툑 ?댁뿭???뺤씤????泥섎━?댁＜?몄슂/);
  assert.match(reviewPage, /const personConfirmationInFlightRef = useRef\(false\)/);
  assert.doesNotMatch(
    reviewPage,
    /person\.name \|\| '?대쫫 ?녿뒗 ?좎껌??\}?섏쓽 \$\{formatCurrency\([\s\S]*window\.confirm/
  );
  assert.match(reviewService, /remainingSeatStatus: getRemainingSeatStatus\(row\.data\)/);
  assert.match(reviewPage, /?낃툑 ?꾨즺 泥섎━/);
});

test('individual review targets remain visible after payment completion', () => {
  assert.match(
    reviewService,
    /export type FinalPaymentStatus = [^\n]*'missing'[^\n]*'pending'[^\n]*'completed'/
  );
  assert.match(
    reviewService,
    /const individualReviewReservations =[\s\S]*individualReviewTargets\.map<IndividualReviewReservation>/
  );
  assert.match(
    reviewService,
    /payment\?\.status === 'completed'[\s\S]*\? 'completed'/
  );
  assert.match(reviewPage, /<option value="completed">?낃툑 ?꾨즺<\/option>/);
  assert.match(reviewPage, /person\.paymentStatus === 'completed' \? \(/);
  assert.match(reviewPage, /<span className=\{styles\.completedText\}>泥섎━ ?꾨즺<\/span>/);
});

test('single campus confirmation shows the campus and amount and blocks duplicate processing', () => {
  assert.match(reviewPage, /const campusConfirmationInFlightRef = useRef\(false\)/);
  assert.match(reviewPage, /setPendingCampusConfirmation\(campus\)/);
  assert.match(reviewPage, /role="dialog"/);
  assert.match(reviewPage, /?낃툑 ?뺤씤 ?몄썝/);
  assert.match(reviewPage, /?뺤씤 湲덉븸/);
  assert.match(
    reviewPage,
    /const actualConfirmedAmount = campus\.paidPeople \* review\.ticketPrice/
  );
  assert.doesNotMatch(reviewPage, /campus\.campus\}??蹂몃? ?낃툑???뺤씤?좉퉴??\s\S]*window\.confirm/);
  assert.match(
    reviewPage,
    /campusConfirmationInFlightRef\.current = true[\s\S]*confirmCampusTransferById[\s\S]*campusConfirmationInFlightRef\.current = false/
  );
  assert.match(reviewPage, /isProcessing \? '泥섎━ 以?.\.\.' : '蹂몃? ?낃툑 ?뺤씤'/);
});

test('payment review surfaces structured Supabase error messages', () => {
  assert.match(reviewPage, /const getErrorMessage = \(error: unknown/);
  assert.match(reviewPage, /'message' in error/);
  assert.match(
    reviewPage,
    /媛쒖씤 ?낃툑 ?꾨즺 泥섎━ 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎: \$\{getErrorMessage\(error\)\}/
  );
});

test('visible sent campus bulk confirmation snapshots targets and explains scope and partial completion risk', () => {
  assert.match(reviewPage, /setPendingBulkCampusConfirmation\(targets\)/);
  assert.match(
    reviewPage,
    /const targets = pendingBulkCampusConfirmation[\s\S]*bulkCampusConfirmationInFlightRef\.current = true/
  );
  assert.match(reviewPage, /紐⑤떖?????쒖젏???꾩옱 ?꾪꽣쨌寃??寃곌낵留?泥섎━?⑸땲??/);
  assert.match(reviewPage, /?쇰? 罹좏띁?ㅻ쭔 ?꾨즺?????덉뒿?덈떎/);
  assert.match(reviewPage, /珥??뺤씤 湲덉븸/);
  assert.match(reviewPage, /campusFilterLabels\[campusFilter\]/);
  assert.doesNotMatch(
    reviewPage,
    /?꾩옱 紐⑸줉???↔툑 蹂닿퀬 罹좏띁??\$\{targets\.length\}怨녹쓣 紐⑤몢 蹂몃? ?낃툑 ?뺤씤 泥섎━?좉퉴???[\s\S]*window\.confirm/
  );
});

test('campus confirmation revert explains the state change and blocks duplicate processing', () => {
  assert.match(reviewPage, /setPendingCampusRevert\(campus\)/);
  assert.match(reviewPage, /const campusRevertInFlightRef = useRef\(false\)/);
  assert.match(
    reviewPage,
    /campusRevertInFlightRef\.current = true[\s\S]*revertCampusTransferConfirmationById[\s\S]*campusRevertInFlightRef\.current = false/
  );
  assert.match(reviewPage, /湲곗〈 ?뺤씤 湲덉븸/);
  assert.match(reviewPage, /?↔툑 蹂닿퀬??쨌 蹂몃? ?ы솗???꾩슂/);
  assert.doesNotMatch(
    reviewPage,
    /campus\.campus\}??蹂몃? ?낃툑 ?뺤씤??痍⑥냼?좉퉴???[\s\S]*window\.confirm/
  );
});

test('summary combines campus review counts and shows unpaid people out of all review targets', () => {
  assert.match(reviewPage, /<span>?뺤궛 ?뺤씤 ?꾨즺 \/ ?뺤씤 ?꾩슂 罹좏띁??\/span>/);
  assert.match(
    reviewPage,
    /\{campusSummary\.confirmed\.toLocaleString\(\)\} \/[\s\S]*\{campusSummary\.reviewNeeded\.toLocaleString\(\)\}怨?/
  );
  assert.doesNotMatch(reviewPage, /<span>?뺤씤 ?꾩슂 罹좏띁??\/span>/);
  assert.match(reviewPage, /媛쒖씤 誘몄엯湲?\/ ?꾩껜 ?뺤씤 ???/);
  assert.match(
    reviewPage,
    /\{unpaidIndividualReviewReservations\.length\.toLocaleString\(\)\} \/[\s\S]*\{review\.totalIndividualReviewTargets\.toLocaleString\(\)\}紐?/
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
  assert.match(reviewPage, /?낃툑 ?뺤씤??\/ ?꾩껜 ?낃툑 ?덉젙??/);
  assert.match(reviewPage, /?낃툑 ?덉젙??\{formatCurrency\(campusSummary\.expectedAmount\)\} = ?좎껌 ?몄썝/);
  assert.match(reviewPage, /\{review\.totalPaymentTargets\.toLocaleString\(\)\}紐?횞/);
});

test('payment review clearly identifies the all-paid state', () => {
  assert.match(
    reviewPage,
    /const hasNoUnpaidPeople =[\s\S]*!errorMessage[\s\S]*unpaidIndividualReviewReservations\.length === 0/
  );
  assert.match(reviewPage, /hasNoUnpaidPeople \? styles\.successCard : styles\.dangerCard/);
  assert.match(reviewPage, /媛쒖씤 誘몄엯湲??놁쓬/);
  assert.match(reviewPage, /?꾩썝 ?낃툑 ?꾨즺/);
  assert.match(reviewPage, /?낃툑 ?꾨즺 泥섎━ ?꾩뿉????紐낅떒???⑥븘 ?곹깭瑜??뺤씤?????덉뒿?덈떎/);
});

test('campus settlement does not show the former campus administrator request warning', () => {
  assert.doesNotMatch(reviewPage, /罹좏띁???뚭퀎 ?쒖옣???붿껌??癒쇱? ?뺤씤?댁＜?몄슂/);
  assert.doesNotMatch(
    reviewPage,
    /罹좏띁???뚭퀎 ?쒖옣?섏쓽 ?붿껌???묒닔?섍린 ?꾩뿉???꾩껜 愿由ъ옄媛 ?낃툑 ?곹깭/
  );
});

test('the former campus transfer route and navigation resolve to the consolidated review', () => {
  assert.match(
    adminRoutes,
    /path: 'payments\/campus-transfers'[\s\S]*RedirectWithSearch to="\/admin\/payments\/final-review"/
  );
  assert.doesNotMatch(adminRoutes, /AdminCampusTransferPage/);
  assert.match(adminHeader, /label: '媛쒖씤 ?낃툑 쨌 罹좏띁?ㅻ퀎 ?↔툑 愿由?/);
  assert.doesNotMatch(adminHeader, /label: '罹좏띁???↔툑 ?뺤씤'/);
});
