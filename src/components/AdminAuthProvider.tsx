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
  getAdminRoles,
  setActiveAdminRole,
  type AdminRole,
} from '../lib/adminService';
import { supabase } from '../lib/supabase';

type AdminAuthStatus = 'loading' | 'anonymous' | 'authenticated' | 'error';

interface AdminAuthContextValue {
  status: AdminAuthStatus;
  session: Session | null;
  adminRole: AdminRole | null;
  adminRoles: AdminRole[];
  refresh: () => Promise<void>;
  refreshRoles: () => Promise<void>;
  switchAdminRole: (roleId: string) => Promise<AdminRole>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export const AdminAuthProvider = ({ children }: { children: ReactNode }) => {
  const requestIdRef = useRef(0);
  const [status, setStatus] = useState<AdminAuthStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [adminRoles, setAdminRoles] = useState<AdminRole[]>([]);

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
        setAdminRoles([]);
        setStatus('anonymous');
        return;
      }

      clearAdminRoleCache(resolvedSession.user.id);
      const [roles, role] = await Promise.all([
        getAdminRoles(resolvedSession.user.id),
        getAdminRole(resolvedSession.user.id),
      ]);

      if (requestIdRef.current !== requestId) return;

      setAdminRoles(roles);
      setAdminRole(role);
      setStatus('authenticated');
    } catch (error) {
      if (requestIdRef.current !== requestId) return;

      console.error('Failed to load administrator authentication:', error);
      setAdminRole(null);
      setAdminRoles([]);
      setStatus('error');
    }
  }, []);

  const refreshRoles = useCallback(async () => {
    const requestId = (requestIdRef.current += 1);

    if (!session) {
      setAdminRole(null);
      setAdminRoles([]);
      return;
    }

    clearAdminRoleCache(session.user.id);
    const [roles, role] = await Promise.all([
      getAdminRoles(session.user.id),
      getAdminRole(session.user.id),
    ]);

    if (requestIdRef.current !== requestId) return;

    setAdminRoles(roles);
    setAdminRole(role);
  }, [session]);

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
      adminRoles,
      refresh: () => loadAdminAuth(),
      refreshRoles,
      switchAdminRole: async (roleId: string) => {
        if (!session) {
          throw new Error('관리자 역할을 변경하려면 다시 로그인해주세요.');
        }

        const role = await setActiveAdminRole(session.user.id, roleId);
        setAdminRole(role);
        return role;
      },
    }),
    [status, session, adminRole, adminRoles, loadAdminAuth, refreshRoles]
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
