import { supabase } from './supabase';

export interface ActivityEventMetadata {
  source?: string;
  outcome?: string;
  duration_ms?: number;
  resource_type?: string;
  resource_id?: string;
  error_code?: string;
  page_title?: string;
}

export const recordActivityEvent = async (
  eventName: string,
  category: string,
  route?: string,
  metadata: ActivityEventMetadata = {}
) => {
  const { error } = await supabase.rpc('record_activity_event', {
    p_event_name: eventName,
    p_category: category,
    p_route: route ?? null,
    p_metadata: metadata,
  });

  if (error && error.code !== 'PGRST202' && error.code !== '42883') {
    throw error;
  }
};
