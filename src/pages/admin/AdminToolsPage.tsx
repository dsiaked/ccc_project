import type { ComponentType } from 'react';
import {
  AlertTriangle,
  Bot,
  Building2,
  ClipboardCheck,
  FlaskConical,
  History,
  ListTree,
  KeyRound,
  Settings,
  ShieldCheck,
  Timer,
  UserCog,
  Users,
  Wrench,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import AdminHeader from './AdminHeader';
import styles from './AdminToolsPage.module.css';

interface ToolAction {
  title: string;
  path: string;
  icon: ComponentType<{ size?: number }>;
  danger?: boolean;
}

interface ToolGroup {
  title: string;
  actions: ToolAction[];
}

const toolGroups: ToolGroup[] = [
  {
    title: '권한 및 계정',
    actions: [
      {
        title: '권한 등록 코드',
        path: '/admin/system/invitation-codes',
        icon: KeyRound,
      },
      {
        title: '캠퍼스 관리자',
        path: '/admin/access/campus-admins',
        icon: ShieldCheck,
      },
      {
        title: '탑승 관리 간사님',
        path: '/admin/access/boarding-managers',
        icon: UserCog,
      },
      {
        title: '사용자 계정',
        path: '/admin/users',
        icon: Users,
      },
    ],
  },
  {
    title: '운영 도구',
    actions: [
      {
        title: '운영 마감',
        path: '/admin/system/closeout',
        icon: ShieldCheck,
      },
      {
        title: '시뮬레이션',
        path: '/admin/system/simulation',
        icon: FlaskConical,
      },
      {
        title: '운영 종료 점검',
        path: '/admin/system/closeout',
        icon: ClipboardCheck,
      },
      {
        title: '관리자 작업 기록',
        path: '/admin/system/audit-logs',
        icon: History,
      },
      {
        title: 'AI 운영 최종보고서',
        path: '/admin/system/ai-reports',
        icon: Bot,
      },
      {
        title: 'AI 수집 로그',
        path: '/admin/system/ai-reports/logs',
        icon: ListTree,
      },
    ],
  },
  {
    title: '기본 설정',
    actions: [
      {
        title: '운영 설정',
        path: '/admin/settings',
        icon: Settings,
      },
      {
        title: '예상 참여 인원',
        path: '/admin/settings/participation-targets',
        icon: Building2,
      },
      {
        title: '신청 마감 일시',
        path: '/admin/settings/reservation-deadline',
        icon: Timer,
      },
      {
        title: '데이터 초기화',
        path: '/admin/settings#data-reset',
        icon: AlertTriangle,
        danger: true,
      },
    ],
  },
];

const AdminToolsPage = () => {
  const navigate = useNavigate();

  return (
    <div className={styles.pageContainer}>
      <AdminHeader />

      <main className={styles.main}>
        <header className={styles.pageHeader}>
          <span className={styles.headerIcon}>
            <Wrench size={22} />
          </span>
          <div>
            <h1>관리자 도구</h1>
            <p>필요한 메뉴를 선택하세요.</p>
          </div>
        </header>

        <div className={styles.groups}>
          {toolGroups.map((group) => (
            <section className={styles.group} key={group.title}>
              <h2>{group.title}</h2>
              <div className={styles.buttonGrid}>
                {group.actions.map((action) => {
                  const Icon = action.icon;

                  return (
                    <button
                      key={action.path}
                      type="button"
                      className={`${styles.toolButton} ${
                        action.danger ? styles.dangerButton : ''
                      }`}
                      onClick={() => navigate(action.path)}
                    >
                      <Icon size={22} />
                      <span>{action.title}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
};

export default AdminToolsPage;
