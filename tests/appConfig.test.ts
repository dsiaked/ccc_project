import assert from 'node:assert/strict';
import test from 'node:test';

import { getSupabaseConfigStatus } from '../src/utils/appConfig.js';

test('accepts a complete Supabase browser configuration', () => {
  assert.deepEqual(
    getSupabaseConfigStatus({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'public-anon-key',
    }),
    {
      hasRequiredValues: true,
      missingKeys: [],
    }
  );
});

test('reports every missing Supabase environment variable', () => {
  assert.deepEqual(
    getSupabaseConfigStatus({
      VITE_SUPABASE_URL: '   ',
      VITE_SUPABASE_ANON_KEY: '',
    }),
    {
      hasRequiredValues: false,
      missingKeys: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'],
    }
  );
});
