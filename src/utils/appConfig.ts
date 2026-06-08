const requiredSupabaseKeys = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
] as const;

export interface SupabaseConfigStatus {
  hasRequiredValues: boolean;
  missingKeys: string[];
}

export const getSupabaseConfigStatus = (
  env: Record<string, string | undefined>
): SupabaseConfigStatus => {
  const missingKeys = requiredSupabaseKeys.filter((key) => {
    const value = env[key];
    return typeof value !== 'string' || value.trim().length === 0;
  });

  return {
    hasRequiredValues: missingKeys.length === 0,
    missingKeys: [...missingKeys],
  };
};
