import {
  ArrowLeft,
  Calculator,
  ListOrdered,
  Route,
  ShieldCheck,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import AdminHeader from './AdminHeader';

import styles from './AdminAllocationLogicPage.module.css';

const priorities = [
  '총 버스 대수 최소화: 버스가 모두 같은 가격이므로 곧 총비용 최소화입니다.',
  '2지망 배정 인원 최소화',
  '같은 캠퍼스가 여러 버스로 분리되는 횟수 최소화',
  '분리된 캠퍼스 인원을 가능한 균일하게 배분',
  '캠퍼스별 1~2명 고립과 홀수 그룹 최소화',
  '팀 분리와 팀 인원 불균형 최소화',
  '전체 버스 탑승 인원 균형과 결정론적 결과',
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
          최소비용 배차
        </button>

        <section className={styles.hero}>
          <div className={styles.heroIcon}>
            <Calculator size={30} />
          </div>
          <div>
            <h1>정확 최소비용 배차 로직</h1>
            <p>
              휴리스틱 추천이 아니라, 서버의 CP-SAT 최적화가 최소 버스 대수를
              수학적으로 증명한 경우에만 임시 배차안을 생성합니다.
            </p>
          </div>
        </section>

        <section className={styles.section}>
          <h2>강제 조건</h2>
          <div className={styles.ruleGrid}>
            <article>
              <Route size={20} />
              <strong>모든 승객 배차</strong>
              <p>초기 임시안에서는 모든 활성 승객을 반드시 1·2지망 중 하나에 배정합니다.</p>
            </article>
            <article>
              <ShieldCheck size={20} />
              <strong>정확 최적해만 사용</strong>
              <p>작업 상태가 OPTIMAL이고 입력과 결과 검증을 모두 통과해야 임시안을 만들 수 있습니다.</p>
            </article>
            <article>
              <ListOrdered size={20} />
              <strong>목적지별 전용 버스</strong>
              <p>버스 한 대는 하나의 목적지만 운행하며 정원을 초과할 수 없습니다.</p>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <h2>최적화 우선순위</h2>
          <ol className={styles.stepList}>
            {priorities.map((priority) => (
              <li key={priority}>
                <strong>{priority}</strong>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.section}>
          <h2>관리자 조정 규칙</h2>
          <div className={styles.decisionGrid}>
            <article>
              <strong>비용 경고</strong>
              <p>
                최소 탑승 인원 미달 버스와 최적해 이후 추가된 버스는 경고로 표시하며,
                전체 관리자가 확인 후 확정할 수 있습니다.
              </p>
            </article>
            <article>
              <strong>1·2지망 외 배정</strong>
              <p>
                초기안에는 허용하지 않습니다. 임시안에서 관리자가 수정한 경우 강한 경고와
                별도 승인이 필요하고, 승인자·시각·승객 ID가 감사 기록에 남습니다.
              </p>
            </article>
            <article>
              <strong>예약 변경 반영</strong>
              <p>
                신규·취소 예약은 기존 승객 배정을 유지하면서 임시안에 자동 반영합니다.
                필요한 경우 동일 규격 버스를 추가하고 관리자가 최종 조정합니다.
              </p>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
};

export default AdminAllocationLogicPage;
