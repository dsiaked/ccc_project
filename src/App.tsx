import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import {
  AppErrorBoundary,
  AppLoadingScreen,
  AppSetupScreen,
} from './components/AppStatusScreen';
import { publicRoutes } from './routes/publicRoutes';
import { getSupabaseConfigStatus } from './utils/appConfig';

const AdminRoutes = lazy(() => import('./routes/adminRoutes'));
const ActivityTracker = lazy(() => import('./components/ActivityTracker'));

const DeferredActivityTracker = () => {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const enable = () => setEnabled(true);

    if (typeof window.requestIdleCallback === 'function') {
      const idleCallbackId = window.requestIdleCallback(enable, {
        timeout: 2000,
      });
      return () => window.cancelIdleCallback(idleCallbackId);
    }

    const timeoutId = globalThis.setTimeout(enable, 1000);
    return () => globalThis.clearTimeout(timeoutId);
  }, []);

  if (!enabled) return null;

  return (
    <Suspense fallback={null}>
      <ActivityTracker />
    </Suspense>
  );
};

const App = () => {
  const supabaseConfigStatus = getSupabaseConfigStatus(
    import.meta.env as Record<string, string | undefined>
  );

  if (!supabaseConfigStatus.hasRequiredValues) {
    return <AppSetupScreen missingKeys={supabaseConfigStatus.missingKeys} />;
  }

  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <DeferredActivityTracker />
        <Suspense fallback={<AppLoadingScreen />}>
          <Routes>
            {publicRoutes.map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={route.element}
              />
            ))}
            <Route path="/admin/*" element={<AdminRoutes />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AppErrorBoundary>
  );
};

export default App;
