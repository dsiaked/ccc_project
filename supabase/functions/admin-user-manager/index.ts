import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const asText = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

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
  const authorization = request.headers.get('Authorization') ?? '';

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
    return json({ error: '서버 환경 또는 인증 정보가 없습니다.' }, 401);
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
    return json({ error: '전체 관리자만 사용자를 추가할 수 있습니다.' }, 403);
  }

  const body = await request.json().catch(() => ({}));
  if (body?.action !== 'create') {
    return json({ error: '지원하지 않는 작업입니다.' }, 400);
  }

  const email = asText(body.email).toLowerCase();
  const password = asText(body.password);
  const name = asText(body.name);
  const phone = asText(body.phone);
  const organizationMode =
    body?.organizationMode === 'external' || body?.organizationMode === 'manual'
      ? 'external'
      : 'registered';
  const districtId = asText(body.districtId);
  const teamId = asText(body.teamId);
  const campusId = asText(body.campusId);
  const district = asText(body.district);
  const campusName = asText(body.campus);
  const coordinatorName = asText(body.coordinatorName);
  const coordinatorPhone = asText(body.coordinatorPhone);

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return json({ error: '유효한 이메일을 입력해주세요.' }, 400);
  }
  if (password.length < 6) {
    return json({ error: '비밀번호는 6자 이상이어야 합니다.' }, 400);
  }
  if (!name || !/^010-\d{4}-\d{4}$/.test(phone)) {
    return json(
      { error: '이름과 010-1234-5678 형식의 연락처가 필요합니다.' },
      400,
    );
  }

  let metadata: Record<string, string | null>;

  if (organizationMode === 'external') {
    if (
      !district ||
      !campusName ||
      !coordinatorName ||
      !/^010-\d{4}-\d{4}$/.test(coordinatorPhone)
    ) {
      return json(
        { error: '서울 외 지구의 지구명, 캠퍼스명, 담당 간사 정보가 필요합니다.' },
        400,
      );
    }

    metadata = {
      name,
      phone,
      account_source: 'admin_created',
      district_id: null,
      district,
      team_id: null,
      team: '',
      campus_id: null,
      campus: campusName,
      affiliation_type: 'external',
      coordinator_name: coordinatorName,
      coordinator_phone: coordinatorPhone,
    };
  } else {
    if (!districtId || !teamId || !campusId) {
      return json({ error: '지구, 팀, 캠퍼스를 모두 선택해주세요.' }, 400);
    }

    const { data: campus, error: campusError } = await serviceClient
      .from('campus_options')
      .select('district_id, district, team_id, team, campus_id, campus')
      .eq('district_id', districtId)
      .eq('team_id', teamId)
      .eq('campus_id', campusId)
      .maybeSingle();

    if (campusError || !campus) {
      return json({ error: '선택한 소속 정보를 확인할 수 없습니다.' }, 400);
    }

    metadata = {
      name,
      phone,
      account_source: 'admin_created',
      district_id: campus.district_id,
      district: campus.district,
      team_id: campus.team_id,
      team: campus.team,
      campus_id: campus.campus_id,
      campus: campus.campus,
      affiliation_type: 'seoul',
      coordinator_name: null,
      coordinator_phone: null,
    };
  }

  const { data: created, error: createError } =
    await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });

  if (createError || !created.user) {
    if (createError && !createError.message.includes('already')) {
      console.error('Failed to create an administered user:', createError);
    }
    return json(
      {
        error:
          createError?.message.includes('already')
            ? '이미 사용 중인 이메일입니다.'
            : '사용자 계정을 생성하지 못했습니다.',
      },
      400,
    );
  }

  const { error: profileError } = await serviceClient.from('profiles').upsert({
    id: created.user.id,
    email,
    ...metadata,
    account_source: 'admin_created',
    updated_at: new Date().toISOString(),
  });

  if (profileError) {
    const { error: rollbackError } = await serviceClient.auth.admin.deleteUser(
      created.user.id,
    );
    console.error('Failed to persist an administered user profile:', profileError);
    if (rollbackError) {
      console.error('Failed to roll back an administered user:', rollbackError);
    }
    return json({ error: '프로필 저장에 실패했습니다.' }, 500);
  }

  return json({ userId: created.user.id, email });
});
