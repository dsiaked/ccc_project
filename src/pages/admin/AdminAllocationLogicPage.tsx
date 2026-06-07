import {
  ArrowLeft,
  Calculator,
  GitMerge,
  ListOrdered,
  Route,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import AdminHeader from './AdminHeader';

import styles from './AdminAllocationLogicPage.module.css';

const allocationLogicOptions = [
  {
    title: '1·2지망 가중치',
    badge: '효용 기반',
    summary:
      '도착역을 운행했을 때 얻는 1·2지망 효용에서 실제 버스 대여비를 뺀 순효용이 큰 추천안을 우선합니다.',
    priority: [
      '순효용 높음',
      '미배차 인원 적음',
      '빈 좌석 적음',
      '총 대여비 낮음',
    ],
    formula:
      '총 효용 = 1지망 인원 x 1지망 효용 + 2지망 인원 x 2지망 효용\n순효용 = 총 효용 - 총 버스 대여비',
    goodFor:
      '수요가 적은 도착역까지 운행할지 비용과 신청자 효용을 함께 보고 판단할 때',
    caution:
      '순효용을 높이기 위해 일부 도착역을 제외할 수 있으므로 미배차 인원을 반드시 확인해야 합니다.',
  },
  {
    title: '최소 비용',
    badge: '전체 수요 운송',
    summary:
      '모든 1지망 수요를 태울 수 있는 추천안 중 총 버스 대여비가 낮은 안을 우선합니다.',
    priority: ['총 대여비 낮음', '빈 좌석 적음', '차량 수 적음'],
    formula: '정렬 = 총 버스 대여비 -> 빈 좌석 -> 차량 수',
    goodFor:
      '모든 1지망 신청자를 배차하면서 승인받을 총 대여비를 최대한 줄여야 할 때',
    caution:
      '모든 승객을 1·2지망 안에 배차하며, 버스를 줄일 수 있다면 일부 승객은 2지망으로 배차될 수 있습니다.',
  },
];

const AdminAllocationLogicPage = () => {
  const navigate = useNavigate();

  return (
    <div className={styles.pageContainer}>
      <AdminHeader />

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
              현재 적용된 최소 탑승 인원, 차량 통합, 추천안 비교, 자동 배차
              기준을 설명합니다.
            </p>
          </div>
        </section>

        <section className={styles.section}>
          <h2>모든 추천안의 공통 규칙</h2>
          <div className={styles.ruleGrid}>
            <article>
              <Route size={20} />
              <strong>1지망 인원이 기본 탑승 수요</strong>
              <p>
                도착역별 1지망 인원을 실제 배차 인원으로 계산합니다. 2지망은
                도착역 우선순위와 효용 계산에 사용합니다.
              </p>
            </article>
            <article>
              <GitMerge size={20} />
              <strong>차량당 최소 36명 권장</strong>
              <p>
                35명 이하 차량은 같은 도착역 차량에 탑승자 전원을 수용할 빈
                좌석이 있을 때 통합합니다. 모든 차량은 하나의 도착역으로
                직행합니다.
              </p>
            </article>
            <article>
              <ListOrdered size={20} />
              <strong>최소 인원 미달은 경고</strong>
              <p>
                차량 통합 후에도 36명 미만인 차량은 추천안에 남겨 관리자가
                검토할 수 있습니다. 최종 확정 시 전체 관리자의 예외 승인이
                필요합니다.
              </p>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>옵션별 추천안 정렬</h2>
              <p>
                아래 우선순위는 실제 화면 정렬 순서입니다. 앞 기준이 같을 때
                다음 기준으로 비교합니다.
              </p>
            </div>
          </div>

          <div className={styles.optionGrid}>
            {allocationLogicOptions.map((option) => (
              <article key={option.title} className={styles.optionCard}>
                <div className={styles.optionCardHeader}>
                  <div>
                    <span>{option.badge}</span>
                    <strong>{option.title}</strong>
                  </div>
                </div>

                <p className={styles.optionSummary}>{option.summary}</p>

                <div className={styles.optionBlock}>
                  <h3>우선순위</h3>
                  <ol>
                    {option.priority.map((priority) => (
                      <li key={priority}>{priority}</li>
                    ))}
                  </ol>
                </div>

                <div className={styles.optionFormula}>
                  <h3>계산 기준</h3>
                  <code>{option.formula}</code>
                </div>

                <div className={styles.optionMetaGrid}>
                  <div>
                    <h3>적합한 상황</h3>
                    <p>{option.goodFor}</p>
                  </div>
                  <div>
                    <h3>주의점</h3>
                    <p>{option.caution}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2>추천안이 만들어지는 순서</h2>
          <ol className={styles.stepList}>
            <li>
              <strong>도착역 수요와 차량 옵션 확인</strong>
              <p>
                도착역별 지망 인원을 집계하고, 관리자가 등록한 차량 정원과
                예상 대여비를 불러옵니다.
              </p>
            </li>
            <li>
              <strong>차량 조합과 도착역 초안 생성</strong>
              <p>
                수요가 큰 도착역부터 차량을 배정합니다. 처음에는 차량마다 한
                도착역을 배정하고, 해당 도착역 인원이 많으면 여러 차량으로
                나눕니다.
              </p>
            </li>
            <li>
              <strong>35명 이하 동일 도착역 차량 통합</strong>
              <p>
                탑승 인원이 가장 적은 차량부터 같은 도착역으로 운행하며 전체
                인원을 수용할 수 있는 차량으로 합칩니다.
              </p>
            </li>
            <li>
              <strong>유효한 추천안만 정렬</strong>
              <p>
                최소 인원 미달 여부를 경고로 표시하고, 선택한 옵션의 우선순위에
                따라 최대 5개 추천안을 보여줍니다.
              </p>
            </li>
          </ol>
        </section>

        <section className={styles.section}>
          <h2>선택 로직대로 자동 배차할 때</h2>
          <div className={styles.decisionGrid}>
            <article>
              <strong>신청자 선택 순서</strong>
              <p>
                각 도착역을 선호한 미확정 신청자를 지망 순위, 신청 시각, 이름
                순으로 정렬해 추천안의 도착역별 목표 인원만큼 배차합니다.
              </p>
            </article>
            <article>
              <strong>최소비용 모드의 2지망 활용</strong>
              <p>
                특정 버스 승객 전원을 각자의 다른 지망 버스로 이동시켜 버스
                한 대를 줄일 수 있으면 2지망 배정을 허용합니다. 실제 1지망
                반영률은 임시 배차안 생성 후 계산합니다.
              </p>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <h2>최종 선택 체크</h2>
          <div className={styles.decisionGrid}>
            <article>
              <strong>최소 인원 미달 차량을 확인합니다</strong>
              <p>
                36명 미만 차량도 추천안에 포함됩니다. 확정 전에 비용과 운행
                필요성을 확인하고 관리자 예외 승인 여부를 결정해야 합니다.
              </p>
            </article>
            <article>
              <strong>미배차 인원은 별도 승인합니다</strong>
              <p>
                1·2지망 가중치 옵션에서 미배차가 생기면 비용상 합리적이어도
                추가 안내와 대체 이동 수단을 함께 검토해야 합니다.
              </p>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
};

export default AdminAllocationLogicPage;
