import { readFileSync } from 'node:fs';

const supabaseUrl = process.env.VITE_SUPABASE_URL?.replace(/\/+$/, '');
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const { requiredDatabaseVersion } = JSON.parse(
  readFileSync('deployment-compatibility.json', 'utf8')
);

if (!supabaseUrl || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required for the deployment compatibility check.'
  );
}

if (!Number.isSafeInteger(requiredDatabaseVersion) || requiredDatabaseVersion < 1) {
  throw new Error('deployment-compatibility.json must contain a positive integer requiredDatabaseVersion.');
}

const response = await fetch(
  `${supabaseUrl}/rest/v1/rpc/assert_deployment_compatibility`,
  {
    method: 'POST',
    signal: AbortSignal.timeout(15_000),
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_required_version: requiredDatabaseVersion }),
  }
);

if (!response.ok) {
  const details = await response.text();
  throw new Error(
    `Supabase deployment compatibility check failed (${response.status}). ` +
      `Apply the required database migrations before deploying the frontend. ${details}`
  );
}

const deployedDatabaseVersion = await response.json();
if (!Number.isSafeInteger(deployedDatabaseVersion)) {
  throw new Error('Supabase returned an invalid deployment compatibility version.');
}

console.log(
  `Supabase deployment compatibility check passed: database ${deployedDatabaseVersion}, ` +
    `required ${requiredDatabaseVersion}.`
);
