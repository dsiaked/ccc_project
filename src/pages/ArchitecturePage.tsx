import { Link } from 'react-router-dom';
import styles from './ArchitecturePage.module.css';

const layers = [
  {
    number: '01',
    eyebrow: 'Frontend',
    title: 'React 웹 애플리케이션',
    description:
      '사용자와 관리자가 사용하는 단일 페이지 애플리케이션입니다. 화면은 업무별 서비스 계층을 통해 Supabase와 통신합니다.',
    items: ['React 19 + TypeScript', 'Vite + React Router', 'CSS Modules', 'Firebase Hosting'],
  },
  {
    number: '02',
    eyebrow: 'Backend',
    title: 'Supabase 중심 백엔드',
    description:
      '인증, 데이터 저장, 접근 제어와 핵심 업무 처리를 담당합니다. 별도의 Express 또는 NestJS 서버는 없습니다.',
    items: ['Supabase Auth', 'PostgreSQL + RLS', 'PostgreSQL RPC', 'Edge Functions'],
  },
  {
    number: '03',
    eyebrow: 'Compute',
    title: '배차 최적화 Worker',
    description:
      '오래 걸리는 정확 배차 계산을 웹 요청과 분리해 실행합니다. 검증된 최적 결과만 배차 초안으로 전환됩니다.',
    items: ['Python', 'OR-Tools CP-SAT', 'Local Worker', 'Google Cloud Run Job'],
  },
] as const;

const frontendFolders = [
  ['components/', '공통 UI, 인증, 상태 화면'],
  ['pages/', '일반 사용자 화면'],
  ['pages/admin/', '관리자 업무 화면'],
  ['routes/', '공개·관리자 라우트'],
  ['lib/', '사용자용 Supabase 서비스'],
  ['lib/admin/', '관리자용 서비스와 모델'],
  ['types/ · utils/', '공통 타입과 유틸리티'],
] as const;

const backendItems = [
  ['Auth', '로그인 세션과 사용자 신원을 관리합니다.'],
  ['RLS', '사용자·캠퍼스·관리자 역할에 따라 조회 범위를 제한합니다.'],
  ['RPC', '예약 저장, 결제 확정, 배차 확정처럼 중요한 변경을 트랜잭션으로 처리합니다.'],
  ['Edge Functions', '서비스 역할 키 또는 외부 API가 필요한 작업만 실행합니다.'],
] as const;

const dataGroups = [
  ['사용자·조직', 'profiles, admin_roles, districts, teams, campuses'],
  ['예약·결제', 'reservations, payments, campus_transfers'],
  ['배차·탑승', 'bus_options, bus_allocations, allocation_optimization_jobs, boarding_*'],
  ['소통·운영', 'campus_requests, personal_inquiries, home_announcements, audit logs'],
] as const;

const requestSteps = [
  ['1', '화면 입력', 'ReservationPage가 신청 정보를 수집하고 검증합니다.'],
  ['2', '서비스 호출', 'reservationService가 save_user_reservation RPC를 호출합니다.'],
  ['3', '서버 검증', 'PostgreSQL 함수가 인증, 마감, 입력값과 상태를 확인합니다.'],
  ['4', '원자적 저장', '예약과 관련 데이터를 하나의 트랜잭션으로 저장합니다.'],
] as const;

const optimizationSteps = [
  '전체 관리자가 승인된 RPC로 최적화 작업을 생성합니다.',
  'Supabase가 개인정보를 제외한 입력 스냅샷을 저장합니다.',
  '로컬 Worker 또는 Cloud Run Job이 PENDING 작업을 가져옵니다.',
  'Python OR-Tools가 최소 버스 수와 배차 품질을 순차 최적화합니다.',
  '독립 검증을 통과한 OPTIMAL 결과만 Supabase에 저장합니다.',
  '프론트가 최적 결과에서 편집 가능한 배차 초안을 생성합니다.',
] as const;

