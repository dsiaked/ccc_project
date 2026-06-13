import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Banknote,
  Building2,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
  Search,
  UserRoundX,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import {
  confirmCampusTransferById,
  createOrUpdatePaymentStatus,
  revertCampusTransferConfirmationById,
  type CampusTransferStat,
} from '../../lib/adminService';
import {
  getFinalPaymentReview,
  type FinalPaymentReview,
  type FinalPaymentStatus,
  type IndividualReviewReason,
} from '../../lib/admin/finalPaymentReviewService';
import { confirmRemainingSeatPayment } from '../../lib/remainingSeatService';
import { supabase } from '../../lib/supabase';
import AdminHeader from './AdminHeader';
import styles from './AdminFinalPaymentReviewPage.module.css';

type CampusFilter =
  | 'all'
  | 'review-needed'
  | 'personal-unpaid'
  | 'personal-paid'
  | 'transfer-sent'
  | 'confirmed';
type PersonFilter = 'all' | FinalPaymentStatus;
type ReviewTab = 'campuses' | 'people';
type IndividualReviewPerson =
  FinalPaymentReview['individualReviewReservations'][number];

const campusFilterLabels: Record<CampusFilter, string> = {
  all: '전체 캠퍼스',
  'review-needed': '처리 필요 캠퍼스',
  'personal-unpaid': '개인 미입금 있음',
  'personal-paid': '개인 미입금 없음',
  'transfer-sent': '캠퍼스 송금 보고 완료',
  confirmed: '본부 확인 완료',
};

const emptyReview: FinalPaymentReview = {
  ticketPrice: 0,
  totalPaymentTargets: 0,
  paidPaymentTargets: 0,
  totalIndividualReviewTargets: 0,
  paidIndividualReviewTargets: 0,
  campusTransfers: [],
  individualReviewReservations: [],
};

const formatCurrency = (amount: number) => `${amount.toLocaleString()}원`;
const formatPercentage = (percentage: number) =>
  `${percentage.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}%`;
const getErrorMessage = (error: unknown, fallback = '알 수 없는 오류') => {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return fallback;
};

const reviewReasonLabels: Record<IndividualReviewReason, string> = {
  remaining_seat: '잔여 좌석 신청',
  outside_seoul: '서울 외 지구',
  admin_created: '관리자 직접 추가',
};

const needsCampusReview = (campus: CampusTransferStat) =>
  campus.status !== 'confirmed' ||
  campus.paidPeople < campus.totalPeople ||
  campus.hasAdditionalSettlement;

const getCampusStatusLabel = (campus: CampusTransferStat) => {
  if (campus.hasAdditionalSettlement) return '추가 송금 필요';
  if (campus.status === 'confirmed') return '정산 확인 완료';
  if (campus.status === 'sent') return '송금 보고됨';
  if (campus.totalPeople > 0 && campus.paidPeople === campus.totalPeople) {
    return '송금 보고 대기';
  }

  return '개인 입금 확인 중';
};

