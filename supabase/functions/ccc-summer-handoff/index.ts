import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const CCC_SUMMER_REQUEST_TIMEOUT_MS = 15_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const asText = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const asInteger = (value: unknown) => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(number) ? number : null;
};

const commaSeparatedValues = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const normalizePhone = (value: unknown) => {
  const digits = asText(value).replace(/\D/g, '').slice(0, 11);
  if (digits.length !== 11) return '';
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
};

const randomPassword = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}Aa1!`;
};

const internalEmail = async (subjectId: string) => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(subjectId),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  return `ccc-summer-${hash.slice(0, 48)}@sso.invalid`;
};

const findRecoverableAuthUser = async (
  serviceClient: ReturnType<typeof createClient>,
  email: string,
  subjectId: string,
) => {
  const normalizedEmail = email.toLowerCase();
  const perPage = 1000;

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await serviceClient.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) return { userId: '', error };

    const match = data.users.find((candidate) => {
      const metadata = candidate.user_metadata ?? {};
      return (
        candidate.email?.toLowerCase() === normalizedEmail &&
        metadata.account_source === 'ccc_summer' &&
        (!metadata.ccc_summer_subject_id ||
          metadata.ccc_summer_subject_id === subjectId)
      );
    });
    if (match) return { userId: match.id, error: null };
    if (data.users.length < perPage) break;
  }

  return { userId: '', error: null };
};

type CampusScope = {
  district_id: string;
  district: string;
  team_id: string;
  team: string;
  campus_id: string;
  campus: string;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const cccSummerBases = commaSeparatedValues(
    Deno.env.get('CCC_SUMMER_BASE_URLS') ??
      Deno.env.get('CCC_SUMMER_BASE_URL') ??
      '',
  );
  const clientId = Deno.env.get('CCC_SUMMER_CLIENT_ID') ?? '';
  const redirectUris = commaSeparatedValues(
    Deno.env.get('CCC_SUMMER_REDIRECT_URIS') ??
      Deno.env.get('CCC_SUMMER_REDIRECT_URI') ??
      '',
  );

  if (
    !supabaseUrl ||
    !anonKey ||
    !serviceRoleKey ||
    cccSummerBases.length === 0 ||
    !clientId ||
    redirectUris.length === 0
  ) {
    return json({ error: 'server_configuration_missing' }, 500);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const body = await request.json().catch(() => ({}));
  const action = asText(body?.action) || 'exchange';

  if (action === 'profile') {
    const authorization = request.headers.get('Authorization') ?? '';
    if (!authorization) {
      return json({ error: 'authentication_required' }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return json({ error: 'authentication_required' }, 401);
    }

    const { data: link, error: linkError } = await serviceClient
      .from('ccc_summer_user_links')
      .select(
        'subject_id, is_staff, univ_no, univ_name, branch_no, branch_name',
      )
      .eq('user_id', user.id)
      .maybeSingle();
    if (linkError) {
      return json({ error: 'ccc_summer_profile_lookup_failed' }, 500);
    }
    if (!link) {
      return json({ error: 'ccc_summer_link_not_found' }, 404);
    }

    return json({
      profile: {
        subjectId: link.subject_id,
        isStaff: link.is_staff,
        univNo: link.univ_no,
        univName: link.univ_name,
        branchNo: link.branch_no,
        branchName: link.branch_name,
      },
    });
  }

  if (action === 'select-campus') {
    const authorization = request.headers.get('Authorization') ?? '';
    const campusId = asText(body?.campusId);
    if (!authorization || !campusId) {
      return json({ error: 'missing_params' }, 400);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return json({ error: 'authentication_required' }, 401);
    }

    const [{ data: link, error: linkError }, { data: campus, error: campusError }] =
      await Promise.all([
        serviceClient
          .from('ccc_summer_user_links')
          .select('univ_no, univ_name')
          .eq('user_id', user.id)
          .maybeSingle(),
        serviceClient
          .from('campus_options')
          .select('district_id, district, team_id, team, campus_id, campus')
          .eq('campus_id', campusId)
          .maybeSingle(),
      ]);

    if (linkError || !link || link.univ_no === null) {
      return json({ error: 'ccc_summer_link_not_found' }, 404);
    }
    if (campusError || !campus) {
      return json({ error: 'invalid_campus' }, 400);
    }

    const now = new Date().toISOString();
    const { error: profileError } = await serviceClient
      .from('profiles')
      .update({
        district_id: campus.district_id,
        district: campus.district,
        team_id: campus.team_id,
        team: campus.team,
        campus_id: campus.campus_id,
        campus: campus.campus,
        affiliation_type: 'seoul',
        updated_at: now,
      })
      .eq('id', user.id);
    if (profileError) {
      return json({ error: 'profile_update_failed' }, 500);
    }

    return json({ campus, requiresCampusSelection: false });
  }

  if (action !== 'exchange') {
    return json({ error: 'unsupported_action' }, 400);
  }

  const code = asText(body?.code);
  const redirectUri = asText(body?.redirectUri);
  if (!code || !redirectUris.includes(redirectUri)) {
    return json({ error: 'missing_or_invalid_params' }, 400);
  }

  const exchangeRequestBody = JSON.stringify({
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
  });
  let exchangeResponse: Response | null = null;
  let exchangeBody: {
    error?: string;
    subject_id?: string;
    payload?: Record<string, unknown>;
  } = {};

  for (const cccSummerBase of cccSummerBases) {
    try {
      exchangeResponse = await fetch(
        `${cccSummerBase.replace(/\/+$/, '')}/api/handoff/exchange`,
        {
          method: 'POST',
          signal: AbortSignal.timeout(CCC_SUMMER_REQUEST_TIMEOUT_MS),
          headers: { 'Content-Type': 'application/json' },
          body: exchangeRequestBody,
        },
      );
      exchangeBody = await exchangeResponse.json().catch(() => ({}));
      if (exchangeResponse.ok && !exchangeBody.error) break;
    } catch {
      exchangeResponse = null;
      exchangeBody = {};
    }
  }

  if (!exchangeResponse?.ok || exchangeBody.error) {
    return json(
      { error: exchangeBody.error || 'ccc_summer_exchange_failed' },
      exchangeResponse && exchangeResponse.status >= 400
        ? exchangeResponse.status
        : 400,
    );
  }

  const subjectId = asText(exchangeBody.subject_id);
  const payload = exchangeBody.payload ?? {};
  const name = asText(payload.name);
  const phone = normalizePhone(payload.phone);
  const univNo = asInteger(payload.univ_no);
  const univName = asText(payload.univ_name);
  const branchNo = asInteger(payload.branch_no);
  const branchName = asText(payload.branch_name);
  const isStaff = payload.is_staff === true;
  if (!subjectId || !name || !phone || !univName || !branchName) {
    return json({ error: 'missing_required_profile_fields' }, 400);
  }

  let campus: CampusScope | null = null;
  if (univNo !== null) {
    const { data: mapping, error: mappingError } = await serviceClient
      .from('ccc_summer_campus_mappings')
      .select('campus_id')
      .eq('univ_no', univNo)
      .maybeSingle();
    if (mappingError) {
      return json({ error: 'campus_mapping_lookup_failed' }, 500);
    }
    if (mapping?.campus_id) {
      const { data } = await serviceClient
        .from('campus_options')
        .select('district_id, district, team_id, team, campus_id, campus')
        .eq('campus_id', mapping.campus_id)
        .maybeSingle();
      campus = data as CampusScope | null;
    }
  }

  if (!campus) {
    const { data, error } = await serviceClient
      .from('campus_options')
      .select('district_id, district, team_id, team, campus_id, campus')
      .eq('campus', univName)
      .limit(2);
    if (error) {
      return json({ error: 'campus_lookup_failed' }, 500);
    }
    if (data?.length === 1) {
      campus = data[0] as CampusScope;
      if (univNo !== null) {
        await serviceClient.from('ccc_summer_campus_mappings').upsert({
          univ_no: univNo,
          univ_name: univName,
          campus_id: campus.campus_id,
          updated_at: new Date().toISOString(),
        });
      }
    }
  }

  const { data: existingLink, error: linkError } = await serviceClient
    .from('ccc_summer_user_links')
    .select('user_id')
    .eq('subject_id', subjectId)
    .maybeSingle();
  if (linkError) {
    return json({ error: 'identity_lookup_failed' }, 500);
  }

  const email = await internalEmail(subjectId);
  const password = randomPassword();
  let userId = existingLink?.user_id ?? '';
  let createdUserId = '';
  let updateExistingAuthUser = Boolean(userId);
  const metadata = {
    name,
    phone,
    account_source: 'ccc_summer',
    ccc_summer_subject_id: subjectId,
    district_id: campus?.district_id ?? null,
    district: campus?.district ?? '',
    team_id: campus?.team_id ?? null,
    team: campus?.team ?? '',
    campus_id: campus?.campus_id ?? null,
    campus: campus?.campus ?? '',
    affiliation_type: 'seoul',
  };

  if (!userId) {
    const { data, error } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error || !data.user) {
      const recovery = await findRecoverableAuthUser(
        serviceClient,
        email,
        subjectId,
      );
      if (recovery.error || !recovery.userId) {
        return json({ error: 'account_creation_failed' }, 500);
      }
      userId = recovery.userId;
      updateExistingAuthUser = true;
    } else {
      userId = data.user.id;
      createdUserId = data.user.id;
    }
  }

  const now = new Date().toISOString();
  const [{ error: profileError }, { error: linkUpsertError }] = await Promise.all([
    serviceClient.from('profiles').upsert({
      id: userId,
      email,
      name,
      phone,
      district_id: campus?.district_id ?? null,
      district: campus?.district ?? '',
      team_id: campus?.team_id ?? null,
      team: campus?.team ?? '',
      campus_id: campus?.campus_id ?? null,
      campus: campus?.campus ?? '',
      affiliation_type: 'seoul',
      account_source: 'ccc_summer',
      updated_at: now,
    }),
    serviceClient.from('ccc_summer_user_links').upsert({
      subject_id: subjectId,
      user_id: userId,
      is_staff: isStaff,
      univ_no: univNo,
      univ_name: univName,
      branch_no: branchNo,
      branch_name: branchName,
      last_synced_at: now,
    }),
  ]);
  if (profileError || linkUpsertError) {
    if (createdUserId) {
      const { error: rollbackError } =
        await serviceClient.auth.admin.deleteUser(createdUserId);
      if (rollbackError) {
        console.error('Failed to roll back CCC Summer account:', rollbackError);
      }
    }
    return json({ error: 'profile_sync_failed' }, 500);
  }

  if (updateExistingAuthUser) {
    const { error } = await serviceClient.auth.admin.updateUserById(userId, {
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error) return json({ error: 'account_update_failed' }, 500);
  }

  const loginClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: login, error: loginError } =
    await loginClient.auth.signInWithPassword({ email, password });
  if (loginError || !login.session) {
    return json({ error: 'session_creation_failed' }, 500);
  }

  return json({
    session: {
      access_token: login.session.access_token,
      refresh_token: login.session.refresh_token,
      expires_in: login.session.expires_in,
      expires_at: login.session.expires_at,
      token_type: login.session.token_type,
    },
    profile: {
      name,
      phone,
      univName,
      branchName,
      isStaff,
      campus,
    },
    requiresCampusSelection: !campus,
  });
});
