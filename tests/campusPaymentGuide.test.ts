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
    '0. 사전 준비 단계',
    '입금 계좌 등록',
    '서울지구 소속이 아니더라도 본인 캠퍼스와 함께 온 친구들은 본인',
    '캠퍼스로 회원가입하도록 안내해주세요.',
    '1. 신청자 입금 확인',
    '2. 서울지구 계좌로 송금 후 &quot;송금 완료&quot; 누르기',
    '3. 완료 보고 이후',
    '4. 추가 송금',
    '송금 완료 보고 취소',
    '증가 금액만 추가 송금',
  ]) {
    assert.match(campusPage, new RegExp(text));
  }
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
  assert.match(campusPage, /placeholder="이름, 연락처, 정류장, 배차 검색"/);
  assert.match(campusPage, /className=\{styles\.applicantPagination\}/);
  assert.match(campusPageStyles, /\.applicantFilters\s*\{/);
  assert.match(campusPageStyles, /\.applicantPagination\s*\{/);
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
  assert.match(campusPage, /캠퍼스 회계 순장님 전용 운영 화면/);
  assert.match(campusPage, /<h1>캠퍼스 회계 순장님 페이지<\/h1>/);
  assert.match(campusPageStyles, /\.roleBanner\s*\{/);
  assert.match(campusPageStyles, /border-top: 5px solid #047857/);
});

test('global-only campus controls are separated from the campus administrator view', () => {
  assert.match(campusPage, /전체 관리자 전용 도구/);
  assert.match(campusPage, /이 영역은 캠퍼스 회계 순장님에게 보이지 않습니다/);
  assert.match(campusPage, /아래부터 캠퍼스 회계 순장님이 보는 화면입니다/);
  assert.match(campusPage, /캠퍼스 회계 순장님 요청 전에는 수정하지 마세요/);
  assert.match(campusPageStyles, /\.globalAdminPanel\s*\{/);
  assert.match(campusPageStyles, /border-top: 5px solid #d97706/);
});

test('the complete campus administrator view is grouped in one workspace frame', () => {
  assert.match(campusPage, /className=\{styles\.campusAdminWorkspace\}/);
  assert.match(campusPage, /aria-label="캠퍼스 회계 순장님 운영 화면"/);
  assert.match(campusPageStyles, /\.campusAdminWorkspace\s*\{/);
  assert.match(campusPageStyles, /border: 3px solid #6fb99d/);
});
