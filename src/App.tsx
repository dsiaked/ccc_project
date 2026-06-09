import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import {
  AppErrorBoundary,
  AppLoadingScreen,
  AppSetupScreen,
} from './components/AppStatusScreen';
import ActivityTracker from './components/ActivityTracker';
import { publicRoutes } from './routes/publicRoutes';
import { getSupabaseConfigStatus } from './utils/appConfig';

const AdminRoutes = lazy(() => import('./routes/adminRoutes'));

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
        <ActivityTracker />
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
