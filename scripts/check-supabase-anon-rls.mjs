const supabaseUrl = process.env.VITE_SUPABASE_URL?.replace(/\/+$/, '');
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required for the anon RLS check.'
  );
}

const headers = {
  apikey: anonKey,
  Authorization: `Bearer ${anonKey}`,
  Accept: 'application/json',
};

const serviceOnlyTables = [
  'admin_roles',
  'ccc_summer_user_links',
  'ccc_summer_campus_mappings',
  'ai_report_log_settings',
  'ai_operations_reports',
  'activity_event_logs',
  'allocation_optimization_jobs',
  'boarding_check_in_codes',
];

for (const table of serviceOnlyTables) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/${table}?select=*&limit=1`,
    { headers, signal: AbortSignal.timeout(15_000) }
  );

  if ([401, 403, 404].includes(response.status)) {
    console.log(`${table}: protected (${response.status})`);
    continue;
  }
  if (!response.ok) {
    throw new Error(`${table}: unexpected response ${response.status}`);
  }

  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length !== 0) {
    throw new Error(`${table}: anonymous request exposed protected rows`);
  }
  console.log(`${table}: protected by RLS (empty result)`);
}

console.log('Supabase anonymous RLS read check passed.');
