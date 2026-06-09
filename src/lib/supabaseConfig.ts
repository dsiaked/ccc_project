const missingConfigUrl = 'https://missing-supabase-config.invalid';
const missingConfigAnonKey = 'missing-supabase-anon-key';

export interface SupabaseClientConfig {
  url: string;
  anonKey: string;
}

export const getSupabaseClientConfig = (
  env: Record<string, string | undefined>
): SupabaseClientConfig => {
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;

  if (!url?.trim() || !anonKey?.trim()) {
    return {
      url: missingConfigUrl,
      anonKey: missingConfigAnonKey,
    };
  }

  return { url, anonKey };
};
