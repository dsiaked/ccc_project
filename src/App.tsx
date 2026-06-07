import { Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import { adminRoutes } from './routes/adminRoutes';
import { publicRoutes } from './routes/publicRoutes';

const App = () => {
  return (
    <BrowserRouter>
      <Suspense fallback={<div />}>
        <Routes>
          {[...publicRoutes, ...adminRoutes].map((route) => (
            <Route
              key={route.path}
              path={route.path}
              element={route.element}
            />
          ))}
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};

export default App;
