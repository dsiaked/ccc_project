import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';

import styles from './AppStatusScreen.module.css';

export const AppLoadingScreen = () => (
  <main className={styles.screen} aria-busy="true" aria-live="polite">
    <div className={styles.spinner} aria-hidden="true" />
    <p>화면을 불러오고 있습니다.</p>
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
        <main className={styles.screen} role="alert">
          <h1>화면을 불러오지 못했습니다.</h1>
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
