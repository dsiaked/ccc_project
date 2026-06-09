import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';

import { getSupabaseClientConfig } from '../src/lib/supabaseConfig.js';

test('preserves a complete Supabase browser configuration', () => {
  assert.deepEqual(
    getSupabaseClientConfig({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'public-anon-key',
    }),
    {
      url: 'https://example.supabase.co',
      anonKey: 'public-anon-key',
    }
  );
});

test('uses an inert client configuration when Supabase settings are missing', () => {
  const missingBoth = getSupabaseClientConfig({});
  const missingKey = getSupabaseClientConfig({
    VITE_SUPABASE_URL: 'https://real-project.supabase.co',
  });

  assert.deepEqual(missingBoth, {
    url: 'https://missing-supabase-config.invalid',
    anonKey: 'missing-supabase-anon-key',
  });
  assert.deepEqual(missingKey, missingBoth);
  assert.doesNotThrow(() => createClient(missingBoth.url, missingBoth.anonKey));
});
