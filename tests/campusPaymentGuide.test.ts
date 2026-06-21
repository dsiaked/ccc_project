import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const campusPage = readFileSync('src/pages/admin/AdminCampusPage.tsx', 'utf8');
const adminService = readFileSync('src/lib/adminService.ts', 'utf8');
const campusPageStyles = readFileSync(
  'src/pages/admin/AdminCampusPage.module.css',
  'utf8'
);

test('campus payment guide explains the full transfer workflow', () => {
  for (const text of [
    '사전 준비 단계',
    '입금 계좌 등록',
    '서울지구 소속이 아니더라도 본인 캠퍼스와 함께 온 친구들은 본인',
    '캠퍼스로 회원가입하도록 안내해주세요.',
    '신청자 입금 확인',
    '서울지구 계좌로 송금 후 &quot;송금 완료&quot; 누르기',
    '완료 보고 이후',
    '추가 송금',
    '송금 완료 보고 취소',
    '증가 금액만 추가 송금',
  ]) {
    assert.match(campusPage, new RegExp(text));
  }
});

test('campus preparation items share one checklist card language', () => {
  assert.match(campusPage, /className=\{styles\.preparationItemHeader\}/);
  assert.match(campusPage, /가입 캠퍼스를 확인해주세요/);
  assert.match(campusPage, /확인 필요/);
  assert.match(campusPage, /hasSavedPaymentAccount \? '등록 완료' : '등록 필요'/);
  assert.match(campusPageStyles, /\.preparationItem\s*\{/);
  assert.match(campusPageStyles, /\.preparationStatusComplete\s*\{/);
  assert.match(campusPageStyles, /\.preparationStatusRequired\s*\{/);
});

test('campus payment guide shows a three-step summary with the detailed workflow', () => {
  assert.match(campusPage, /className=\{styles\.guideSummarySteps\}/);
  assert.match(campusPage, /<strong>계좌 등록<\/strong>/);
  assert.match(campusPage, /<strong>입금 확인<\/strong>/);
  assert.match(campusPage, /<strong>본부 송금<\/strong>/);
  assert.match(campusPage, /className=\{styles\.guideCloseButton\}/);
  assert.match(campusPage, /onClick=\{\(\) => setIsGuideOpen\(false\)\}/);
  assert.match(
    campusPage,
    /\{isGuideOpen && \(\s*<div id="campus-payment-guide" className=\{styles\.guideSection\}>/
  );
  assert.doesNotMatch(campusPage, /SHOW_DETAILED_PAYMENT_GUIDE/);
  assert.match(campusPageStyles, /\.guideCloseButton\s*\{/);
});

test('campus payment guide clearly separates and emphasizes workflow steps', () => {
  assert.match(
    campusPageStyles,
    /\.guidePanel\s*\{[\s\S]*border-top:\s*1px solid #dbe3ed;[\s\S]*border-bottom:\s*1px solid #dbe3ed;/
  );
  assert.match(campusPage, /className=\{styles\.guideStepHeading\}/);
  assert.match(campusPage, /className=\{styles\.guideStepNumber\}>0<\/span>/);
  assert.match(campusPage, /className=\{styles\.guideStepNumber\}>4<\/span>/);
  assert.match(campusPageStyles, /\.guideSection > \.guideStep\s*\{/);
  assert.match(campusPageStyles, /\.guideStepNumber\s*\{/);
  assert.match(campusPageStyles, /\.guideStepPreparation \.guideStepNumber\s*\{/);
  assert.match(
    campusPageStyles,
    /\.preparationItem\s*\{[\s\S]*background:\s*transparent;/
  );
});

test('campus payment account button communicates registration, edits, and saved state', () => {
  assert.match(campusPage, /setIsPaymentAccountDirty\(true\)/);
  assert.match(campusPage, /setIsPaymentAccountDirty\(false\)/);
  assert.match(campusPage, /입금 받을 계좌 등록/);
  assert.match(campusPage, /변경 내용 저장/);
  assert.match(campusPage, /저장 완료/);
  assert.match(campusPageStyles, /\.paymentAccountSaveButton\s*\{/);
  assert.match(campusPageStyles, /\.paymentAccountSavedButton\s*\{/);
});

test('campus payment guide omits the Seoul district depositor-name instruction', () => {
  assert.doesNotMatch(
    campusPage,
    /서울지구 송금 입금자명: 공백 없이 캠퍼스명 뒤에 담당자명/
  );
  assert.doesNotMatch(campusPageStyles, /\.guideDepositName\s*\{/);
});

test('campus transfer reports are available only after the reservation deadline', () => {
  assert.match(campusPage, /getReservationDeadline\(\)/);
  assert.match(
    campusPage,
    /canSendCampusTransfer &&\s*isReservationDeadlineClosed &&\s*hasDistrictTransferAccount/
  );
  assert.match(campusPage, /신청 마감 후 송금 완료를 보고할 수 있습니다\./);
});

test('campus transfer copy explains the current action without duplicate report jargon', () => {
  for (const text of [
    '신청자 입금 확인 중',
    '본부 송금 가능',
    '본부 확인 대기 중',
    '정산 완료',
    '추가 송금 필요',
    '송금 완료 보고하기',
    '추가 송금 완료 보고하기',
    '송금할 금액',
    '신청자 입금 확인',
    '명 입금 확인 필요',
    '신청 마감 후 보고 가능',
  ]) {
    assert.match(campusPage, new RegExp(text));
  }

  assert.doesNotMatch(
    campusPage,
    /<p className=\{styles\.transferTitle\}>본부 송금 보고/
  );
  assert.doesNotMatch(campusPage, /className=\{`\$\{styles\.transferStatusBox\}/);
  assert.match(campusPageStyles, /\.transferStatusReady\s*\{/);
});

test('campus transfer account, amount, and payment count share one concise summary', () => {
  assert.match(campusPage, /<dl className=\{styles\.transferSummary\}>/);
  assert.match(campusPage, /<dt>송금 계좌<\/dt>/);
  assert.match(campusPage, /'송금할 금액'/);
  assert.match(campusPage, /<dt>신청자 입금 확인<\/dt>/);
  assert.doesNotMatch(campusPage, /styles\.transferAccountBox/);
  assert.doesNotMatch(campusPage, /styles\.transferSummaryGrid/);
  assert.match(campusPageStyles, /\.transferSummary\s*\{/);
});

test('campus transfer warning explains the exact action required before editing', () => {
  assert.match(
    campusPage,
    /송금 완료를 보고한 뒤에는 신청자 입금 확인을 수정할 수 없습니다\./
  );
  assert.match(
    campusPage,
    /수정이 필요하면 본부 확인 전에 송금 완료 보고를 취소해주세요\./
  );
  assert.doesNotMatch(campusPage, /신청자 입금 상태가 잠/);
});

test('campus payment management excludes cancelled reservations', () => {
  assert.match(
    adminService,
    /\.eq\('campus', campus\)\s*\.neq\('status', 'cancelled'\)/
  );
});

test('campus payment management uses the same card workflow on every screen size', () => {
  assert.match(campusPage, /className=\{styles\.mobileBulkCheck\}/);
  assert.match(campusPage, /className=\{styles\.mobileApplicantList\}/);
  assert.match(campusPage, /href=\{`tel:\$\{reservation\.phone\}`\}/);
  assert.match(campusPageStyles, /\.mobileBulkCheck\s*\{\s*display: flex;/);
  assert.match(campusPageStyles, /\.mobileApplicantList\s*\{\s*display: grid;/);
  assert.match(campusPageStyles, /\.tableContainer\s*\{\s*display: none;/);
  assert.doesNotMatch(campusPageStyles, /@media \(max-width: 768px\)/);
});

test('campus applicant list stays compact with search, filters, and pagination', () => {
  assert.match(campusPage, /const APPLICANT_PAGE_SIZE = 10/);
  assert.match(campusPage, /const filteredReservations = useMemo/);
  assert.match(campusPage, /const pagedReservations = filteredReservations\.slice/);
  assert.match(campusPage, /placeholder="이름, 연락처, 행선지, 배차 검색"/);
  assert.match(campusPage, /className=\{styles\.applicantPagination\}/);
  assert.match(campusPageStyles, /\.applicantFilters\s*\{/);
  assert.match(campusPageStyles, /\.applicantPagination\s*\{/);
});

test('quick payment names are sorted in Korean alphabetical order only', () => {
  assert.match(campusPage, /const quickPaymentReservations = useMemo/);
  assert.match(campusPage, /\[\.\.\.reservations\]\.sort/);
  assert.match(campusPage, /left\.name\.localeCompare\(right\.name, 'ko-KR'\)/);
  assert.match(campusPage, /quickPaymentReservations\.map\(\(reservation\) =>/);
  assert.match(campusPage, /reservations\.forEach\(\(reservation, index\) =>/);
  assert.match(
    campusPageStyles,
    /\.quickPaymentButtons\s*\{[\s\S]*max-height:\s*360px;[\s\S]*overflow-y:\s*auto;/
  );
});

test('campus payment workflow is presented as one flat payment roster', () => {
  assert.match(campusPage, /className=\{styles\.paymentRoster\}/);
  assert.match(campusPage, /신청자 입금 명단/);
  assert.match(campusPage, /maskPhoneNumber\(reservation\.phone\)/);
  assert.match(campusPage, /className=\{styles\.paymentRosterRows\}/);
  assert.match(campusPageStyles, /\.paymentRosterRow\s*\{/);
  assert.doesNotMatch(
    campusPageStyles,
    /\.paymentRosterRows\s*\{[^}]*overscroll-behavior:\s*contain;/
  );
  assert.match(campusPage, /className=\{styles\.paymentRosterTitleRow\}/);
  assert.match(campusPage, /className=\{styles\.paymentRosterPngButton\}/);
  assert.match(campusPageStyles, /\.paymentRosterPngButton\s*\{/);
  assert.match(
    campusPageStyles,
    /\.quickPaymentPanel\s*\{\s*display:\s*none !important;/
  );
  assert.match(
    campusPageStyles,
    /\.listToolbar,\s*\n\.applicantListContent\s*\{\s*display:\s*none !important;/
  );
});

test('name-only quick payment buttons toggle confirmed payments', () => {
  assert.match(campusPage, /aria-label="빠른 입금 확인"/);
  assert.match(campusPage, /초록색 이름을 다시\s*누르면 미입금으로 되돌립니다\./);
  assert.match(campusPage, /const handleQuickPaymentToggle =/);
  assert.match(
    campusPage,
    /입금 확인을 취소하고 미입금으로 되돌릴까요\?/
  );
  assert.match(campusPage, /handleQuickPaymentToggle\(reservation, isCompleted\)/);
  assert.match(campusPage, /handleDirectPaymentCheck\(reservation, !isCompleted\)/);
  assert.match(campusPage, /verifying \|\| isRefunded \|\| isPaymentCheckLocked/);
  assert.doesNotMatch(
    campusPage,
    /verifying \|\| isCompleted \|\| isRefunded \|\| isPaymentCheckLocked/
  );
  assert.match(campusPageStyles, /\.quickPaymentButtonCompleted\s*\{/);
});

test('name-only quick payment buttons warn about duplicate applicant names', () => {
  assert.match(campusPage, /const duplicateApplicantNames = useMemo/);
  assert.match(campusPage, /\.filter\(\(\[, count\]\) => count > 1\)/);
  assert.match(campusPage, /duplicateApplicantNames\.has\(/);
  assert.match(campusPage, /isDuplicateName \? ' 동명이인' : ''/);
  assert.match(campusPage, /className=\{styles\.quickPaymentDuplicate\}/);
  assert.match(campusPageStyles, /\.quickPaymentDuplicate\s*\{/);
});

test('campus bulk payment changes only the current filter results after confirmation', () => {
  assert.match(
    campusPage,
    /const filteredCheckableReservations = useMemo\(\(\) => \{[\s\S]*return filteredReservations\.filter/
  );
  assert.match(campusPage, /setPendingBulkPaymentStatus\(checked\)/);
  assert.match(campusPage, /role="dialog"/);
  assert.match(campusPage, /변경 대상/);
  assert.match(campusPage, /변경 후 상태/);
  assert.doesNotMatch(campusPage, /현재 필터 결과의 신청자[\s\S]*window\.confirm/);
  assert.match(
    campusPage,
    /filteredCheckableReservations\.map\(\(reservation\) =>/
  );
  assert.match(campusPage, /<strong>현재 필터 결과 입금 확인<\/strong>/);
  assert.doesNotMatch(
    campusPage,
    /checkableReservations\.map\(\(reservation\) =>/
  );
});

test('campus applicant list owns the payment progress summary', () => {
  const listToolbar = campusPage.slice(
    campusPage.indexOf('<div className={styles.listToolbar}>'),
    campusPage.indexOf('{isApplicantListOpen && (')
  );

  assert.match(listToolbar, /className=\{styles\.paymentRatioCard\}/);
  assert.match(listToolbar, /입금 진행률/);
  assert.doesNotMatch(campusPage, /className=\{styles\.statsBar\}/);
  assert.doesNotMatch(campusPageStyles, /\.statsBar\s*\{/);
});

test('campus administrator page is visually identified as a dedicated workspace', () => {
  assert.match(campusPage, /<h1>캠퍼스 회계<\/h1>/);
  assert.match(campusPage, /신청자 입금 확인과 본부 송금을 관리합니다/);
  assert.match(campusPageStyles, /\.headerTitleRow\s*\{/);
  assert.match(campusPageStyles, /\.header \.guidePanel\s*\{/);
});

test('global-only campus controls are separated from the campus administrator view', () => {
  assert.match(campusPage, /전체 관리자 전용 도구/);
  assert.match(campusPage, /이 영역은 캠퍼스 회계 순장님에게 보이지 않습니다/);
  assert.match(campusPage, /아래부터 캠퍼스 회계 순장님이 보는 화면입니다/);
  assert.match(campusPage, /캠퍼스 회계 순장님 요청 전에는 수정하지 마세요/);
  assert.match(campusPageStyles, /\.globalAdminPanel\s*\{/);
  assert.match(campusPageStyles, /border-top: 5px solid #d97706/);
});

test('the complete campus administrator view is framed only for global administrators', () => {
  assert.match(
    campusPage,
    /activeAdminRole\?\.role === 'global_admin'[\s\S]*\? styles\.campusAdminWorkspace[\s\S]*: undefined/
  );
  assert.match(campusPage, /aria-label="캠퍼스 회계 순장님 운영 화면"/);
  assert.match(campusPageStyles, /\.campusAdminWorkspace\s*\{/);
  assert.match(campusPageStyles, /border: 3px solid #6fb99d/);
});
