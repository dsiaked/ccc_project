import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

import { recordActivityEvent } from '../lib/activityLogService';
import { supabase } from '../lib/supabase';

const ActivityTracker = () => {
  const location = useLocation();
  const lastRouteRef = useRef('');

  useEffect(() => {
    const route = location.pathname;
    if (route === lastRouteRef.current) return;
    lastRouteRef.current = route;

    void supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return;

      void recordActivityEvent('page_view', 'navigation', route, {
        source: 'web',
        page_title: document.title,
      }).catch((error) => {
        console.warn('Failed to record page view:', error);
      });
    });
  }, [location.pathname]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session || event === 'INITIAL_SESSION') return;

      void recordActivityEvent(`auth.${event.toLowerCase()}`, 'authentication', undefined, {
        source: 'web',
        outcome: 'success',
      }).catch((error) => {
        console.warn('Failed to record authentication event:', error);
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
};

export default ActivityTracker;
