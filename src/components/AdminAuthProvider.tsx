/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';

import {
  clearAdminRoleCache,
  getAdminRole,
  setActiveAdminRole,
  type AdminRole,
} from '../lib/adminService';
import { supabase } from '../lib/supabase';

type AdminAuthStatus = 'loading' | 'anonymous' | 'authenticated' | 'error';

interface AdminAuthContextValue {
  status: AdminAuthStatus;
  session: Session | null;
  adminRole: AdminRole | null;
  refresh: () => Promise<void>;
  switchAdminRole: (roleId: string) => Promise<AdminRole>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export const AdminAuthProvider = ({ children }: { children: ReactNode }) => {
  const requestIdRef = useRef(0);
  const [status, setStatus] = useState<AdminAuthStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);

  const loadAdminAuth = useCallback(async (nextSession?: Session | null) => {
    const requestId = (requestIdRef.current += 1);
    setStatus('loading');

    try {
      let resolvedSession = nextSession;

      if (nextSession === undefined) {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        resolvedSession = data.session;
      }

      if (requestIdRef.current !== requestId) return;

      setSession(resolvedSession ?? null);

      if (!resolvedSession) {
        setAdminRole(null);
        setStatus('anonymous');
        return;
      }

      clearAdminRoleCache(resolvedSession.user.id);
      const role = await getAdminRole(resolvedSession.user.id);

      if (requestIdRef.current !== requestId) return;

      setAdminRole(role);
      setStatus('authenticated');
    } catch (error) {
      if (requestIdRef.current !== requestId) return;

      console.error('Failed to load administrator authentication:', error);
      setAdminRole(null);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => {
      void loadAdminAuth();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'INITIAL_SESSION') return;

      void loadAdminAuth(nextSession);
    });

    return () => {
      requestIdRef.current += 1;
      subscription.unsubscribe();
    };
  }, [loadAdminAuth]);

  const value = useMemo<AdminAuthContextValue>(
    () => ({
      status,
      session,
      adminRole,
      refresh: () => loadAdminAuth(),
      switchAdminRole: async (roleId: string) => {
        if (!session) {
          throw new Error('관리자 역할을 변경하려면 다시 로그인해주세요.');
        }

        const role = await setActiveAdminRole(session.user.id, roleId);
        setAdminRole(role);
        return role;
      },
    }),
    [status, session, adminRole, loadAdminAuth]
  );

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
};

export const useAdminAuth = () => {
  const context = useContext(AdminAuthContext);

  if (!context) {
    throw new Error('useAdminAuth must be used inside AdminAuthProvider.');
  }

  return context;
};
