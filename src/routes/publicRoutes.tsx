/* eslint-disable react-refresh/only-export-components */
import { lazy } from 'react';
import { Navigate } from 'react-router-dom';

const HomePage = lazy(() => import('../pages/HomePage'));
const LoginPage = lazy(() => import('../pages/LoginPage'));
const SignupPage = lazy(() => import('../pages/SignupPage'));
const ReservationPage = lazy(() => import('../pages/ReservationPage'));
const TicketPage = lazy(() => import('../pages/TicketPage'));
const ConfirmedTicketPage = lazy(() => import('../pages/ConfirmedTicketPage'));
const AuthCallbackPage = lazy(() => import('../pages/AuthCallbackPage'));

export const publicRoutes = [
  { path: '/', element: <HomePage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },
  { path: '/auth/callback', element: <AuthCallbackPage /> },
  { path: '/reservation', element: <ReservationPage /> },
  { path: '/ticket', element: <TicketPage /> },
  { path: '/confirmed-ticket', element: <ConfirmedTicketPage /> },
  { path: '*', element: <Navigate to="/" replace /> },
];
