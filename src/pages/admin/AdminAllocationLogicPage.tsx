import {
  ArrowLeft,
  ArrowRight,
  Bus,
  Calculator,
  CheckCircle2,
  GitBranch,
  Info,
  ListChecks,
  Scale,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import AdminHeader from './AdminHeader';
import styles from './AdminAllocationLogicPage.module.css';

const baselineObjectives = [
  {
    title: '전체 버스 수 최소화',
    description:
      '모든 승객을 1·2지망 안에 배정하면서 필요한 버스 수의 최솟값을 먼저 증명합니다.',
  },
  {
    title: '2지망 배정 인원 최소화',
    description:
      '최소 버스 수를 고정한 뒤, 그 조건에서 2지망으로 이동하는 승객 수를 최소화합니다.',
  },
];

const detailedObjectives = [
  '캠퍼스가 사용하는 버스 수 최소화',
  '분리된 캠퍼스 인원의 불균형 최소화',
  '버스별 1~2명 캠퍼스 그룹 최소화',
  '버스별 홀수 캠퍼스 그룹 최소화',
  '팀이 사용하는 버스 수 최소화',
  '분리된 팀 인원의 불균형 최소화',
  '같은 목적지 버스 간 탑승 인원 차이 최소화',
  '동일 입력에 동일 결과가 나오도록 최종 순서 고정',
];

const safetyChecks = [
  '계산 이후 활성 예약자가 바뀌지 않았는지 확인',
  '모든 승객이 정확히 한 번 배정됐는지 확인',
  '모든 배정이 승객의 1지망 또는 2지망인지 확인',
  '버스 정원 초과와 중복 좌석이 없는지 확인',
  '버스 수와 총비용이 계산 결과와 일치하는지 확인',
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
          배차 계산으로 돌아가기
        </button>

        <section className={styles.hero}>
          <div className={styles.heroIcon}>
            <Calculator size={30} />
          </div>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>OR-Tools CP-SAT 정확 최적화</span>
            <h1>지망 배정 최적화 로직</h1>
            <p>
              승객의 1·2지망을 지키면서 최소 버스 수를 수학적으로 증명하고,
              필요하면 캠퍼스와 팀이 최대한 함께 탑승하도록 상세 균형을
              추가 계산합니다.
            </p>
          </div>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => navigate('/admin/allocation')}
          >
            배차 계산 실행
            <ArrowRight size={17} />
          </button>
        </section>

        <section className={styles.summaryStrip}>
          <article>
            <strong>1·2지망 안에서만</strong>
            <span>초기 배차는 지망 밖으로 배정하지 않습니다.</span>
          </article>
          <article>
            <strong>최소 버스 수 증명</strong>
            <span>단순 추천이 아니라 OPTIMAL 결과만 사용합니다.</span>
          </article>
          <article>
            <strong>우선순위 고정</strong>
            <span>후순위 품질 개선이 앞선 최적값을 해치지 않습니다.</span>
          </article>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <div className={styles.sectionIcon}>
              <GitBranch size={21} />
            </div>
            <div>
              <h2>계산이 진행되는 순서</h2>
              <p>작업 생성부터 검증된 임시 배차안 생성까지의 흐름입니다.</p>
            </div>
          </div>
          <ol className={styles.flowList}>
            <li>
              <span>1</span>
              <div>
                <strong>활성 예약 스냅샷 생성</strong>
                <p>
                  취소되지 않은 예약자의 익명 ID, 캠퍼스, 팀, 1지망,
                  2지망과 버스 설정을 고정합니다.
                </p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>기본 최저비용 계산</strong>
                <p>
                  최소 버스 수를 먼저 증명하고, 같은 버스 수 안에서 2지망
                  배정 인원을 최소화합니다.
                </p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>선택형 상세 균형 계산</strong>
                <p>
                  기본 최적값을 그대로 유지하면서 캠퍼스·팀 묶음과 버스별
                  탑승 균형을 개선합니다.
                </p>
              </div>
            </li>
            <li>
              <span>4</span>
              <div>
                <strong>DB 재검증 후 임시 배차안 생성</strong>
                <p>
                  예약 변경, 지망 위반, 중복 좌석, 정원 초과, 비용 조작이
                  없는 결과만 배차안으로 저장합니다.
                </p>
              </div>
            </li>
          </ol>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <div className={styles.sectionIcon}>
              <ListChecks size={21} />
            </div>
            <div>
              <h2>반드시 지키는 조건</h2>
              <p>최적화 품질보다 먼저 충족해야 하는 강제 조건입니다.</p>
            </div>
          </div>
          <div className={styles.ruleGrid}>
            <article>
              <Users size={20} />
              <strong>모든 승객 배정</strong>
              <p>활성 승객은 누락 없이 정확히 한 번 배정됩니다.</p>
            </article>
            <article>
              <CheckCircle2 size={20} />
              <strong>1·2지망 제한</strong>
              <p>초기 최적화 결과는 각 승객의 두 지망 중 하나만 사용합니다.</p>
            </article>
            <article>
              <Bus size={20} />
              <strong>버스별 단일 목적지</strong>
              <p>한 버스는 하나의 목적지만 운행하며 정원을 넘지 않습니다.</p>
            </article>
            <article>
              <ShieldCheck size={20} />
              <strong>빈 버스 금지</strong>
              <p>승객이 없는 버스는 최적화 결과에 포함되지 않습니다.</p>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <div className={styles.sectionIcon}>
              <Scale size={21} />
            </div>
            <div>
              <h2>목적함수 우선순위</h2>
              <p>
                각 단계의 최적값을 고정한 뒤 다음 단계로 넘어가는 사전식
                최적화 방식입니다.
              </p>
            </div>
          </div>
          <div className={styles.modeGrid}>
            <article className={styles.modeCard}>
              <div className={styles.modeHeader}>
                <span className={styles.requiredBadge}>기본 계산 · 필수</span>
                <Calculator size={22} />
              </div>
              <h3>최저비용과 지망 품질</h3>
              <p>
                버스 종류와 대당 가격이 하나이므로, 최소 버스 수가 곧 최소
                총비용입니다.
              </p>
              <ol className={styles.objectiveList}>
                {baselineObjectives.map((objective) => (
                  <li key={objective.title}>
                    <strong>{objective.title}</strong>
                    <span>{objective.description}</span>
                  </li>
                ))}
              </ol>
              <code className={styles.formula}>
                최소 버스 수 → 그 값을 고정 → 최소 2지망 인원
              </code>
            </article>

            <article className={styles.modeCard}>
              <div className={styles.modeHeader}>
                <span className={styles.optionalBadge}>상세 균형 · 선택</span>
                <Sparkles size={22} />
              </div>
              <h3>캠퍼스·팀·탑승 균형</h3>
              <p>
                기본 계산의 최소 버스 수와 최소 2지망 인원을 그대로 유지한
                채 아래 품질을 순서대로 개선합니다.
              </p>
              <ol className={styles.compactList}>
                {detailedObjectives.map((objective) => (
                  <li key={objective}>{objective}</li>
                ))}
              </ol>
              <div className={styles.notice}>
                후순위 단계가 제한 시간 안에 완전히 증명되지 않으면 발견한
                최선 결과를 사용하고 경고를 표시합니다.
              </div>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <div className={styles.sectionIcon}>
              <Info size={21} />
            </div>
            <div>
              <h2>간단한 배정 예시</h2>
              <p>버스 수 절감이 1지망 유지보다 먼저 적용되는 이유입니다.</p>
            </div>
          </div>
          <div className={styles.example}>
            <div className={styles.exampleInput}>
              <strong>정원 3명 버스</strong>
              <span>A → B 지망 승객 2명</span>
              <span>B → A 지망 승객 1명</span>
            </div>
            <ArrowRight size={22} />
            <div className={styles.exampleResult}>
              <strong>B행 버스 1대</strong>
              <span>B 1지망 1명 + A 2지망 2명</span>
              <span>총 1대 · 2지망 2명</span>
            </div>
          </div>
          <p className={styles.exampleCaption}>
            A행과 B행을 각각 운행하면 2대가 필요하므로, 최우선 목표인 최소
            버스 수를 위해 A행이 제외될 수 있습니다. 이 경우 강한 경고가
            표시됩니다.
          </p>
        </section>

        <section className={styles.twoColumnSection}>
          <article className={styles.section}>
            <div className={styles.sectionHeading}>
              <div className={styles.warningIcon}>
                <TriangleAlert size={21} />
              </div>
              <div>
                <h2>경고로만 처리되는 조건</h2>
                <p>계산은 허용하지만 운영자가 확인해야 합니다.</p>
              </div>
            </div>
            <ul className={styles.checkList}>
              <li>권장 최소 탑승 인원보다 적은 버스</li>
              <li>1지망 목적지가 운행에서 제외된 경우</li>
              <li>상세 균형 후순위 단계의 최적성이 미증명된 경우</li>
            </ul>
            <div className={styles.notice}>
              권장 최소 탑승 인원은 강제 하한이 아닙니다. 인원이 적어도 전체
              배정에 필요하면 버스가 생성됩니다.
            </div>
          </article>

          <article className={styles.section}>
            <div className={styles.sectionHeading}>
              <div className={styles.sectionIcon}>
                <ShieldCheck size={21} />
              </div>
              <div>
                <h2>임시 배차안 생성 전 검증</h2>
                <p>최적화 결과를 그대로 신뢰하지 않고 DB에서 다시 검사합니다.</p>
              </div>
            </div>
            <ul className={styles.checkList}>
              {safetyChecks.map((check) => (
                <li key={check}>{check}</li>
              ))}
            </ul>
          </article>
        </section>
      </main>
    </div>
  );
};

export default AdminAllocationLogicPage;
