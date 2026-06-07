import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import {
  AppErrorBoundary,
  AppLoadingScreen,
} from './components/AppStatusScreen';
import { publicRoutes } from './routes/publicRoutes';

const AdminRoutes = lazy(() => import('./routes/adminRoutes'));

const App = () => {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
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
