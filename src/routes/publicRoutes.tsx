import { lazy, type ComponentType } from 'react';
import { Navigate } from 'react-router-dom';

type PageModule = { default: ComponentType };
type PageLoader = () => Promise<PageModule>;

const pageLoaders: Record<string, PageLoader> = {
  '/': () => import('../pages/HomePage'),
  '/login': () => import('../pages/AuthEntryPage'),
  '/signup': () => import('../pages/AuthEntryPage'),
  '/local-login': () => import('../pages/LoginPage'),
  '/local-signup': () => import('../pages/SignupPage'),
  '/auth/callback': () => import('../pages/AuthCallbackPage'),
  '/handoff/callback': () => import('../pages/CccSummerHandoffPage'),
  '/forgot-password': () => import('../pages/ForgotPasswordPage'),
  '/reset-password': () => import('../pages/ResetPasswordPage'),
  '/reservation': () => import('../pages/ReservationPage'),
  '/ticket': () => import('../pages/TicketPage'),
  '/remaining-seats': () => import('../pages/RemainingSeatPage'),
  '/invitation-codes': () => import('../pages/InvitationCodePage'),
  '/profile': () => import('../pages/ProfilePage'),
  '/inquiries': () => import('../pages/PersonalInquiryPage'),
  '/architecture': () => import('../pages/ArchitecturePage'),
};

const lazyPage = (path: string) => lazy(pageLoaders[path]);

export const preloadPublicRoute = (path: string) => {
  void pageLoaders[path]?.();
};

const HomePage = lazyPage('/');
const LoginPage = lazyPage('/local-login');
const SignupPage = lazyPage('/local-signup');
const AuthEntryPage = lazyPage('/login');
const ReservationPage = lazyPage('/reservation');
const TicketPage = lazyPage('/ticket');
const RemainingSeatPage = lazyPage('/remaining-seats');
const AuthCallbackPage = lazyPage('/auth/callback');
const CccSummerHandoffPage = lazyPage('/handoff/callback');
const ForgotPasswordPage = lazyPage('/forgot-password');
const ResetPasswordPage = lazyPage('/reset-password');
const InvitationCodePage = lazyPage('/invitation-codes');
const ProfilePage = lazyPage('/profile');
const PersonalInquiryPage = lazyPage('/inquiries');
const ArchitecturePage = lazyPage('/architecture');

export const publicRoutes = [
  { path: '/', element: <HomePage /> },
  { path: '/login', element: <AuthEntryPage /> },
  { path: '/signup', element: <AuthEntryPage /> },
  { path: '/local-login', element: <LoginPage /> },
  { path: '/local-signup', element: <SignupPage /> },
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
  { path: '/inquiries', element: <PersonalInquiryPage /> },
  { path: '/architecture', element: <ArchitecturePage /> },
  { path: '*', element: <Navigate to="/" replace /> },
];