const ArchitecturePage = () => (
  <div className={styles.page}>
    <header className={styles.topbar}>
      <Link className={styles.brand} to="/" aria-label="CCC 버스 홈으로 이동">
        CCC BUS
      </Link>
      <nav className={styles.topnav} aria-label="문서 바로가기">
        <a href="#overview">개요</a>
        <a href="#frontend">프론트</a>
        <a href="#backend">백엔드</a>
        <a href="#flows">흐름</a>
      </nav>
    </header>

    <main>
      <section className={styles.hero} id="overview">
        <div className={styles.heroContent}>
          <p className={styles.kicker}>SYSTEM ARCHITECTURE</p>
          <h1>
            CCC 버스 시스템의
            <br />
            프론트엔드와 백엔드 구조
          </h1>
          <p className={styles.heroDescription}>
            React 클라이언트, Supabase 백엔드, Python 배차 최적화 Worker가
            역할별로 분리된 서버리스 중심 아키텍처입니다.
          </p>
          <div className={styles.heroActions}>
            <a className={styles.primaryAction} href="#architecture">
              구조 살펴보기
            </a>
            <Link className={styles.secondaryAction} to="/">
              서비스로 돌아가기
            </Link>
          </div>
        </div>

        <div className={styles.heroDiagram} aria-label="시스템 연결 구조">
          <div className={styles.diagramNode}>
            <span>CLIENT</span>
            <strong>React SPA</strong>
            <small>브라우저</small>
          </div>
          <span className={styles.diagramArrow} aria-hidden="true">↔</span>
          <div className={`${styles.diagramNode} ${styles.primaryNode}`}>
            <span>PLATFORM</span>
            <strong>Supabase</strong>
            <small>Auth · DB · RPC</small>
          </div>
          <span className={styles.diagramArrow} aria-hidden="true">↔</span>
          <div className={styles.diagramNode}>
            <span>COMPUTE</span>
            <strong>Python Worker</strong>
            <small>OR-Tools</small>
          </div>
        </div>
      </section>

      <section className={styles.section} id="architecture">
        <div className={styles.sectionHeading}>
          <p>01 · BIG PICTURE</p>
          <h2>세 개의 실행 영역</h2>
          <span>각 영역은 명확한 책임을 가지며 Supabase를 중심으로 연결됩니다.</span>
        </div>
        <div className={styles.layerGrid}>
          {layers.map((layer) => (
            <article className={styles.layerCard} key={layer.number}>
              <div className={styles.cardTopline}>
                <span>{layer.number}</span>
                <small>{layer.eyebrow}</small>
              </div>
              <h3>{layer.title}</h3>
              <p>{layer.description}</p>
              <ul>
                {layer.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.section} ${styles.splitSection}`} id="frontend">
        <div className={styles.sectionHeading}>
          <p>02 · FRONTEND</p>
          <h2>화면과 서비스 계층의 분리</h2>
          <span>
            페이지는 사용자 경험을 담당하고, 데이터 접근은 업무별 서비스 모듈에 위임합니다.
          </span>
        </div>
        <div className={styles.splitContent}>
          <div className={styles.codePanel}>
            <div className={styles.codeHeader}>
              <span />
              <span />
              <span />
              <strong>src/</strong>
            </div>
            <dl>
              {frontendFolders.map(([folder, purpose]) => (
                <div key={folder}>
                  <dt>{folder}</dt>
                  <dd>{purpose}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className={styles.detailStack}>
            <article>
              <span>Routing</span>
              <h3>공개 화면과 관리자 화면</h3>
              <p>
                공개 라우트와 관리자 라우트를 분리하고, 페이지 단위 지연 로딩으로 초기
                번들 크기를 줄입니다.
              </p>
            </article>
            <article>
              <span>Authorization</span>
              <h3>역할 기반 관리자 접근</h3>
              <p>
                global_admin, campus_admin, boarding_manager 역할에 따라 메뉴와 화면 접근을
                구분합니다.
              </p>
            </article>
            <article>
              <span>Service Layer</span>
              <h3>업무 단위 Supabase 호출</h3>
              <p>
                예약, 결제, 문의, 배차 서비스가 Supabase 테이블과 RPC 호출 세부사항을
                캡슐화합니다.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.darkSection}`} id="backend">
        <div className={styles.sectionHeading}>
          <p>03 · BACKEND</p>
          <h2>Supabase가 서버의 중심입니다</h2>
          <span>
            데이터와 권한 규칙을 데이터베이스 가까이에 두어 모든 클라이언트에 동일하게 적용합니다.
          </span>
        </div>
        <div className={styles.backendGrid}>
          {backendItems.map(([title, description]) => (
            <article key={title}>
              <span>{title}</span>
              <p>{description}</p>
            </article>
          ))}
        </div>
        <div className={styles.dataTable} aria-label="주요 데이터 그룹">
          {dataGroups.map(([group, tables]) => (
            <div key={group}>
              <strong>{group}</strong>
              <code>{tables}</code>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section} id="flows">
        <div className={styles.sectionHeading}>
          <p>04 · REQUEST FLOW</p>
          <h2>예약 저장 요청의 흐름</h2>
          <span>중요 변경은 브라우저의 직접 쓰기 대신 승인된 RPC를 통해 처리됩니다.</span>
        </div>
        <ol className={styles.flowList}>
          {requestSteps.map(([number, title, description]) => (
            <li key={number}>
              <span>{number}</span>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className={`${styles.section} ${styles.optimizerSection}`}>
        <div className={styles.optimizerIntro}>
          <p>05 · OPTIMIZATION</p>
          <h2>고비용 계산은 별도 Worker로</h2>
          <span>
            웹 요청을 오래 열어두지 않고 작업 상태를 Supabase에 기록하며 계산합니다.
          </span>
        </div>
        <ol className={styles.optimizerFlow}>
          {optimizationSteps.map((step, index) => (
            <li key={step}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <p>{step}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.summarySection}>
        <p>ARCHITECTURE SUMMARY</p>
        <h2>얇은 클라이언트, 강한 데이터 경계, 분리된 계산 환경</h2>
        <div>
          <span>프론트</span>
          <strong>페이지 → 서비스 → Supabase Client</strong>
          <span>백엔드</span>
          <strong>Auth + RLS + RPC + Edge Functions</strong>
          <span>최적화</span>
          <strong>Job Queue → Python Worker → 검증 결과</strong>
        </div>
      </section>
    </main>

    <footer className={styles.footer}>
      <strong>CCC BUS · Architecture Document</strong>
      <Link to="/">홈으로 돌아가기</Link>
    </footer>
  </div>
);

export default ArchitecturePage;
