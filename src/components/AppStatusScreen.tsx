import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';

import styles from './AppStatusScreen.module.css';

export const AppLoadingScreen = () => (
  <main className={styles.screen} role="status" aria-busy="true">
    <div className={styles.spinner} aria-hidden="true" />
    <p>화면을 불러오고 있습니다.</p>
  </main>
);

interface AppSetupScreenProps {
  missingKeys: string[];
}

export const AppSetupScreen = ({ missingKeys }: AppSetupScreenProps) => (
  <main className={styles.screen}>
    <h1 role="alert">Supabase environment variables are missing.</h1>
    <p>
      Copy <code>.env.example</code> to <code>.env.local</code> and fill in the
      missing values before starting the app again.
    </p>
    <div className={styles.setupCard}>
      <p className={styles.setupLabel}>Missing keys</p>
      <ul className={styles.setupList}>
        {missingKeys.map((key) => (
          <li key={key}>
            <code>{key}</code>
          </li>
        ))}
      </ul>
      <p className={styles.setupLabel}>Expected file</p>
      <pre className={styles.codeBlock}>
        <code>{`VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key`}</code>
      </pre>
    </div>
    <button type="button" onClick={() => window.location.reload()}>
      Reload after setup
    </button>
  </main>
);

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unexpected application error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className={styles.screen}>
          <h1 role="alert">화면을 불러오지 못했습니다.</h1>
          <p>
            일시적인 오류이거나 새 버전이 배포되었을 수 있습니다. 페이지를
            새로고침해주세요.
          </p>
          <button type="button" onClick={() => window.location.reload()}>
            새로고침
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}