const AdminFinalPaymentReviewPage = () => {
  const navigate = useNavigate();
  const [review, setReview] = useState<FinalPaymentReview>(emptyReview);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const campusConfirmationInFlightRef = useRef(false);
  const bulkCampusConfirmationInFlightRef = useRef(false);
  const campusRevertInFlightRef = useRef(false);
  const personConfirmationInFlightRef = useRef(false);
  const [pendingCampusConfirmation, setPendingCampusConfirmation] =
    useState<CampusTransferStat | null>(null);
  const [pendingBulkCampusConfirmation, setPendingBulkCampusConfirmation] =
    useState<CampusTransferStat[] | null>(null);
  const [pendingCampusRevert, setPendingCampusRevert] =
    useState<CampusTransferStat | null>(null);
  const [pendingPersonConfirmation, setPendingPersonConfirmation] =
    useState<IndividualReviewPerson | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<ReviewTab>('campuses');
  const [campusFilter, setCampusFilter] = useState<CampusFilter>('all');
  const [personFilter, setPersonFilter] = useState<PersonFilter>('all');

  const loadReview = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      setReview(await getFinalPaymentReview());
    } catch (error) {
      console.error('최종 입금 확인 자료 조회 실패:', error);
      setErrorMessage(
        getErrorMessage(error, '최종 입금 확인 자료를 불러오지 못했습니다.')
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadReview();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadReview]);

  const keyword = search.trim().toLowerCase();
  const campuses = useMemo(
    () =>
      review.campusTransfers.filter((campus) => {
        const matchesFilter =
          campusFilter === 'all' ||
          (campusFilter === 'review-needed' && needsCampusReview(campus)) ||
          (campusFilter === 'personal-unpaid' &&
            campus.paidPeople < campus.totalPeople) ||
          (campusFilter === 'personal-paid' &&
            campus.paidPeople >= campus.totalPeople) ||
          (campusFilter === 'transfer-sent' && campus.status === 'sent') ||
          (campusFilter === 'confirmed' &&
            campus.status === 'confirmed' &&
            !campus.hasAdditionalSettlement);
        const target = [
          campus.district,
          campus.team,
          campus.campus,
          campus.campusAdminName,
          campus.campusAdminPhone,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return matchesFilter && (!keyword || target.includes(keyword));
      }),
    [campusFilter, keyword, review.campusTransfers]
  );

  const people = useMemo(
    () =>
      review.individualReviewReservations.filter((person) => {
        const target = [
          person.name,
          person.phone,
          person.district,
          person.team,
          person.campus,
        ]
          .join(' ')
          .toLowerCase();

        return (
          (personFilter === 'all' || person.paymentStatus === personFilter) &&
          (!keyword || target.includes(keyword))
        );
      }),
    [keyword, personFilter, review.individualReviewReservations]
  );

  const campusSummary = useMemo(() => {
    const confirmed = review.campusTransfers.filter(
      (campus) => !needsCampusReview(campus)
    ).length;
    const reviewNeeded = review.campusTransfers.filter(needsCampusReview).length;
    const expectedAmount = review.totalPaymentTargets * review.ticketPrice;
    const confirmedAmount = review.paidPaymentTargets * review.ticketPrice;

    return {
      confirmed,
      reviewNeeded,
      expectedAmount,
      confirmedAmount,
      total: review.campusTransfers.length,
    };
  }, [
    review.campusTransfers,
    review.paidPaymentTargets,
    review.ticketPrice,
    review.totalPaymentTargets,
  ]);

  const campusSettlementRate =
    campusSummary.expectedAmount > 0
      ? (campusSummary.confirmedAmount / campusSummary.expectedAmount) * 100
      : 0;
  const campusSettlementProgress = Math.min(
    Math.max(campusSettlementRate, 0),
    100
  );
  const unpaidIndividualReviewReservations = useMemo(
    () =>
      review.individualReviewReservations.filter(
        (person) => person.paymentStatus !== 'completed'
      ),
    [review.individualReviewReservations]
  );
  const unpaidAmount =
    unpaidIndividualReviewReservations.length * review.ticketPrice;
  const hasNoUnpaidPeople =
    !loading && !errorMessage && unpaidIndividualReviewReservations.length === 0;

  const getCurrentUserId = async () => {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) throw error;
    if (!user) throw new Error('로그인이 필요합니다.');

    return user.id;
  };

  const handleConfirmCampus = (campus: CampusTransferStat) => {
    if (
      processingId ||
      campusConfirmationInFlightRef.current ||
      campus.id.startsWith('empty-')
    ) {
      return;
    }

    setPendingCampusConfirmation(campus);
  };

  const confirmPendingCampus = async () => {
    if (
      !pendingCampusConfirmation ||
      processingId ||
      campusConfirmationInFlightRef.current
    ) {
      return;
    }

    const campus = pendingCampusConfirmation;
    const actualConfirmedAmount = campus.paidPeople * review.ticketPrice;
    try {
      campusConfirmationInFlightRef.current = true;
      setProcessingId(campus.id);
      const userId = await getCurrentUserId();

      await confirmCampusTransferById({
        transferId: campus.id,
        confirmedBy: userId,
        actualConfirmedAmount,
      });
      await loadReview();
      setPendingCampusConfirmation(null);
    } catch (error) {
      console.error('캠퍼스 본부 입금 확인 실패:', error);
      alert(
        `본부 입금 확인 중 오류가 발생했습니다: ${getErrorMessage(error)}`
      );
    } finally {
      campusConfirmationInFlightRef.current = false;
      setProcessingId(null);
    }
  };

  useEffect(() => {
    if (!pendingCampusConfirmation) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !processingId &&
        !campusConfirmationInFlightRef.current
      ) {
        setPendingCampusConfirmation(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingCampusConfirmation, processingId]);

  const handleRevertCampus = (campus: CampusTransferStat) => {
    if (
      processingId ||
      campusRevertInFlightRef.current ||
      campus.id.startsWith('empty-')
    ) {
      return;
    }

    setPendingCampusRevert(campus);
  };

  const confirmPendingCampusRevert = async () => {
    if (
      !pendingCampusRevert ||
      processingId ||
      campusRevertInFlightRef.current
    ) {
      return;
    }

    const campus = pendingCampusRevert;
    try {
      campusRevertInFlightRef.current = true;
      setProcessingId(campus.id);
      await revertCampusTransferConfirmationById({ transferId: campus.id });
      await loadReview();
      setPendingCampusRevert(null);
    } catch (error) {
      console.error('캠퍼스 본부 입금 확인 취소 실패:', error);
      alert(
        `본부 입금 확인 취소 중 오류가 발생했습니다: ${getErrorMessage(error)}`
      );
    } finally {
      campusRevertInFlightRef.current = false;
      setProcessingId(null);
    }
  };

  useEffect(() => {
    if (!pendingCampusRevert) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !processingId &&
        !campusRevertInFlightRef.current
      ) {
        setPendingCampusRevert(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingCampusRevert, processingId]);

  const handleConfirmVisibleSentCampuses = () => {
    if (processingId) return;

    const targets = campuses.filter(
      (campus) => campus.status === 'sent' && !campus.id.startsWith('empty-')
    );

    if (targets.length === 0) {
      alert('현재 조건에서 본부 확인할 송금 보고 캠퍼스가 없습니다.');
      return;
    }

    setPendingBulkCampusConfirmation(targets);
  };

  const confirmPendingBulkCampuses = async () => {
    if (
      !pendingBulkCampusConfirmation ||
      processingId ||
      bulkCampusConfirmationInFlightRef.current
    ) {
      return;
    }

    const targets = pendingBulkCampusConfirmation;
    try {
      bulkCampusConfirmationInFlightRef.current = true;
      setProcessingId('all');
      const userId = await getCurrentUserId();

      for (const campus of targets) {
        await confirmCampusTransferById({
          transferId: campus.id,
          confirmedBy: userId,
          actualConfirmedAmount: campus.paidPeople * review.ticketPrice,
        });
      }

      await loadReview();
      setPendingBulkCampusConfirmation(null);
      alert('현재 목록의 송금 보고 건을 모두 확인 처리했습니다.');
    } catch (error) {
      console.error('캠퍼스 본부 입금 일괄 확인 실패:', error);
      alert(
        `본부 입금 일괄 확인 중 오류가 발생했습니다: ${getErrorMessage(error)}`
      );
    } finally {
      bulkCampusConfirmationInFlightRef.current = false;
      setProcessingId(null);
    }
  };

  useEffect(() => {
    if (!pendingBulkCampusConfirmation) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !processingId &&
        !bulkCampusConfirmationInFlightRef.current
      ) {
        setPendingBulkCampusConfirmation(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingBulkCampusConfirmation, processingId]);

  const needsRemainingSeatConfirmation = (person: IndividualReviewPerson) =>
    person.reviewReasons.includes('remaining_seat') &&
    person.remainingSeatStatus !== 'confirmed' &&
    !(person.reservationStatus === 'confirmed' && person.confirmedTicket);

  const handleConfirmPerson = (person: IndividualReviewPerson) => {
    if (processingId || personConfirmationInFlightRef.current) return;

    setPendingPersonConfirmation(person);
  };

  const confirmPendingPerson = async () => {
    if (
      !pendingPersonConfirmation ||
      processingId ||
      personConfirmationInFlightRef.current
    ) {
      return;
    }

    const person = pendingPersonConfirmation;
    try {
      personConfirmationInFlightRef.current = true;
      setProcessingId(`person-${person.id}`);

      if (needsRemainingSeatConfirmation(person)) {
        await confirmRemainingSeatPayment(person.id);
      } else {
        await createOrUpdatePaymentStatus({
          paymentId: person.paymentId,
          reservationId: person.id,
          userId: person.userId,
          amount: review.ticketPrice,
          status: 'completed',
        });
      }

      await loadReview();
      setPendingPersonConfirmation(null);
    } catch (error) {
      console.error('개인 미입금 완료 처리 실패:', error);
      alert(
        `개인 입금 완료 처리 중 오류가 발생했습니다: ${getErrorMessage(error)}`
      );
    } finally {
      personConfirmationInFlightRef.current = false;
      setProcessingId(null);
    }
  };

  useEffect(() => {
    if (!pendingPersonConfirmation) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !processingId &&
        !personConfirmationInFlightRef.current
      ) {
        setPendingPersonConfirmation(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingPersonConfirmation, processingId]);

  return (
    <div className={styles.page}>
      <AdminHeader />
      <main className={styles.main}>
        <section className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>입금 및 정산 운영</span>
            <h1>개인 입금 · 캠퍼스별 송금 관리</h1>
            <p>
              모든 캠퍼스의 개인 입금과 송금 정산 상태를 처리하고, 별도 확인이
              필요한 개별 확인 대상을 한 화면에서 점검합니다.
            </p>
          </div>
          <div className={styles.heroActions}>
            <button
              type="button"
              onClick={() => void loadReview()}
              disabled={loading || Boolean(processingId)}
            >
              <RefreshCw size={16} /> 새로고침
            </button>
          </div>
        </section>

        {errorMessage && (
          <section className={styles.errorState} role="alert">
            <strong>자료를 불러오지 못했습니다.</strong>
            <span>{errorMessage}</span>
            <button type="button" onClick={() => void loadReview()}>
              다시 시도
            </button>
          </section>
        )}

        <section className={styles.summaryGrid} aria-label="입금 및 송금 요약">
          <article className={styles.summaryCard}>
            <CheckCircle2 size={22} />
            <span>정산 확인 완료 / 확인 필요 캠퍼스</span>
            <strong>
              {campusSummary.confirmed.toLocaleString()} /{' '}
              {campusSummary.reviewNeeded.toLocaleString()}곳
            </strong>
            <small>
              완료 / 확인 필요 · 전체 {campusSummary.total.toLocaleString()}곳
            </small>
          </article>
          <article className={`${styles.summaryCard} ${styles.amountSummaryCard}`}>
            <Banknote size={22} />
            <span>입금 확인액 / 전체 입금 예정액</span>
            <div className={styles.amountProgressLabels}>
              <strong>{formatCurrency(campusSummary.confirmedAmount)}</strong>
              <b>{formatPercentage(campusSettlementRate)}</b>
            </div>
            <div
              className={styles.amountProgressTrack}
              role="progressbar"
              aria-label="전체 입금 예정액 대비 입금 확인액"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(campusSettlementProgress)}
            >
              <div
                className={styles.amountProgressBar}
                style={{ width: `${campusSettlementProgress}%` }}
              />
            </div>
            <small>
              입금 예정액 {formatCurrency(campusSummary.expectedAmount)} = 신청 인원{' '}
              {review.totalPaymentTargets.toLocaleString()}명 ×{' '}
              {formatCurrency(review.ticketPrice)}
            </small>
          </article>
          <article
            className={`${styles.summaryCard} ${
              hasNoUnpaidPeople ? styles.successCard : styles.dangerCard
            }`}
          >
            {hasNoUnpaidPeople ? (
              <CheckCircle2 size={22} />
            ) : (
              <UserRoundX size={22} />
            )}
            <span>
              {hasNoUnpaidPeople
                ? '개인 미입금 없음'
                : '개인 미입금 / 전체 확인 대상'}
            </span>
            <strong>
              {hasNoUnpaidPeople ? (
                '전원 입금 완료'
              ) : (
                <>
                  {unpaidIndividualReviewReservations.length.toLocaleString()} /{' '}
                  {review.totalIndividualReviewTargets.toLocaleString()}명
                </>
              )}
            </strong>
            <small>
              {hasNoUnpaidPeople
                ? `확인 대상 ${review.totalIndividualReviewTargets.toLocaleString()}명이 모두 입금 완료 상태입니다.`
                : `미입금 / 전체 · 미입금액 ${formatCurrency(unpaidAmount)}`}
            </small>
          </article>
        </section>

        <div className={styles.tabs} role="tablist" aria-label="입금 검토 목록">
          <button
            type="button"
            id="payment-review-tab-campuses"
            className={activeTab === 'campuses' ? styles.activeTab : undefined}
            role="tab"
            aria-selected={activeTab === 'campuses'}
            aria-controls="payment-review-panel-campuses"
            onClick={() => setActiveTab('campuses')}
          >
            <Building2 size={17} />
            캠퍼스 정산
            <span>{campusSummary.total.toLocaleString()}</span>
          </button>
          <button
            type="button"
            id="payment-review-tab-people"
            className={activeTab === 'people' ? styles.activeTab : undefined}
            role="tab"
            aria-selected={activeTab === 'people'}
            aria-controls="payment-review-panel-people"
            onClick={() => setActiveTab('people')}
          >
            <UserRoundX size={17} />
            개별 확인 대상 명단
            <span>{review.individualReviewReservations.length.toLocaleString()}</span>
          </button>
        </div>

        <section className={styles.toolbar}>
          <label className={styles.searchBox}>
            <Search size={17} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={
                activeTab === 'campuses'
                  ? '지구, 팀, 캠퍼스, 회계 담당자 검색'
                  : '이름, 연락처, 지구, 팀, 캠퍼스 검색'
              }
            />
          </label>
          <span>
            {activeTab === 'campuses'
              ? '현재 캠퍼스 정산 목록에서 검색합니다.'
              : '현재 개별 확인 대상 명단에서 검색합니다.'}
          </span>
        </section>

        {activeTab === 'campuses' && (
        <section
          id="payment-review-panel-campuses"
          className={styles.panel}
          role="tabpanel"
          aria-labelledby="payment-review-tab-campuses"
        >
          <div className={styles.panelHeader}>
            <div>
              <h2>캠퍼스 입금·송금 정산</h2>
              <p>
                기본으로 모든 캠퍼스를 표시합니다. 처리 필요 여부, 개인 미입금
                여부, 송금 단계별로 골라볼 수 있습니다.
              </p>
            </div>
            <div className={styles.panelActions}>
              <select
                value={campusFilter}
                onChange={(event) =>
                  setCampusFilter(event.target.value as CampusFilter)
                }
              >
                <option value="all">전체 캠퍼스</option>
                <option value="review-needed">처리 필요 캠퍼스</option>
                <option value="personal-unpaid">개인 미입금 있음</option>
                <option value="personal-paid">개인 미입금 없음</option>
                <option value="transfer-sent">캠퍼스 송금 보고 완료</option>
                <option value="confirmed">본부 확인 완료</option>
              </select>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => void handleConfirmVisibleSentCampuses()}
                disabled={loading || Boolean(processingId)}
              >
                현재 목록 송금 보고 일괄 확인
              </button>
            </div>
          </div>
          <div className={styles.tableWrap}>
            <table className={`${styles.table} ${styles.campusTable}`}>
              <thead>
                <tr>
                  <th>캠퍼스</th>
                  <th>회계 담당자</th>
                  <th>개인 입금</th>
                  <th>송금 보고액·정산 확인액</th>
                  <th>송금 정산 상태</th>
                  <th>처리</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className={styles.emptyCell} colSpan={6}>
                      캠퍼스 정산 자료를 불러오는 중입니다.
                    </td>
                  </tr>
                ) : campuses.length === 0 ? (
                  <tr>
                    <td className={styles.emptyCell} colSpan={6}>
                      조건에 맞는 캠퍼스가 없습니다.
                    </td>
                  </tr>
                ) : (
                  campuses.map((campus) => {
                    const isProcessing =
                      processingId === campus.id || processingId === 'all';
                    const unpaidPeople = Math.max(
                      campus.totalPeople - campus.paidPeople,
                      0
                    );
                    const statusClass = campus.hasAdditionalSettlement
                      ? styles.transfer_additional
                      : styles[`transfer_${campus.status}`];

                    return (
                      <tr key={campus.id}>
                        <td>
                          <strong>{campus.campus}</strong>
                          <span>
                            {campus.district} / {campus.team}
                          </span>
                        </td>
                        <td>
                          <strong>{campus.campusAdminName || '미등록'}</strong>
                          <span>{campus.campusAdminPhone || '-'}</span>
                        </td>
                        <td>
                          <strong
                            className={
                              unpaidPeople > 0 ? styles.dangerText : ''
                            }
                          >
                            미입금 {unpaidPeople}명
                          </strong>
                          <span>
                            {campus.paidPeople} / {campus.totalPeople}명 완료
                          </span>
                        </td>
                        <td>
                          <strong>
                            {formatCurrency(campus.reportedTotalAmount)} 보고
                          </strong>
                          <span>
                            본부 확인{' '}
                            {formatCurrency(campus.actualConfirmedAmount ?? 0)} ·
                            예상 {formatCurrency(campus.totalAmount)}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`${styles.badge} ${statusClass ?? ''}`}
                          >
                            {getCampusStatusLabel(campus)}
                          </span>
                        </td>
                        <td>
                          <div className={styles.rowActions}>
                            {campus.status === 'sent' && (
                              <button
                                type="button"
                                className={styles.confirmButton}
                                onClick={() => void handleConfirmCampus(campus)}
                                disabled={isProcessing}
                              >
                                {isProcessing ? '처리 중...' : '본부 입금 확인'}
                              </button>
                            )}
                            {campus.status === 'confirmed' && (
                              <button
                                type="button"
                                className={styles.revertButton}
                                onClick={() => void handleRevertCampus(campus)}
                                disabled={
                                  isProcessing || campus.id.startsWith('empty-')
                                }
                              >
                                <RotateCcw size={13} /> 확인 취소
                              </button>
                            )}
                            {campus.status === 'pending' && (
                              <span className={styles.waitingText}>
                                캠퍼스 보고 대기
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
        )}

        {activeTab === 'people' && (
        <section
          id="payment-review-panel-people"
          className={styles.panel}
          role="tabpanel"
          aria-labelledby="payment-review-tab-people"
        >
          <div className={styles.panelHeader}>
            <div>
              <h2>개별 확인 대상 명단</h2>
              <p>
                잔여 좌석 신청자, 서울 외 지구 신청자, 관리자가 직접 추가한 사용자
                목록입니다. 서울지구 일반 신청자는 캠퍼스 단위로 확인합니다.
                입금 완료 처리 후에도 이 명단에 남아 상태를 확인할 수 있습니다.
              </p>
            </div>
            <select
              value={personFilter}
              onChange={(event) =>
                setPersonFilter(event.target.value as PersonFilter)
              }
            >
              <option value="all">모든 확인 대상</option>
              <option value="missing">입금 정보 없음</option>
              <option value="pending">미입금</option>
              <option value="completed">입금 완료</option>
              <option value="refunded">환불 상태</option>
            </select>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>신청자</th>
                  <th>개별 확인 사유</th>
                  <th>소속</th>
                  <th>입금 상태</th>
                  <th>신청·버스표</th>
                  <th>확인할 금액</th>
                  <th>처리</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className={styles.emptyCell} colSpan={7}>
                      개별 확인 대상 자료를 불러오는 중입니다.
                    </td>
                  </tr>
                ) : people.length === 0 ? (
                  <tr>
                    <td className={styles.emptyCell} colSpan={7}>
                      {review.individualReviewReservations.length === 0 ? (
                        <>
                          <strong className={styles.emptyStateTitle}>
                            개별 확인 대상 없음
                          </strong>
                          <span>
                            현재 별도로 확인할 신청자가 없습니다.
                          </span>
                        </>
                      ) : (
                        '선택한 조건에 맞는 개별 확인 대상이 없습니다.'
                      )}
                    </td>
                  </tr>
                ) : (
                  people.map((person) => (
                    <tr key={person.id}>
                      <td>
                        <strong>{person.name || '이름 없음'}</strong>
                        <span>{person.phone || '-'}</span>
                      </td>
                      <td>
                        <div className={styles.reasonList}>
                          {person.reviewReasons.map((reason) => (
                            <span key={reason} className={styles.reasonBadge}>
                              {reviewReasonLabels[reason]}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <strong>{person.campus || '캠퍼스 미등록'}</strong>
                        <span>
                          {person.district} / {person.team}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`${styles.badge} ${
                            styles[`payment_${person.paymentStatus}`]
                          }`}
                        >
                          {person.paymentStatus === 'missing'
                            ? '입금 정보 없음'
                            : person.paymentStatus === 'completed'
                              ? '입금 완료'
                            : person.paymentStatus === 'refunded'
                              ? '환불 상태'
                              : '미입금'}
                        </span>
                      </td>
                      <td>
                        <strong>
                          {person.reservationStatus === 'confirmed'
                            ? '신청 확정'
                            : '신청 접수'}
                        </strong>
                        <span>
                          {person.confirmedTicket
                            ? '버스표 확정'
                            : '버스표 미확정'}
                        </span>
                      </td>
                      <td>
                        <strong>{formatCurrency(review.ticketPrice)}</strong>
                        <button
                          type="button"
                          className={styles.textButton}
                          onClick={() =>
                            navigate(
                              `/admin/users?campus=${encodeURIComponent(
                                person.campus
                              )}`
                            )
                          }
                        >
                          개인 관리 열기
                        </button>
                      </td>
                      <td>
                        {person.paymentStatus === 'completed' ? (
                          <span className={styles.completedText}>처리 완료</span>
                        ) : (
                          <button
                            type="button"
                            className={styles.confirmButton}
                            onClick={() => void handleConfirmPerson(person)}
                            disabled={Boolean(processingId)}
                          >
                            {processingId === `person-${person.id}`
                              ? '처리 중...'
                              : '입금 완료 처리'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
        )}
      </main>

      {pendingCampusConfirmation && (
        <div
          className={styles.confirmBackdrop}
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !processingId &&
              !campusConfirmationInFlightRef.current
            ) {
              setPendingCampusConfirmation(null);
            }
          }}
        >
          <section
            className={styles.confirmDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="campus-confirm-title"
            aria-describedby="campus-confirm-description"
          >
            <span className={styles.confirmIcon} aria-hidden="true">
              <Banknote size={24} />
            </span>
            <p className={styles.confirmEyebrow}>본부 입금 확인</p>
            <h2 id="campus-confirm-title">
              {pendingCampusConfirmation.campus} 캠퍼스 입금을 확인할까요?
            </h2>
            <p id="campus-confirm-description">
              확인 후 캠퍼스 정산 상태가 완료로 변경됩니다. 아래 소속과 금액을
              다시 확인해주세요.
            </p>
            <dl className={styles.confirmSummary}>
              <div>
                <dt>소속</dt>
                <dd>
                  {pendingCampusConfirmation.district} /{' '}
                  {pendingCampusConfirmation.team} /{' '}
                  {pendingCampusConfirmation.campus}
                </dd>
              </div>
              <div>
                <dt>입금 확인 인원</dt>
                <dd>
                  {pendingCampusConfirmation.paidPeople.toLocaleString()}명
                </dd>
              </div>
              <div>
                <dt>확인 금액</dt>
                <dd>
                  {formatCurrency(
                    pendingCampusConfirmation.paidPeople * review.ticketPrice
                  )}
                </dd>
              </div>
            </dl>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.cancelConfirmButton}
                onClick={() => setPendingCampusConfirmation(null)}
                disabled={Boolean(processingId)}
                autoFocus
              >
                취소
              </button>
              <button
                type="button"
                className={styles.confirmButton}
                onClick={() => void confirmPendingCampus()}
                disabled={Boolean(processingId)}
              >
                {processingId ? '처리 중...' : '본부 입금 확인'}
              </button>
            </div>
          </section>
        </div>
      )}

      {pendingBulkCampusConfirmation && (
        <div
          className={styles.confirmBackdrop}
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !processingId &&
              !bulkCampusConfirmationInFlightRef.current
            ) {
              setPendingBulkCampusConfirmation(null);
            }
          }}
        >
          <section
            className={styles.confirmDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-campus-confirm-title"
            aria-describedby="bulk-campus-confirm-description"
          >
            <span className={styles.confirmIcon} aria-hidden="true">
              <Banknote size={24} />
            </span>
            <p className={styles.confirmEyebrow}>현재 목록 일괄 확인</p>
            <h2 id="bulk-campus-confirm-title">
              송금 보고 {pendingBulkCampusConfirmation.length.toLocaleString()}곳을
              확인할까요?
            </h2>
            <p id="bulk-campus-confirm-description">
              모달을 연 시점의 현재 필터·검색 결과만 처리합니다. 캠퍼스별로 순차
              처리되므로 중간에 오류가 발생하면 일부 캠퍼스만 완료될 수 있습니다.
            </p>
            <dl className={styles.confirmSummary}>
              <div>
                <dt>처리 대상</dt>
                <dd>
                  송금 보고 {pendingBulkCampusConfirmation.length.toLocaleString()}곳
                </dd>
              </div>
              <div>
                <dt>현재 조건</dt>
                <dd>
                  필터 {campusFilterLabels[campusFilter]}
                  {keyword ? ` · 검색 "${search.trim()}"` : ' · 검색 없음'}
                </dd>
              </div>
              <div>
                <dt>총 확인 금액</dt>
                <dd>
                  {formatCurrency(
                    pendingBulkCampusConfirmation.reduce(
                      (sum, campus) =>
                        sum + campus.paidPeople * review.ticketPrice,
                      0
                    )
                  )}
                </dd>
              </div>
            </dl>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.cancelConfirmButton}
                onClick={() => setPendingBulkCampusConfirmation(null)}
                disabled={Boolean(processingId)}
                autoFocus
              >
                취소
              </button>
              <button
                type="button"
                className={styles.confirmButton}
                onClick={() => void confirmPendingBulkCampuses()}
                disabled={Boolean(processingId)}
              >
                {processingId ? '처리 중...' : '현재 목록 일괄 확인'}
              </button>
            </div>
          </section>
        </div>
      )}

      {pendingCampusRevert && (
        <div
          className={styles.confirmBackdrop}
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !processingId &&
              !campusRevertInFlightRef.current
            ) {
              setPendingCampusRevert(null);
            }
          }}
        >
          <section
            className={styles.confirmDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="campus-revert-title"
            aria-describedby="campus-revert-description"
          >
            <span
              className={`${styles.confirmIcon} ${styles.revertConfirmIcon}`}
              aria-hidden="true"
            >
              <RotateCcw size={24} />
            </span>
            <p
              className={`${styles.confirmEyebrow} ${styles.revertConfirmEyebrow}`}
            >
              본부 입금 확인 취소
            </p>
            <h2 id="campus-revert-title">
              {pendingCampusRevert.campus} 캠퍼스 확인을 취소할까요?
            </h2>
            <p id="campus-revert-description">
              본부 입금 확인 완료 상태가 송금 보고 상태로 돌아갑니다. 실제 환불이나
              입금 취소를 처리하는 기능은 아닙니다.
            </p>
            <dl className={styles.confirmSummary}>
              <div>
                <dt>소속</dt>
                <dd>
                  {pendingCampusRevert.district} / {pendingCampusRevert.team} /{' '}
                  {pendingCampusRevert.campus}
                </dd>
              </div>
              <div>
                <dt>기존 확인 금액</dt>
                <dd>
                  {formatCurrency(
                    pendingCampusRevert.actualConfirmedAmount ?? 0
                  )}
                </dd>
              </div>
              <div>
                <dt>변경 후 상태</dt>
                <dd>송금 보고됨 · 본부 재확인 필요</dd>
              </div>
            </dl>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.cancelConfirmButton}
                onClick={() => setPendingCampusRevert(null)}
                disabled={Boolean(processingId)}
                autoFocus
              >
                돌아가기
              </button>
              <button
                type="button"
                className={styles.revertButton}
                onClick={() => void confirmPendingCampusRevert()}
                disabled={Boolean(processingId)}
              >
                {processingId ? '처리 중...' : '본부 입금 확인 취소'}
              </button>
            </div>
          </section>
        </div>
      )}

      {pendingPersonConfirmation && (
        <div
          className={styles.confirmBackdrop}
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !processingId &&
              !personConfirmationInFlightRef.current
            ) {
              setPendingPersonConfirmation(null);
            }
          }}
        >
          <section
            className={styles.confirmDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="person-confirm-title"
            aria-describedby="person-confirm-description"
          >
            <span className={styles.confirmIcon} aria-hidden="true">
              <Banknote size={24} />
            </span>
            <p className={styles.confirmEyebrow}>개인 입금 완료 처리</p>
            <h2 id="person-confirm-title">
              {pendingPersonConfirmation.name || '이름 없는 신청자'}님의 입금을
              확인할까요?
            </h2>
            <p id="person-confirm-description">
              {needsRemainingSeatConfirmation(pendingPersonConfirmation)
                ? '잔여 좌석 입금을 확정하고 해당 신청의 입금·좌석 상태를 함께 완료 처리합니다.'
                : '개인 입금 상태를 입금 완료로 변경합니다. 실제 계좌 입금 내역을 확인한 뒤 처리해주세요.'}
            </p>
            <dl className={styles.confirmSummary}>
              <div>
                <dt>신청자</dt>
                <dd>
                  {pendingPersonConfirmation.name || '이름 없음'} ·{' '}
                  {pendingPersonConfirmation.phone || '연락처 없음'}
                </dd>
              </div>
              <div>
                <dt>소속</dt>
                <dd>
                  {pendingPersonConfirmation.district} /{' '}
                  {pendingPersonConfirmation.team} /{' '}
                  {pendingPersonConfirmation.campus || '캠퍼스 미등록'}
                </dd>
              </div>
              <div>
                <dt>처리 유형</dt>
                <dd>
                  {needsRemainingSeatConfirmation(pendingPersonConfirmation)
                    ? '잔여 좌석 입금 확정'
                    : '개인 입금 완료'}
                </dd>
              </div>
              <div>
                <dt>확인 금액</dt>
                <dd>{formatCurrency(review.ticketPrice)}</dd>
              </div>
            </dl>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.cancelConfirmButton}
                onClick={() => setPendingPersonConfirmation(null)}
                disabled={Boolean(processingId)}
                autoFocus
              >
                취소
              </button>
              <button
                type="button"
                className={styles.confirmButton}
                onClick={() => void confirmPendingPerson()}
                disabled={Boolean(processingId)}
              >
                {processingId ? '처리 중...' : '입금 완료 처리'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default AdminFinalPaymentReviewPage;
