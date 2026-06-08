import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

interface FirebaseHeader {
  key: string;
  value: string;
}

interface FirebaseConfig {
  hosting?: {
    headers?: Array<{
      source: string;
      headers: FirebaseHeader[];
    }>;
  };
}

interface PackageLock {
  packages?: Record<string, { version?: string }>;
}

test('Firebase Hosting applies the required browser security headers', () => {
  const config = JSON.parse(readFileSync('firebase.json', 'utf8')) as FirebaseConfig;
  const globalHeaders = config.hosting?.headers?.find(
    (entry) => entry.source === '**'
  )?.headers;

  assert.ok(globalHeaders, 'Firebase Hosting must define global security headers.');

  const headers = new Map(
    globalHeaders.map(({ key, value }) => [key.toLowerCase(), value])
  );
  const csp = headers.get('content-security-policy') ?? '';

  for (const header of [
    'content-security-policy',
    'permissions-policy',
    'referrer-policy',
    'strict-transport-security',
    'x-content-type-options',
    'x-frame-options',
  ]) {
    assert.ok(headers.has(header), `Missing Firebase security header: ${header}`);
  }

  for (const directive of [
    "default-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    'https://*.supabase.co',
    'wss://*.supabase.co',
    'https://*.kakao.com',
    'https://fonts.googleapis.com',
    'https://images.unsplash.com',
  ]) {
    assert.match(csp, new RegExp(directive.replaceAll('*', '\\*')));
  }

  assert.doesNotMatch(csp, /unsafe-eval/);
});

test('Edge Functions pin Supabase JS to the package-lock version', () => {
  const packageLock = JSON.parse(
    readFileSync('package-lock.json', 'utf8')
  ) as PackageLock;
  const expectedVersion =
    packageLock.packages?.['node_modules/@supabase/supabase-js']?.version;

  assert.ok(expectedVersion, 'package-lock.json must contain Supabase JS.');

  let checkedImports = 0;

  for (const entry of readdirSync('supabase/functions', {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;

    const source = readFileSync(
      `supabase/functions/${entry.name}/index.ts`,
      'utf8'
    );
    const imports = [
      ...source.matchAll(
        /https:\/\/esm\.sh\/@supabase\/supabase-js@([^'"/?]+)/g
      ),
    ].map((match) => match[1]);

    for (const version of imports) {
      assert.equal(
        version,
        expectedVersion,
        `${entry.name} must pin Supabase JS to ${expectedVersion}.`
      );
      checkedImports += 1;
    }
  }

  assert.ok(checkedImports > 0, 'No Supabase JS Edge Function imports were found.');
});
