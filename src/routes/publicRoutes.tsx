/* eslint-disable react-refresh/only-export-components */
import { lazy } from 'react';
import { Navigate } from 'react-router-dom';

const HomePage = lazy(() => import('../pages/HomePage'));
const LoginPage = lazy(() => import('../pages/LoginPage'));
const ReservationPage = lazy(() => import('../pages/ReservationPage'));
const TicketPage = lazy(() => import('../pages/TicketPage'));
const RemainingSeatPage = lazy(() => import('../pages/RemainingSeatPage'));
const AuthCallbackPage = lazy(() => import('../pages/AuthCallbackPage'));
const CccSummerHandoffPage = lazy(() => import('../pages/CccSummerHandoffPage'));
const ForgotPasswordPage = lazy(() => import('../pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('../pages/ResetPasswordPage'));
const InvitationCodePage = lazy(() => import('../pages/InvitationCodePage'));
const ProfilePage = lazy(() => import('../pages/ProfilePage'));

export const publicRoutes = [
  { path: '/', element: <HomePage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <LoginPage /> },
  { path: '/auth/callback', element: <AuthCallbackPage /> },
  { path: '/handoff/callback', element: <CccSummerHandoffPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/reservation', element: <ReservationPage /> },
  { path: '/ticket', element: <TicketPage /> },
  { path: '/confirmed-ticket', element: <Navigate to="/ticket" replace /> },
  { path: '/remaining-seats', element: <RemainingSeatPage /> },
  { path: '/invitation-codes', element: <InvitationCodePage /> },
  { path: '/profile', element: <ProfilePage /> },
  { path: '*', element: <Navigate to="/" replace /> },
];
