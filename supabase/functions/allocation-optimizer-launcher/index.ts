import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_REQUEST_TIMEOUT_MS = 15_000;
const LAUNCHER_CLAIM_TIMEOUT_MS = 5 * 60_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const base64Url = (value: Uint8Array | string) => {
  const bytes =
    typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
};

const importPrivateKey = async (pem: string) => {
  const encoded = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replaceAll(/\s/g, '');
  const binary = Uint8Array.from(atob(encoded), (character) =>
    character.charCodeAt(0)
  );
  return crypto.subtle.importKey(
    'pkcs8',
    binary,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
};

const getGoogleAccessToken = async (serviceAccountJson: string) => {
  let serviceAccount: {
    client_email?: string;
    private_key?: string;
  };
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch {
    throw new Error(
      'GCP_SERVICE_ACCOUNT_JSON must be valid service-account JSON.',
    );
  }
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error(
      'GCP_SERVICE_ACCOUNT_JSON is missing client_email or private_key.',
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claims}`;
  const key = await importPrivateKey(serviceAccount.private_key);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  );
  const assertion = `${unsigned}.${base64Url(new Uint8Array(signature))}`;
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const tokenBody = await tokenResponse.json() as {
    access_token?: string;
    error_description?: string;
  };
  if (!tokenResponse.ok || !tokenBody.access_token) {
    throw new Error(
      tokenBody.error_description || 'Google Cloud access token request failed.',
    );
  }
  return tokenBody.access_token;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return json({ error: 'POST 요청만 지원합니다.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const projectId = Deno.env.get('GCP_PROJECT_ID') ?? '';
  const region = Deno.env.get('GCP_REGION') ?? '';
  const cloudRunJobName = Deno.env.get('GCP_RUN_JOB_NAME') ?? '';
  const serviceAccountJson = Deno.env.get('GCP_SERVICE_ACCOUNT_JSON') ?? '';
  const authorization = request.headers.get('Authorization') ?? '';

  if (
    !supabaseUrl ||
    !anonKey ||
    !serviceRoleKey ||
    !projectId ||
    !region ||
    !cloudRunJobName ||
    !serviceAccountJson ||
    !authorization
  ) {
    return json({ error: '최적화 런처 환경 또는 인증 정보가 없습니다.' }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const {
    data: { user: actor },
    error: actorError,
  } = await userClient.auth.getUser();
  if (actorError || !actor) {
    return json({ error: '로그인이 필요합니다.' }, 401);
  }

  const { count: globalAdminCount, error: roleError } = await serviceClient
    .from('admin_roles')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', actor.id)
    .eq('role', 'global_admin');
  if (roleError || !globalAdminCount) {
    return json({ error: '전체 관리자만 최적화 작업을 실행할 수 있습니다.' }, 403);
  }

  const body = await request.json().catch(() => ({}));
  const jobId = typeof body?.jobId === 'string' ? body.jobId.trim() : '';
  if (!jobId) {
    return json({ error: '최적화 작업 ID가 필요합니다.' }, 400);
  }

  const { data: job, error: jobError } = await serviceClient
    .from('allocation_optimization_jobs')
    .select('id, status, execution_mode')
    .eq('id', jobId)
    .maybeSingle();
  if (jobError || !job) {
    return json({ error: '최적화 작업을 찾을 수 없습니다.' }, 404);
  }
  if (job.status !== 'PENDING') {
    return json({ error: `대기 중인 작업만 실행할 수 있습니다: ${job.status}` }, 409);
  }
  if (job.execution_mode !== 'cloud') {
    return json({ error: 'Cloud Run 실행 대상으로 생성된 작업이 아닙니다.' }, 409);
  }

  const staleClaimBefore = new Date(
    Date.now() - LAUNCHER_CLAIM_TIMEOUT_MS,
  ).toISOString();
  const { error: staleClaimError } = await serviceClient
    .from('allocation_optimization_jobs')
    .update({
      worker_id: null,
      current_phase: null,
    })
    .eq('id', jobId)
    .eq('status', 'PENDING')
    .eq('execution_mode', 'cloud')
    .eq('current_phase', 'launcher_claimed')
    .lt('updated_at', staleClaimBefore);
  if (staleClaimError) {
    return json({ error: 'Cloud Run launcher claim recovery failed.' }, 500);
  }

  const workerId = `cloud-run-${crypto.randomUUID()}`;
  const { data: claimedJob, error: claimError } = await serviceClient
    .from('allocation_optimization_jobs')
    .update({
      worker_id: workerId,
      current_phase: 'launcher_claimed',
    })
    .eq('id', jobId)
    .eq('status', 'PENDING')
    .eq('execution_mode', 'cloud')
    .is('worker_id', null)
    .select('id')
    .maybeSingle();
  if (claimError) {
    return json({ error: 'Cloud Run launcher claim failed.' }, 500);
  }
  if (!claimedJob) {
    return json({ error: 'This optimization job is already being launched.' }, 409);
  }

  let launchRequestStarted = false;
  try {
    const accessToken = await getGoogleAccessToken(serviceAccountJson);
    launchRequestStarted = true;
    const runResponse = await fetch(
      `https://run.googleapis.com/v2/projects/${projectId}/locations/${region}/jobs/${cloudRunJobName}:run`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          overrides: {
            containerOverrides: [
              {
                env: [
                  {
                    name: 'ALLOCATION_OPTIMIZATION_JOB_ID',
                    value: jobId,
                  },
                  {
                    name: 'WORKER_ID',
                    value: workerId,
                  },
                  {
                    name: 'SUPABASE_URL',
                    value: supabaseUrl,
                  },
                ],
              },
            ],
          },
        }),
      },
    );
    launchRequestStarted = false;
    const runBody = await runResponse.json().catch(() => ({}));
    if (!runResponse.ok) {
      throw new Error(
        typeof runBody?.error?.message === 'string'
          ? runBody.error.message
          : 'Cloud Run Job 실행 요청에 실패했습니다.',
      );
    }

    await serviceClient.from('allocation_optimization_events').insert({
      job_id: jobId,
      event_type: 'CLOUD_RUN_EXECUTION_REQUESTED',
      detail: {
        requested_by: actor.id,
        worker_id: workerId,
        operation_name: runBody?.name ?? null,
      },
    });

    return json({
      jobId,
      workerId,
      operationName: runBody?.name ?? null,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Cloud Run Job 실행 요청에 실패했습니다.';

    await serviceClient
      .from('allocation_optimization_jobs')
      .update(
        launchRequestStarted
          ? {
              status: 'FAILED',
              completed_at: new Date().toISOString(),
              current_phase: 'launcher_status_unknown',
              error_message:
                'Cloud Run 실행 요청의 수락 여부를 확인할 수 없어 작업을 종료했습니다. 중복 실행을 막기 위해 자동 재시도를 중단했습니다.',
            }
          : {
              status: 'FAILED',
              completed_at: new Date().toISOString(),
              current_phase: 'launcher_failed',
              error_message: errorMessage,
            },
      )
      .eq('id', jobId)
      .eq('status', 'PENDING')
      .eq('worker_id', workerId);

    await serviceClient.from('allocation_optimization_events').insert({
      job_id: jobId,
      event_type: 'CLOUD_RUN_EXECUTION_REQUEST_FAILED',
      detail: {
        requested_by: actor.id,
        message: errorMessage,
      },
    });

    return json({ error: errorMessage }, 502);
  }
});
