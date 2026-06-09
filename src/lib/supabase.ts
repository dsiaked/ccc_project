import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.types';
import { getSupabaseClientConfig } from './supabaseConfig';

const supabaseConfig = getSupabaseClientConfig(
  import.meta.env as Record<string, string | undefined>
);

export const supabase = createClient<Database>(
  supabaseConfig.url,
  supabaseConfig.anonKey
);
