import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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

    const indexPath = `supabase/functions/${entry.name}/index.ts`;
    if (!existsSync(indexPath)) continue;

    const source = readFileSync(indexPath, 'utf8');
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

test('allocation optimizer launcher validates and documents its service-account secret', () => {
  const source = readFileSync(
    'supabase/functions/allocation-optimizer-launcher/index.ts',
    'utf8'
  );
  const readme = readFileSync(
    'supabase/functions/allocation-optimizer-launcher/README.md',
    'utf8'
  );

  assert.match(
    source,
    /GCP_SERVICE_ACCOUNT_JSON must be valid service-account JSON/
  );
  assert.match(readme, /supabase secrets set --env-file/);
  assert.match(readme, /roles\/run\.jobsExecutorWithOverrides/);
});

test('live deployment separates the production and simulation Supabase projects', () => {
  const workflow = readFileSync(
    '.github/workflows/firebase-hosting-merge.yml',
    'utf8'
  );

  assert.match(workflow, /VITE_SIMULATION_PROJECT_ID: pjbvxoesgwhbxfsfjliw/);
  assert.equal(
    [
      ...workflow.matchAll(
        /supabase functions deploy [^\r\n]+ --project-ref qdpfccuqeumguhishifu/g
      ),
    ].length,
    3
  );
  assert.doesNotMatch(
    workflow,
    /supabase functions deploy [^\r\n]+ --project-ref pjbvxoesgwhbxfsfjliw/
  );
  assert.match(
    workflow,
    /name: Deploy changed Edge Functions[\s\S]*if: \$\{\{ env\.SUPABASE_ACCESS_TOKEN != '' \}\}/
  );
});
