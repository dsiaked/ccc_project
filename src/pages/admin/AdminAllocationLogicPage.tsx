import { ArrowLeft, Calculator, GitCompare, Route, Scale } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import Header from '../../components/Header';

import styles from './AdminAllocationLogicPage.module.css';

const AdminAllocationLogicPage = () => {
  const navigate = useNavigate();

  return (
    <div className={styles.pageContainer}>
      <Header />

      <main className={styles.main}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate('/admin/allocation')}
        >
          <ArrowLeft size={18} />
          배차 계산 화면
        </button>

        <section className={styles.hero}>
          <div className={styles.heroIcon}>
            <Calculator size={30} />
          </div>
          <div>
            <h1>최적 배차 계산 로직</h1>
            <p>
              귀가 버스 배차안이 어떤 입력값, 제약 조건, 비교 기준으로
              추천되는지 정리한 설명입니다.
            </p>
          </div>
        </section>

        <section className={styles.section}>
          <h2>기본 전제</h2>
          <div className={styles.ruleGrid}>
            <article>
              <Route size={20} />
              <strong>한 버스는 하나의 행선지만 담당</strong>
              <p>
                한 차량에 여러 행선지를 섞지 않습니다. 같은 행선지 인원이 차량
                정원을 넘으면 그 행선지만 여러 차량으로 나눕니다.
              </p>
            </article>
            <article>
              <Scale size={20} />
              <strong>1지망 인원을 기본 수요로 사용</strong>
              <p>
                일반 계산 모드는 1지망 인원을 모두 태울 수 있는 배차 조합만
                후보로 봅니다. 2지망은 우선순위와 운영 참고 지표에 사용합니다.
              </p>
            </article>
            <article>
              <GitCompare size={20} />
              <strong>여러 후보안을 동시에 비교</strong>
              <p>
                비용, 빈 좌석, 차량 수, 1지망 분산, 순효용 같은 지표로 추천안을
                비교합니다.
              </p>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <h2>계산 단계</h2>
          <ol className={styles.stepList}>
            <li>
              <strong>행선지별 수요 집계</strong>
              <p>
                예약 데이터의 1지망, 2지망, 3지망 수를 행선지별로 집계합니다.
                실제 배차 인원은 1지망 인원을 기본으로 합니다.
              </p>
            </li>
            <li>
              <strong>버스 옵션 정리</strong>
              <p>
                관리자가 등록한 차량 정원과 대여비를 사용합니다. 정원이 0 이하인
                옵션이나 음수 가격은 계산에서 제외합니다.
              </p>
            </li>
            <li>
              <strong>후보 조합 생성</strong>
              <p>
                등록된 버스 옵션을 조합해 전체 수요를 감당할 수 있는 후보를
                만듭니다. 일반 모드는 모든 1지망 인원을 태울 수 있는 조합만
                남깁니다.
              </p>
            </li>
            <li>
              <strong>행선지별 단독 배정</strong>
              <p>
                수요가 큰 행선지부터 빈 차량을 배정합니다. 차량 하나에는 하나의
                행선지만 들어가며, 가능한 경우 남는 좌석이 적은 차량을 우선
                선택합니다.
              </p>
            </li>
            <li>
              <strong>추천안 정렬</strong>
              <p>
                선택한 최적화 기준에 따라 후보안을 다시 정렬합니다. 균형 추천은
                비용, 빈 좌석, 차량 수를 함께 보고, 다른 모드는 각 기준을 더
                강하게 반영합니다.
              </p>
            </li>
          </ol>
        </section>

        <section className={styles.section}>
          <h2>최적화 기준</h2>
          <div className={styles.modeList}>
            <article>
              <strong>균형 추천</strong>
              <p>
                좌석 효율 보상에서 비용, 빈 좌석, 차량 수 페널티를 뺀 추천
                점수가 높은 안을 우선합니다.
              </p>
            </article>
            <article>
              <strong>1지망 최대 반영</strong>
              <p>
                1지망 행선지가 여러 차량으로 쪼개지는 정도를 줄이고, 행선지
                운영이 단순한 안을 우선합니다.
              </p>
            </article>
            <article>
              <strong>1·2지망 효용 금액</strong>
              <p>
                1지망 효용과 2지망 효용을 원 단위로 입력합니다. 총 효용에서
                버스 대여비를 뺀 순효용이 큰 안을 우선합니다.
              </p>
            </article>
            <article>
              <strong>최소 비용</strong>
              <p>총 버스 대여비가 낮은 안을 먼저 보여줍니다.</p>
            </article>
            <article>
              <strong>빈 좌석 최소</strong>
              <p>총 좌석 대비 남는 좌석이 적은 안을 먼저 보여줍니다.</p>
            </article>
            <article>
              <strong>차량 수 최소</strong>
              <p>운영해야 하는 차량 대수가 적은 안을 먼저 보여줍니다.</p>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <h2>각 배차 로직의 타당성 검토</h2>
          <div className={styles.reviewList}>
            <article>
              <div className={styles.reviewTitleRow}>
                <strong>균형 추천</strong>
                <span>기본 추천</span>
              </div>
              <p>
                좌석 효율, 총 비용, 빈 좌석, 차량 수를 함께 반영하므로 별도의
                운영 방침이 정해지지 않았을 때 가장 무난한 기준입니다. 모든
                1지망 인원을 태우는 후보 중에서 과도하게 비싸거나 좌석이 많이
                남는 안을 자연스럽게 뒤로 보냅니다.
              </p>
              <ul>
                <li>타당한 경우: 비용과 편의, 운영 난이도를 함께 봐야 할 때</li>
                <li>주의할 점: 특정 목표 하나를 강하게 최적화하지는 않습니다.</li>
                <li>해석 방법: 추천 1안이 운영상 큰 문제가 없으면 기본 확정안으로 삼기 좋습니다.</li>
              </ul>
            </article>

            <article>
              <div className={styles.reviewTitleRow}>
                <strong>1지망 최대 반영</strong>
                <span>만족도 우선</span>
              </div>
              <p>
                같은 1지망 목적지가 여러 버스로 쪼개지는 정도를 먼저 줄이고,
                여러 목적지가 한 차량에 섞이는 상황도 낮게 평가합니다. 신청자가
                선택한 하차지 단위로 안내와 탑승 관리가 명확해지는 장점이
                있습니다.
              </p>
              <ul>
                <li>타당한 경우: 목적지별 안내 혼선을 줄이는 것이 중요할 때</li>
                <li>주의할 점: 비용이나 빈 좌석이 균형 추천보다 늘 수 있습니다.</li>
                <li>해석 방법: 같은 목적지 사람들이 한 차량 또는 적은 차량에 모이는지 확인하세요.</li>
              </ul>
            </article>

            <article>
              <div className={styles.reviewTitleRow}>
                <strong>1·2지망 효용 금액</strong>
                <span>효용 기반</span>
              </div>
              <p>
                1지망과 2지망을 돈으로 환산한 효용에서 버스 대여비를 뺀
                순효용을 기준으로 봅니다. 이 모드는 모든 목적지를 반드시
                배차하기보다, 효용보다 비용이 큰 목적지는 배차하지 않는 후보도
                허용합니다.
              </p>
              <ul>
                <li>타당한 경우: 적은 수요 목적지를 무조건 운행할지 고민될 때</li>
                <li>주의할 점: 미배차 인원이 생길 수 있으므로 반드시 확인해야 합니다.</li>
                <li>해석 방법: 순효용, 미배차 인원, 총 비용을 함께 보고 운영자가 최종 승인해야 합니다.</li>
              </ul>
            </article>

            <article>
              <div className={styles.reviewTitleRow}>
                <strong>최소 비용</strong>
                <span>예산 우선</span>
              </div>
              <p>
                총 버스 대여비가 가장 낮은 후보를 먼저 보여줍니다. 예산 상한이
                분명하거나 추가 비용을 최대한 줄여야 하는 상황에서 판단 기준이
                명확합니다.
              </p>
              <ul>
                <li>타당한 경우: 예산 제약이 강하거나 비용 승인 기준이 빡빡할 때</li>
                <li>주의할 점: 빈 좌석, 차량 수, 목적지 분산이 불리할 수 있습니다.</li>
                <li>해석 방법: 비용이 낮아도 운영 경고가 많으면 균형 추천과 비교하세요.</li>
              </ul>
            </article>

            <article>
              <div className={styles.reviewTitleRow}>
                <strong>빈 좌석 최소</strong>
                <span>좌석 낭비 최소</span>
              </div>
              <p>
                총 좌석과 배차 인원의 차이를 최소화합니다. 좌석을 최대한 꽉
                채우는 방향이므로 잔여석 판매 계획이나 차량 낭비를 줄이는 데
                적합합니다.
              </p>
              <ul>
                <li>타당한 경우: 남는 좌석을 줄이고 차량 효율을 높이고 싶을 때</li>
                <li>주의할 점: 아주 꽉 찬 차량은 현장 예비 좌석이 부족할 수 있습니다.</li>
                <li>해석 방법: 만석 차량이 많다면 현장 변동 가능성을 고려해 여유 좌석을 확인하세요.</li>
              </ul>
            </article>

            <article>
              <div className={styles.reviewTitleRow}>
                <strong>차량 수 최소</strong>
                <span>운영 단순화</span>
              </div>
              <p>
                운행해야 할 차량 대수를 가장 적게 만드는 후보를 우선합니다.
                인솔자 배치, 차량 집결, 출발 통제처럼 현장 운영 복잡도를 줄이는
                데 유리합니다.
              </p>
              <ul>
                <li>타당한 경우: 현장 인력이나 탑승 관리 리소스가 제한적일 때</li>
                <li>주의할 점: 큰 차량 중심으로 잡히며 비용 또는 빈 좌석이 늘 수 있습니다.</li>
                <li>해석 방법: 차량 수가 줄어든 만큼 비용과 빈 좌석 증가가 감당 가능한지 비교하세요.</li>
              </ul>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <h2>운영자가 최종 선택할 때 볼 기준</h2>
          <div className={styles.decisionGrid}>
            <article>
              <strong>1. 먼저 균형 추천을 기준안으로 둡니다</strong>
              <p>
                특별한 제약이 없다면 균형 추천 1안을 기준으로 삼고, 비용 최소나
                차량 수 최소 안과 차이가 큰지 비교합니다.
              </p>
            </article>
            <article>
              <strong>2. 미배차 인원은 별도 승인 기준입니다</strong>
              <p>
                1·2지망 효용 금액 모드에서 미배차가 생기면 비용상 합리적일 수는
                있지만, 실제 운영에서는 추가 안내나 대체 이동 수단이 필요합니다.
              </p>
            </article>
            <article>
              <strong>3. 만석 차량은 현장 리스크가 있습니다</strong>
              <p>
                빈 좌석 최소 안이 좋아 보여도 당일 변경, 지각, 명단 오류를
                고려하면 일부 여유 좌석이 더 안전할 수 있습니다.
              </p>
            </article>
            <article>
              <strong>4. 목적지 분산은 안내 비용입니다</strong>
              <p>
                같은 하차지가 여러 차량으로 갈라지면 안내 문구와 탑승 확인이
                복잡해집니다. 분산 건수가 많으면 1지망 최대 반영 안을 비교하세요.
              </p>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <h2>효용 금액 모드</h2>
          <div className={styles.formulaBox}>
            <strong>순효용 = 총 효용 - 버스 대여비</strong>
            <p>
              총 효용은 행선지별로 1지망 인원 × 1지망 효용 + 2지망 인원 ×
              2지망 효용으로 계산합니다. 순효용이 낮거나 음수인 행선지는
              배차하지 않는 안이 더 좋은 후보가 될 수 있습니다.
            </p>
          </div>
        </section>

        <section className={styles.section}>
          <h2>공식 정리</h2>
          <div className={styles.formulaList}>
            <article>
              <strong>기본 수요</strong>
              <code>수요(d) = d 행선지의 1지망 인원</code>
              <p>
                일반 계산 모드는 각 행선지의 1지망 인원을 반드시 태워야 할
                수요로 봅니다.
              </p>
            </article>

            <article>
              <strong>총 좌석과 빈 좌석</strong>
              <code>총 좌석 = Σ 배정 버스 정원</code>
              <code>빈 좌석 = 총 좌석 - 총 배차 인원</code>
              <p>
                각 버스는 하나의 행선지만 담당하므로, 행선지별로 배정된 차량의
                정원을 합산합니다.
              </p>
            </article>

            <article>
              <strong>좌석 효율</strong>
              <code>좌석 효율(%) = 총 배차 인원 / 총 좌석 × 100</code>
              <p>좌석 효율이 높을수록 같은 차량으로 더 많은 인원을 태웁니다.</p>
            </article>

            <article>
              <strong>1인 비용</strong>
              <code>1인 비용 = 총 버스 대여비 / 총 배차 인원</code>
              <p>배차된 인원 기준 평균 대여비입니다.</p>
            </article>

            <article>
              <strong>균형 추천 점수</strong>
              <code>
                추천 점수 = 좌석 효율 × 1000 - 총비용 / 10000 - 빈 좌석 × 25 -
                차량 수 × 100
              </code>
              <p>
                점수가 높을수록 좋은 안입니다. 좌석 효율은 보상으로 더하고,
                비용·빈 좌석·차량 수는 페널티로 뺍니다.
              </p>
            </article>

            <article>
              <strong>1지망 최대 반영 정렬</strong>
              <code>
                1순위: 행선지 분산 수 최소 → 2순위: 혼합 차량 수 최소 → 3순위:
                좌석 효율 최대
              </code>
              <p>
                현재는 한 버스가 하나의 행선지만 담당하므로 혼합 차량은 0이 되는
                구조입니다. 같은 행선지가 여러 차량으로 나뉘는 정도를 줄이는 데
                초점을 둡니다.
              </p>
            </article>

            <article>
              <strong>효용 금액</strong>
              <code>
                총 효용 = 1지망 인원 × 1지망 효용 + 2지망 인원 × 2지망 효용
              </code>
              <code>순효용 = 총 효용 - 총 버스 대여비</code>
              <p>
                1·2지망 효용 금액 모드는 순효용이 큰 배차안을 우선합니다.
                순효용이 낮은 행선지는 배차하지 않는 편이 더 좋은 후보가 될 수
                있습니다.
              </p>
            </article>

            <article>
              <strong>최소 비용 정렬</strong>
              <code>
                1순위: 총 버스 대여비 최소 → 2순위: 빈 좌석 최소 → 3순위: 차량
                수 최소
              </code>
              <p>운영 비용 절감을 가장 우선합니다.</p>
            </article>

            <article>
              <strong>빈 좌석 최소 정렬</strong>
              <code>
                1순위: 빈 좌석 최소 → 2순위: 총 버스 대여비 최소 → 3순위: 차량
                수 최소
              </code>
              <p>좌석 낭비를 줄이는 데 초점을 둡니다.</p>
            </article>

            <article>
              <strong>차량 수 최소 정렬</strong>
              <code>
                1순위: 차량 수 최소 → 2순위: 총 버스 대여비 최소 → 3순위: 빈
                좌석 최소
              </code>
              <p>현장 운영 복잡도를 줄이는 데 초점을 둡니다.</p>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
};

export default AdminAllocationLogicPage;
