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
  | 'transfer-sent'
  | 'transfer-unconfirmed'
  | 'confirmed';
type PersonFilter = 'all' | FinalPaymentStatus;
type ReviewTab = 'campuses' | 'people';

const emptyReview: FinalPaymentReview = {
  ticketPrice: 0,
  totalIndividualReviewTargets: 0,
  paidIndividualReviewTargets: 0,
  campusTransfers: [],
  unpaidReservations: [],
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
          (campusFilter === 'transfer-sent' && campus.status === 'sent') ||
          (campusFilter === 'transfer-unconfirmed' &&
            (campus.status !== 'confirmed' ||
              campus.hasAdditionalSettlement)) ||
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
      review.unpaidReservations.filter((person) => {
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
    [keyword, personFilter, review.unpaidReservations]
  );

  const campusSummary = useMemo(() => {
    const confirmed = review.campusTransfers.filter(
      (campus) => !needsCampusReview(campus)
    ).length;
    const reviewNeeded = review.campusTransfers.filter(needsCampusReview).length;
    const expectedAmount = review.campusTransfers.reduce(
      (sum, campus) => sum + campus.totalAmount,
      0
    );
    const confirmedAmount = review.campusTransfers.reduce(
      (sum, campus) => sum + (campus.actualConfirmedAmount ?? 0),
      0
    );

    return {
      confirmed,
      reviewNeeded,
      expectedAmount,
      confirmedAmount,
      total: review.campusTransfers.length,
    };
  }, [review.campusTransfers]);

  const campusSettlementRate =
    campusSummary.expectedAmount > 0
      ? (campusSummary.confirmedAmount / campusSummary.expectedAmount) * 100
      : 0;
  const campusSettlementProgress = Math.min(
    Math.max(campusSettlementRate, 0),
    100
  );
  const unpaidAmount = review.unpaidReservations.length * review.ticketPrice;

  const getCurrentUserId = async () => {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) throw error;
    if (!user) throw new Error('로그인이 필요합니다.');

    return user.id;
  };

  const handleConfirmCampus = async (campus: CampusTransferStat) => {
    if (
      processingId ||
      campusConfirmationInFlightRef.current ||
      campus.id.startsWith('empty-')
    ) {
      return;
    }

    const actualConfirmedAmount = campus.paidPeople * review.ticketPrice;
    const confirmed = window.confirm(
      `${campus.district} / ${campus.team} / ${campus.campus}의 본부 입금을 확인할까요?\n\n확인 금액: ${formatCurrency(
        actualConfirmedAmount
      )}`
    );

    if (!confirmed || campusConfirmationInFlightRef.current) return;

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

  const handleRevertCampus = async (campus: CampusTransferStat) => {
    if (processingId || campus.id.startsWith('empty-')) return;

    const confirmed = window.confirm(
      `${campus.district} / ${campus.team} / ${campus.campus}의 본부 입금 확인을 취소할까요?`
    );

    if (!confirmed) return;

    try {
      setProcessingId(campus.id);
      await revertCampusTransferConfirmationById({ transferId: campus.id });
      await loadReview();
    } catch (error) {
      console.error('캠퍼스 본부 입금 확인 취소 실패:', error);
      alert(
        `본부 입금 확인 취소 중 오류가 발생했습니다: ${getErrorMessage(error)}`
      );
    } finally {
      setProcessingId(null);
    }
  };

  const handleConfirmVisibleSentCampuses = async () => {
    if (processingId) return;

    const targets = campuses.filter(
      (campus) => campus.status === 'sent' && !campus.id.startsWith('empty-')
    );

    if (targets.length === 0) {
      alert('현재 조건에서 본부 확인할 송금 보고 캠퍼스가 없습니다.');
      return;
    }

    const confirmed = window.confirm(
      `현재 목록의 송금 보고 캠퍼스 ${targets.length}곳을 모두 본부 입금 확인 처리할까요?`
    );

    if (!confirmed) return;

    try {
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
      alert('현재 목록의 송금 보고 건을 모두 확인 처리했습니다.');
    } catch (error) {
      console.error('캠퍼스 본부 입금 일괄 확인 실패:', error);
      alert(
        `본부 입금 일괄 확인 중 오류가 발생했습니다: ${getErrorMessage(error)}`
      );
    } finally {
      setProcessingId(null);
    }
  };

  const handleConfirmPerson = async (
    person: FinalPaymentReview['unpaidReservations'][number]
  ) => {
    if (processingId) return;

    const confirmed = window.confirm(
      `${person.name || '이름 없는 신청자'}님의 ${formatCurrency(
        review.ticketPrice
      )} 입금을 완료 처리할까요?`
    );

    if (!confirmed) return;

    try {
      setProcessingId(`person-${person.id}`);

      const needsRemainingSeatConfirmation =
        person.reviewReasons.includes('remaining_seat') &&
        person.remainingSeatStatus !== 'confirmed' &&
        !(person.reservationStatus === 'confirmed' && person.confirmedTicket);

      if (
        needsRemainingSeatConfirmation
      ) {
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
    } catch (error) {
      console.error('개인 미입금 완료 처리 실패:', error);
      alert(
        `개인 입금 완료 처리 중 오류가 발생했습니다: ${getErrorMessage(error)}`
      );
    } finally {
      setProcessingId(null);
    }
  };

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
              필요한 개인 미입금자를 한 화면에서 점검합니다.
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
            <span>정산 확인액 / 캠퍼스 예상액</span>
            <div className={styles.amountProgressLabels}>
              <strong>{formatCurrency(campusSummary.confirmedAmount)}</strong>
              <b>{formatPercentage(campusSettlementRate)}</b>
            </div>
            <div
              className={styles.amountProgressTrack}
              role="progressbar"
              aria-label="캠퍼스 예상액 대비 정산 확인액"
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
              예상 {formatCurrency(campusSummary.expectedAmount)} · 신청 인원 ×{' '}
              {formatCurrency(review.ticketPrice)}
            </small>
          </article>
          <article className={`${styles.summaryCard} ${styles.dangerCard}`}>
            <UserRoundX size={22} />
            <span>개인 미입금 / 전체 확인 대상</span>
            <strong>
              {review.unpaidReservations.length.toLocaleString()} /{' '}
              {review.totalIndividualReviewTargets.toLocaleString()}명
            </strong>
            <small>미입금 / 전체 · 미입금액 {formatCurrency(unpaidAmount)}</small>
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
            개인 미입금 명단
            <span>{review.unpaidReservations.length.toLocaleString()}</span>
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
              : '현재 개인 미입금 명단에서 검색합니다.'}
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
                기본으로 모든 캠퍼스를 표시합니다. 확인 필요만 보거나 송금 보고
                건을 바로 본부 확인 처리할 수 있습니다.
              </p>
            </div>
            <div className={styles.panelActions}>
              <select
                value={campusFilter}
                onChange={(event) =>
                  setCampusFilter(event.target.value as CampusFilter)
                }
              >
                <option value="all">모든 캠퍼스</option>
                <option value="review-needed">확인 필요만</option>
                <option value="personal-unpaid">개인 미입금 있음</option>
                <option value="transfer-sent">송금 보고됨</option>
                <option value="transfer-unconfirmed">정산 확인 필요</option>
                <option value="confirmed">정산 확인 완료</option>
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
              <h2>개인 미입금 명단</h2>
              <p>
                잔여 좌석 신청자, 서울 외 지구 신청자, 관리자가 직접 추가한 사용자
                중 미입금자입니다. 서울지구 일반 신청자는 캠퍼스 단위로
                확인합니다. 입금 내역을 확인한 개인은 바로 완료 처리할 수
                있습니다.
              </p>
            </div>
            <select
              value={personFilter}
              onChange={(event) =>
                setPersonFilter(event.target.value as PersonFilter)
              }
            >
              <option value="all">전체 미입금</option>
              <option value="missing">입금 정보 없음</option>
              <option value="pending">입금 대기</option>
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
                      개인 미입금 자료를 불러오는 중입니다.
                    </td>
                  </tr>
                ) : people.length === 0 ? (
                  <tr>
                    <td className={styles.emptyCell} colSpan={7}>
                      조건에 맞는 개인 미입금자가 없습니다.
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
                            : person.paymentStatus === 'refunded'
                              ? '환불 상태'
                              : '입금 대기'}
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
    </div>
  );
};

export default AdminFinalPaymentReviewPage;
