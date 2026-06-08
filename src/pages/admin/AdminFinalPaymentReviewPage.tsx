import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  Building2,
  CheckCircle2,
  RefreshCw,
  Search,
  UserRoundX,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import {
  getFinalPaymentReview,
  type FinalPaymentReview,
  type FinalPaymentStatus,
  type IndividualReviewReason,
} from '../../lib/admin/finalPaymentReviewService';
import AdminHeader from './AdminHeader';
import styles from './AdminFinalPaymentReviewPage.module.css';

type CampusFilter = 'all' | 'personal-unpaid' | 'transfer-unconfirmed';
type PersonFilter = 'all' | FinalPaymentStatus;

const emptyReview: FinalPaymentReview = {
  ticketPrice: 0,
  totalIndividualReviewTargets: 0,
  paidIndividualReviewTargets: 0,
  unpaidReservations: [],
  unpaidCampuses: [],
};

const formatCurrency = (amount: number) => `${amount.toLocaleString()}원`;
const reviewReasonLabels: Record<IndividualReviewReason, string> = {
  remaining_seat: '잔여좌석 신청',
  outside_seoul: '서울지구 외',
  admin_created: '관리자 직접 추가',
};

const AdminFinalPaymentReviewPage = () => {
  const navigate = useNavigate();
  const [review, setReview] = useState<FinalPaymentReview>(emptyReview);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
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
        error instanceof Error
          ? error.message
          : '최종 입금 확인 자료를 불러오지 못했습니다.'
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
      review.unpaidCampuses.filter((campus) => {
        const matchesFilter =
          campusFilter === 'all' ||
          (campusFilter === 'personal-unpaid' && campus.unpaidPeople > 0) ||
          (campusFilter === 'transfer-unconfirmed' &&
            campus.transferStatus !== 'confirmed');
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
    [campusFilter, keyword, review.unpaidCampuses]
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

  const expectedAmount =
    review.totalIndividualReviewTargets * review.ticketPrice;
  const unpaidAmount = review.unpaidReservations.length * review.ticketPrice;
  const collectionRate =
    review.totalIndividualReviewTargets > 0
      ? (review.paidIndividualReviewTargets /
          review.totalIndividualReviewTargets) *
        100
      : 0;

  return (
    <div className={styles.page}>
      <AdminHeader />
      <main className={styles.main}>
        <section className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>출발 전 운영 점검</span>
            <h1>미입금 최종 점검</h1>
            <p>
              예매 여부를 우선으로 탑승시키되, 아직 입금이 끝나지 않은 캠퍼스와
              개인을 한 화면에서 확인합니다.
            </p>
          </div>
          <div className={styles.heroActions}>
            <button type="button" onClick={() => navigate('/admin/payments/campus-transfers')}>
              캠퍼스 입금 처리
            </button>
            <button type="button" onClick={() => void loadReview()} disabled={loading}>
              <RefreshCw size={16} /> 새로고침
            </button>
          </div>
        </section>

        {errorMessage && (
          <section className={styles.errorState} role="alert">
            <strong>자료를 불러오지 못했습니다.</strong>
            <span>{errorMessage}</span>
            <button type="button" onClick={() => void loadReview()}>다시 시도</button>
          </section>
        )}

        <section className={styles.summaryGrid} aria-label="입금 요약">
          <article className={styles.summaryCard}>
            <CheckCircle2 size={22} /><span>개별 확인 대상 입금 완료율</span>
            <strong>{collectionRate.toFixed(1)}%</strong>
            <small>{review.paidIndividualReviewTargets.toLocaleString()} / {review.totalIndividualReviewTargets.toLocaleString()}명</small>
          </article>
          <article className={`${styles.summaryCard} ${styles.dangerCard}`}>
            <UserRoundX size={22} /><span>개인 미입금</span>
            <strong>{review.unpaidReservations.length.toLocaleString()}명</strong>
            <small>{formatCurrency(unpaidAmount)} 확인 필요</small>
          </article>
          <article className={`${styles.summaryCard} ${styles.warningCard}`}>
            <Building2 size={22} /><span>확인 필요 캠퍼스</span>
            <strong>{review.unpaidCampuses.length.toLocaleString()}곳</strong>
            <small>개인 미입금 또는 본부 송금 미확인</small>
          </article>
          <article className={styles.summaryCard}>
            <Banknote size={22} /><span>개별 확인 대상 예상액</span>
            <strong>{formatCurrency(expectedAmount)}</strong>
            <small>1인 {formatCurrency(review.ticketPrice)}</small>
          </article>
        </section>

        <section className={styles.toolbar}>
          <label className={styles.searchBox}>
            <Search size={17} />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="이름, 연락처, 지구, 팀, 캠퍼스 검색" />
          </label>
          <span>검색 결과는 캠퍼스와 개인 목록에 함께 적용됩니다.</span>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><h2>입금 확인이 필요한 캠퍼스</h2><p>개인 미입금이 남았거나 본부 송금 확인이 끝나지 않은 캠퍼스입니다.</p></div>
            <select value={campusFilter} onChange={(event) => setCampusFilter(event.target.value as CampusFilter)}>
              <option value="all">전체 확인 필요</option>
              <option value="personal-unpaid">개인 미입금 있음</option>
              <option value="transfer-unconfirmed">본부 송금 미확인</option>
            </select>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>캠퍼스</th><th>회계 담당자</th><th>개인 입금</th><th>본부 송금 상태</th><th>미확인 예상액</th></tr></thead>
              <tbody>
                {!loading && campuses.length === 0 ? (
                  <tr><td className={styles.emptyCell} colSpan={5}>조건에 맞는 미입금 캠퍼스가 없습니다.</td></tr>
                ) : campuses.map((campus) => (
                  <tr key={campus.key}>
                    <td><strong>{campus.campus}</strong><span>{campus.district} / {campus.team}</span></td>
                    <td><strong>{campus.campusAdminName || '미등록'}</strong><span>{campus.campusAdminPhone || '-'}</span></td>
                    <td><strong className={campus.unpaidPeople > 0 ? styles.dangerText : ''}>미입금 {campus.unpaidPeople}명</strong><span>{campus.paidPeople} / {campus.totalPeople}명 완료</span></td>
                    <td><span className={`${styles.badge} ${styles[`transfer_${campus.transferStatus}`]}`}>{campus.transferStatus === 'confirmed' ? '본부 확인 완료' : campus.transferStatus === 'sent' ? '송금 보고' : '미송금'}</span></td>
                    <td><strong>{formatCurrency(campus.outstandingAmount)}</strong><span>예상 {formatCurrency(campus.expectedAmount)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><h2>개인 미입금 명단</h2><p>잔여좌석 신청자, 서울지구 외 신청자, 관리자가 직접 추가한 사용자 중 미입금자입니다. 서울지구 일반 신청자는 캠퍼스 단위로만 확인합니다.</p></div>
            <select value={personFilter} onChange={(event) => setPersonFilter(event.target.value as PersonFilter)}>
              <option value="all">전체 미입금</option><option value="missing">입금 정보 없음</option><option value="pending">입금 대기</option><option value="refunded">환불 상태</option>
            </select>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>신청자</th><th>개별 확인 사유</th><th>소속</th><th>입금 상태</th><th>예매·버스표</th><th>확인할 금액</th></tr></thead>
              <tbody>
                {!loading && people.length === 0 ? (
                  <tr><td className={styles.emptyCell} colSpan={6}>조건에 맞는 개인 미입금자가 없습니다.</td></tr>
                ) : people.map((person) => (
                  <tr key={person.id}>
                    <td><strong>{person.name || '이름 없음'}</strong><span>{person.phone || '-'}</span></td>
                    <td><div className={styles.reasonList}>{person.reviewReasons.map((reason) => <span key={reason} className={styles.reasonBadge}>{reviewReasonLabels[reason]}</span>)}</div></td>
                    <td><strong>{person.campus || '캠퍼스 미등록'}</strong><span>{person.district} / {person.team}</span></td>
                    <td><span className={`${styles.badge} ${styles[`payment_${person.paymentStatus}`]}`}>{person.paymentStatus === 'missing' ? '입금 정보 없음' : person.paymentStatus === 'refunded' ? '환불 상태' : '입금 대기'}</span></td>
                    <td><strong>{person.reservationStatus === 'confirmed' ? '예매 확정' : '예매 신청'}</strong><span>{person.confirmedTicket ? '버스표 확정' : '버스표 미확정'}</span></td>
                    <td><strong>{formatCurrency(review.ticketPrice)}</strong><button type="button" className={styles.textButton} onClick={() => navigate(`/admin/users?campus=${encodeURIComponent(person.campus)}`)}>개인 관리 열기</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
};

export default AdminFinalPaymentReviewPage;
