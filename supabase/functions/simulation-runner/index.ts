import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.0';

const SIMULATION_PROJECT_ID = 'pjbvxoesgwhbxfsfjliw';
const RECOMMENDED_TRANSFER_ACCOUNT = '테스트은행 000-0000-0000';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const getProjectRef = (url: string) => {
  try {
    return new URL(url).hostname.split('.')[0] ?? '';
  } catch {
    return '';
  }
};

const isSimulationEnabled = (value: unknown) => {
  if (value === true) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  const source = value as Record<string, unknown>;
  return source.enabled === true || source.simulation_enabled === true;
};

const pad = (value: number) => String(value).padStart(4, '0');

const hashString = (value: string) => {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const getCampusKey = (campus: Record<string, unknown>) =>
  `campus|${campus.district ?? ''}|${campus.team ?? ''}|${campus.campus ?? ''}`;

const getCampusDistributionFactor = (key: string) => {
  const tierUnit = hashString(`${key}:distribution-tier`) / 0x100000000;
  const tierFactor =
    tierUnit < 0.15
      ? 0.5
      : tierUnit < 0.45
        ? 0.76
        : tierUnit < 0.78
          ? 1
          : tierUnit < 0.94
            ? 1.35
            : 1.75;
  const jitter = 0.94 + (hashString(`${key}:distribution-jitter`) % 13) / 100;
  return tierFactor * jitter;
};

const getSettingObject = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const getParticipationTargetTotal = (value: unknown) => {
  const targets = getSettingObject(getSettingObject(value).targets);
  return Object.values(targets).reduce((sum, target) => {
    const count = Number(target);
    return sum + (Number.isFinite(count) && count > 0 ? count : 0);
  }, 0);
};

interface ReferenceConfig {
  applyRecommendedSeed: boolean;
  participationTarget: number;
  busTicketPrice: number;
  reservationDeadlineDays: number;
  campusCount: number;
  selectedCampusIds: string[];
  stationCount: number;
  selectedStationIds: string[];
  busOptions: Array<{ capacity: number; estimatedPrice: number }>;
}

const getReferenceConfig = (): ReferenceConfig => {
  return {
    applyRecommendedSeed: true,
    participationTarget: 2500,
    busTicketPrice: 20000,
    reservationDeadlineDays: 14,
    campusCount: 47,
    selectedCampusIds: [],
    stationCount: 7,
    selectedStationIds: [],
    busOptions: [{ capacity: 44, estimatedPrice: 700000 }],
  };
};

const RECOMMENDED_SEOUL_ORGANIZATION = [
  {
    name: '동팀',
    campuses: ['서일대학교', '세종대학교', '한양대학교', '한양여자대학교', '건국대학교', '한국체육대학교', '장로회신학대학교'],
  },
  {
    name: '서팀',
    campuses: ['명지전문대학', '명지대학교', '서강대학교', '연세대학교', '경기대학교', '농협대학교', '이화여자대학교', '중부대학교', '추계예술대학교', '한국항공대학교', '홍익대학교'],
  },
  {
    name: '남팀',
    campuses: ['서울대학교', '숭실대학교', '서울교육대학교', '중앙대학교', '백석예술대학교', '동양미래대학교', '강서대학교', '총신대학교'],
  },
  {
    name: '북팀',
    campuses: ['고려대학교', '동덕여자대학교', '서경대학교', '성신여자대학교', '국민대학교'],
  },
  {
    name: '중앙팀',
    campuses: ['숙명여자대학교', '동국대학교', '상명대학교', '숭의여자대학교'],
  },
  {
    name: '북동팀',
    campuses: ['광운대학교', '서울과학기술대학교', '서울여자대학교', '인덕대학교', '한국성서대학교', '경희대학교', '한국외국어대학교', '서울시립대학교'],
  },
  {
    name: '북중앙팀',
    campuses: ['덕성여자대학교', '배화여자대학교', '성균관대학교', '한성대학교'],
  },
] as const;

const RECOMMENDED_STATIONS = [
  { name: '서울역', line: '1호선 / 4호선 / 경의중앙선 / 공항철도', address: '서울특별시 용산구 한강대로 405', lat: 37.5547, lng: 126.9706 },
  { name: '용산역', line: '1호선 / 경의중앙선', address: '서울특별시 용산구 한강대로23길 55', lat: 37.5299, lng: 126.9648 },
  { name: '영등포역', line: '1호선', address: '서울특별시 영등포구 경인로 846', lat: 37.5157, lng: 126.9074 },
  { name: '고속터미널역', line: '3호선 / 7호선 / 9호선', address: '서울특별시 서초구 신반포로 188', lat: 37.5048, lng: 127.0049 },
  { name: '사당역', line: '2호선 / 4호선', address: '서울특별시 동작구 남부순환로 2089', lat: 37.4766, lng: 126.9816 },
  { name: '잠실역', line: '2호선 / 8호선', address: '서울특별시 송파구 올림픽로 265', lat: 37.5133, lng: 127.1002 },
  { name: '청량리역', line: '1호선 / 경의중앙선 / 경춘선 / 수인분당선', address: '서울특별시 동대문구 왕산로 214', lat: 37.5801, lng: 127.0464 },
] as const;

const buildCampusAssignments = <T extends Record<string, unknown>>(
  campuses: T[],
  count: number,
  targets: Record<string, number>,
) => {
  const hasConfiguredTargets = campuses.some(
    (campus) => Math.max(0, Number(targets[getCampusKey(campus)]) || 0) > 0,
  );
  const weights = campuses.map((campus) => {
    const key = getCampusKey(campus);
    const configuredTarget = Math.max(0, Number(targets[key]) || 0);
    return hasConfiguredTargets
      ? Math.max(1, configuredTarget)
      : 25 * getCampusDistributionFactor(key);
  });
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const allocations = weights.map((weight) =>
    Math.max(1, Math.floor((weight / weightTotal) * count))
  );
  let difference = count - allocations.reduce((sum, value) => sum + value, 0);
  let allocationIndex = 0;
  while (difference !== 0 && allocations.length > 0) {
    const direction = difference > 0 ? 1 : -1;
    const targetIndex = allocationIndex % allocations.length;
    if (direction > 0 || allocations[targetIndex] > 1) {
      allocations[targetIndex] += direction;
      difference -= direction;
    }
    allocationIndex += 1;
  }
  const assignments = campuses.flatMap((campus, index) =>
    Array.from({ length: allocations[index] }, () => campus)
  );
  let state = 20260605;
  for (let index = assignments.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);
    [assignments[index], assignments[swapIndex]] = [
      assignments[swapIndex],
      assignments[index],
    ];
  }
  return assignments;
};

const mapWithConcurrency = async <T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) => {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const item = items[cursor];
        cursor += 1;
        await worker(item);
      }
    }),
  );
};

const chunks = <T>(items: T[], size = 200) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size)
  );

const deterministicUnit = (value: string) => hashString(value) / 0x100000000;

const shouldCreateSimulationReservation = (user: { sequence: number }) =>
  Math.max(1, user.sequence) % 10 !== 0;

const getSimulationUsers = async (serviceClient: ReturnType<typeof createClient>) => {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await serviceClient.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;
    users.push(
      ...data.users
        .filter((candidate) => candidate.email?.toLowerCase().match(/^sim-.*@ccc-bus\.test$/))
        .map((candidate) => {
          const metadata = candidate.user_metadata ?? {};
          return {
            userId: candidate.id,
            email: candidate.email ?? '',
            name: String(metadata.name ?? ''),
            phone: String(metadata.phone ?? ''),
            district_id: metadata.district_id ?? null,
            district: String(metadata.district ?? ''),
            team_id: metadata.team_id ?? null,
            team: String(metadata.team ?? ''),
            campus_id: metadata.campus_id ?? null,
            campus: String(metadata.campus ?? ''),
            simRole: metadata.sim_role ?? null,
            sequence: Number(metadata.sim_seq) || 0,
          };
        }),
    );
    if (data.users.length < 1000) break;
  }
  return users.sort((a, b) => a.sequence - b.sequence || a.email.localeCompare(b.email));
};

const stationPreference = (station: Record<string, unknown>, rank: number) => ({
  rank,
  station: {
    id: station.id,
    name: station.name,
    line: station.line,
    address: station.address,
    lat: station.lat,
    lng: station.lng,
  },
});

const buildStationPreferences = (
  stations: Record<string, unknown>[],
  user: { userId: string; district: string; team: string; campus: string },
) => {
  const hotspotCount = Math.min(5, stations.length);
  const hotspots: Record<string, unknown>[] = [];
  let state = hashString(
    `hotspots:campus|${user.district}|${user.team}|${user.campus}`,
  );
  while (hotspots.length < hotspotCount) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const station = stations[state % stations.length];
    if (!hotspots.includes(station)) hotspots.push(station);
  }
  const pickStation = (
    pool: Record<string, unknown>[],
    label: string,
    excludedId?: unknown,
  ) => {
    const candidates = pool.filter((station) => station.id !== excludedId);
    if (candidates.length === 0) return null;
    const index = Math.min(
      candidates.length - 1,
      Math.floor(deterministicUnit(`${user.userId}:${label}`) ** 1.8 * candidates.length),
    );
    return candidates[index];
  };
  const firstPool =
    deterministicUnit(`${user.userId}:first-pool`) < 0.82 ? hotspots : stations;
  const first = pickStation(firstPool, 'first-station');
  if (!first) throw new Error('1지망 행선지를 선택할 수 없습니다.');
  const secondPool =
    deterministicUnit(`${user.userId}:second-pool`) < 0.68 ? hotspots : stations;
  const second =
    pickStation(secondPool, 'second-station', first.id) ??
    pickStation(stations, 'second-station-fallback', first.id);
  if (!second) throw new Error('2지망 행선지를 선택할 수 없습니다.');
  return [stationPreference(first, 1), stationPreference(second, 2)];
};

interface QueryError {
  code?: string;
  message: string;
}

const isMissingTableError = (error: QueryError | null) =>
  Boolean(
    error &&
      (error.code === 'PGRST205' ||
        error.code === '42P01' ||
        error.message.includes('Could not find the table') ||
        error.message.includes('does not exist'))
  );

const throwIfError = (error: QueryError | null, context: string) => {
  if (error) throw new Error(`${context}: ${error.message}`);
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
};

const throwUnlessMissingTable = (
  error: QueryError | null,
  context: string,
  table: string,
  skippedTables: Set<string>,
) => {
  if (isMissingTableError(error)) {
    skippedTables.add(table);
    return;
  }
  throwIfError(error, context);
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
  const authorization = request.headers.get('Authorization') ?? '';

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
    return json({ error: '시뮬레이션 실행 환경 또는 인증 정보가 없습니다.' }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return json({ error: '로그인이 필요합니다.' }, 401);
  }

  const { count: globalAdminCount, error: roleError } = await serviceClient
    .from('admin_roles')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('role', 'global_admin');

  if (roleError || !globalAdminCount) {
    return json({ error: '전체 관리자만 시뮬레이션을 실행할 수 있습니다.' }, 403);
  }

  const currentProjectId = getProjectRef(supabaseUrl);
  if (currentProjectId !== SIMULATION_PROJECT_ID) {
    return json({ error: '허용된 테스트 Supabase 프로젝트가 아닙니다.' }, 403);
  }

  const { data: enabledSetting, error: enabledError } = await serviceClient
    .from('app_settings')
    .select('value')
    .eq('key', 'simulation_enabled')
    .maybeSingle();

  if (enabledError || !isSimulationEnabled(enabledSetting?.value)) {
    return json({ error: 'DB의 simulation_enabled 설정이 활성화되지 않았습니다.' }, 403);
  }

  const body = await request.json().catch(() => ({}));
  const stage = typeof body?.stage === 'string' ? body.stage : '';
  const referenceConfig = getReferenceConfig();

  if (
    stage !== 'cleanup' &&
    stage !== 'reference' &&
    stage !== 'accounts' &&
    stage !== 'reservations' &&
    stage !== 'payments' &&
    stage !== 'transfers' &&
    stage !== 'boarding'
  ) {
    return json({ error: '아직 서버 실행이 연결되지 않은 단계입니다.' }, 501);
  }

  const requestedRunId = typeof body?.run_id === 'string' ? body.run_id : null;
  const runQuery = requestedRunId
    ? serviceClient
        .from('simulation_stage_runs')
        .select('id,summary')
        .eq('id', requestedRunId)
        .eq('requested_by', user.id)
        .eq('stage', stage)
        .single()
    : serviceClient
        .from('simulation_stage_runs')
        .insert({
          stage,
          status: 'running',
          requested_by: user.id,
        })
        .select('id,summary')
        .single();
  const { data: run, error: runError } = await runQuery;

  if (runError || !run) {
    return json({ error: runError?.message ?? '실행 기록을 생성하지 못했습니다.' }, 500);
  }

  try {
    if (stage === 'cleanup') {
      const batchSize = Math.min(100, Math.max(1, Number(body?.batch_size) || 50));
      const simulationUsers = [];
      const previousSkipped = Array.isArray(
        (run as { summary?: Record<string, unknown> }).summary?.skipped_tables,
      )
        ? ((run as { summary?: Record<string, unknown> }).summary?.skipped_tables as string[])
        : [];
      const skippedTables = new Set(previousSkipped);

      for (let page = 1; ; page += 1) {
        const { data, error } = await serviceClient.auth.admin.listUsers({
          page,
          perPage: 1000,
        });
        if (error) throw error;
        const matches = data.users.filter((candidate) =>
          candidate.email?.toLowerCase().match(/^sim-.*@ccc-bus\.test$/),
        );
        simulationUsers.push(...matches);
        if (data.users.length < 1000) break;
      }

      const batch = simulationUsers.slice(0, batchSize);
      const ids = batch.map((candidate) => candidate.id);

      if (ids.length > 0) {
        throwUnlessMissingTable(
          (await serviceClient.from('campus_notice_reads').delete().in('user_id', ids)).error,
          '시뮬레이션 공지 읽음 기록 정리 실패',
          'campus_notice_reads',
          skippedTables,
        );
        throwUnlessMissingTable(
          (await serviceClient.from('campus_request_messages').delete().in('sender_id', ids)).error,
          '시뮬레이션 요청 메시지 정리 실패',
          'campus_request_messages',
          skippedTables,
        );
        throwUnlessMissingTable(
          (await serviceClient.from('campus_requests').delete().in('created_by', ids)).error,
          '시뮬레이션 요청 정리 실패',
          'campus_requests',
          skippedTables,
        );
        throwUnlessMissingTable(
          (
            await serviceClient
              .from('campus_requests')
              .update({ handled_by: null, handled_at: null, updated_at: new Date().toISOString() })
              .in('handled_by', ids)
          ).error,
          '시뮬레이션 요청 처리자 참조 정리 실패',
          'campus_requests',
          skippedTables,
        );
        throwUnlessMissingTable(
          (await serviceClient.from('campus_transfers').delete().in('sent_by', ids)).error,
          '시뮬레이션 송금 보고 정리 실패',
          'campus_transfers',
          skippedTables,
        );
        throwUnlessMissingTable(
          (await serviceClient.from('campus_transfers').delete().in('confirmed_by', ids)).error,
          '시뮬레이션 송금 확인 정리 실패',
          'campus_transfers',
          skippedTables,
        );
        throwIfError(
          (await serviceClient.from('bus_allocations').delete().in('created_by', ids)).error,
          '시뮬레이션 배차 정리 실패',
        );
        throwIfError(
          (
            await serviceClient
              .from('payments')
              .update({ verified_by: null, verified_at: null, updated_at: new Date().toISOString() })
              .in('verified_by', ids)
          ).error,
          '시뮬레이션 입금 확인자 참조 정리 실패',
        );
        throwIfError(
          (await serviceClient.from('payments').delete().in('user_id', ids)).error,
          '시뮬레이션 입금 정리 실패',
        );
        throwIfError(
          (await serviceClient.from('reservations').delete().in('user_id', ids)).error,
          '시뮬레이션 예약 정리 실패',
        );
        throwIfError(
          (
            await serviceClient
              .from('admin_roles')
              .update({ granted_by: null, updated_at: new Date().toISOString() })
              .in('granted_by', ids)
          ).error,
          '시뮬레이션 권한 부여자 참조 정리 실패',
        );
        throwIfError(
          (await serviceClient.from('admin_roles').delete().in('user_id', ids)).error,
          '시뮬레이션 관리자 권한 정리 실패',
        );
        throwIfError(
          (await serviceClient.from('profiles').delete().in('id', ids)).error,
          '시뮬레이션 프로필 정리 실패',
        );

        await mapWithConcurrency(batch, 10, async (candidate) => {
          const { error } = await serviceClient.auth.admin.deleteUser(candidate.id);
          if (error) throw new Error(`${candidate.email ?? candidate.id}: ${error.message}`);
        });
      }

      throwIfError(
        (await serviceClient.from('bus_allocations').delete().like('allocation_name', 'SIM-%')).error,
        'SIM 배차 데이터 정리 실패',
      );

      const remaining = Math.max(0, simulationUsers.length - batch.length);
      const done = remaining === 0;
      let operationDataCleanup: Record<string, unknown> = {};

      if (done) {
        const deleteAllRows = async (
          table: string,
          key = 'id',
          optional = false,
        ) => {
          const { data, error } = await serviceClient
            .from(table)
            .delete()
            .not(key, 'is', null)
            .select(key);
          if (optional && isMissingTableError(error)) {
            skippedTables.add(table);
            return 0;
          }
          throwIfError(error, `${table} 전체 초기화 실패`);
          return data?.length ?? 0;
        };

        const deletedCampusNoticeReads = await deleteAllRows('campus_notice_reads', 'id', true);
        const deletedCampusRequestMessages = await deleteAllRows('campus_request_messages', 'id', true);
        const deletedCampusRequests = await deleteAllRows('campus_requests', 'id', true);
        const deletedCampusTransfers = await deleteAllRows('campus_transfers', 'id', true);
        const deletedBusAllocations = await deleteAllRows('bus_allocations');
        const deletedPayments = await deleteAllRows('payments');
        const deletedReservations = await deleteAllRows('reservations');
        const deletedHomeAnnouncements = await deleteAllRows('home_announcements', 'id', true);
        const deletedStations = await deleteAllRows('stations');
        const deletedBusOptions = await deleteAllRows('bus_options');

        const { data: deletedCampusAdminRoles, error: campusAdminRoleError } =
          await serviceClient
            .from('admin_roles')
            .delete()
            .eq('role', 'campus_admin')
            .select('id');
        throwIfError(campusAdminRoleError, '캠퍼스 회계 순장님 권한 초기화 실패');

        const clearedOrganization = {
          district_id: null,
          team_id: null,
          campus_id: null,
          district: null,
          team: null,
          campus: null,
          updated_at: new Date().toISOString(),
        };
        throwIfError(
          (
            await serviceClient
              .from('admin_roles')
              .update(clearedOrganization)
              .eq('role', 'global_admin')
          ).error,
          '전체 관리자 조직 범위 초기화 실패',
        );
        throwIfError(
          (
            await serviceClient
              .from('profiles')
              .update(clearedOrganization)
              .not('id', 'is', null)
          ).error,
          '사용자 조직 정보 초기화 실패',
        );

        const { count: districtCount, error: districtCountError } = await serviceClient
          .from('districts')
          .select('*', { count: 'exact', head: true });
        const { count: teamCount, error: teamCountError } = await serviceClient
          .from('teams')
          .select('*', { count: 'exact', head: true });
        const { count: campusCount, error: campusCountError } = await serviceClient
          .from('campuses')
          .select('*', { count: 'exact', head: true });
        throwIfError(districtCountError, '지구 수 확인 실패');
        throwIfError(teamCountError, '팀 수 확인 실패');
        throwIfError(campusCountError, '캠퍼스 수 확인 실패');
        await deleteAllRows('districts');

        const deletedAppSettings = await deleteAllRows('app_settings', 'key');
        throwIfError(
          (
            await serviceClient.from('app_settings').insert({
              key: 'simulation_enabled',
              value: { enabled: true },
            })
          ).error,
          '시뮬레이션 실행 잠금 복원 실패',
        );

        operationDataCleanup = {
          campusNoticeReads: deletedCampusNoticeReads,
          campusRequestMessages: deletedCampusRequestMessages,
          campusRequests: deletedCampusRequests,
          campusTransfers: deletedCampusTransfers,
          busAllocations: deletedBusAllocations,
          payments: deletedPayments,
          reservations: deletedReservations,
          homeAnnouncements: deletedHomeAnnouncements,
          stations: deletedStations,
          busOptions: deletedBusOptions,
          appSettings: deletedAppSettings,
          campusAdminRoles: deletedCampusAdminRoles?.length ?? 0,
          districts: districtCount ?? 0,
          teams: teamCount ?? 0,
          campuses: campusCount ?? 0,
          organization: (districtCount ?? 0) + (teamCount ?? 0) + (campusCount ?? 0),
        };
      }

      const previousDeleted = Number((run as { summary?: Record<string, unknown> }).summary?.deleted) || 0;
      const summary = {
        deleted: previousDeleted + batch.length,
        deleted_in_batch: batch.length,
        remaining,
        operation_data_cleanup: operationDataCleanup,
        skipped_tables: [...skippedTables].sort(),
      };
      await serviceClient
        .from('simulation_stage_runs')
        .update({
          status: done ? 'completed' : 'running',
          summary,
          completed_at: done ? new Date().toISOString() : null,
        })
        .eq('id', run.id);

      return json({
        run_id: run.id,
        stage,
        status: done ? 'completed' : 'running',
        summary,
        next_offset: null,
        done,
      });
    }

    if (stage === 'accounts') {
      const requiredSettingKeys = [
        'bus_ticket_price',
        'participation_targets',
        'global_scenario_checklist',
        'simulation_reference_scope',
      ];
      const [
        setupCampusResult,
        setupStationResult,
        setupBusOptionResult,
        setupSettingResult,
      ] = await Promise.all([
        serviceClient
          .from('campus_options')
          .select('*', { count: 'exact', head: true }),
        serviceClient
          .from('stations')
          .select('*', { count: 'exact', head: true })
          .eq('is_active', true),
        serviceClient
          .from('bus_options')
          .select('*', { count: 'exact', head: true })
          .like('notes', 'SIM-%'),
        serviceClient
          .from('app_settings')
          .select('key,value')
          .in('key', requiredSettingKeys),
      ]);
      const setupLoadError = [
        setupCampusResult.error,
        setupStationResult.error,
        setupBusOptionResult.error,
        setupSettingResult.error,
      ].find(Boolean);
      if (setupLoadError) throw setupLoadError;

      const settings = new Map(
        (setupSettingResult.data ?? []).map((setting) => [setting.key, setting.value]),
      );
      const ticketPrice = Number(
        getSettingObject(settings.get('bus_ticket_price')).price,
      );
      const participationTarget = getParticipationTargetTotal(
        settings.get('participation_targets'),
      );
      const checklist = getSettingObject(settings.get('global_scenario_checklist'));
      const referenceScope = getSettingObject(settings.get('simulation_reference_scope'));
      const selectedCampusIds = Array.isArray(referenceScope.campus_ids)
        ? referenceScope.campus_ids.map(String)
        : [];
      const selectedStationIds = Array.isArray(referenceScope.station_ids)
        ? referenceScope.station_ids.map(String)
        : [];
      const missingSetup = [
        { ready: selectedCampusIds.length > 0, label: '사용 캠퍼스 범위' },
        { ready: selectedStationIds.length > 0, label: '사용 행선지 범위' },
        { ready: (setupBusOptionResult.count ?? 0) >= 1, label: 'SIM 버스 옵션' },
        {
          ready: Number.isFinite(ticketPrice) && ticketPrice > 0,
          label: '버스 요금',
        },
        { ready: participationTarget >= 2000, label: '참여 목표 2,000명' },
        {
          ready: Array.isArray(checklist.checked_step_ids),
          label: '시나리오 체크리스트',
        },
      ]
        .filter(({ ready }) => !ready)
        .map(({ label }) => label);

      if (missingSetup.length > 0) {
        const message =
          `회원 및 캠퍼스 회계 순장님 생성 전에 실제 기초 세팅이 필요합니다: ${missingSetup.join(', ')}`;
        await serviceClient
          .from('simulation_stage_runs')
          .update({
            status: 'failed',
            error_message: message,
            completed_at: new Date().toISOString(),
          })
          .eq('id', run.id);
        return json({
          error: message,
          run_id: run.id,
          stage,
          status: 'failed',
          done: true,
        });
      }

      const batchSize = Math.min(100, Math.max(1, Number(body?.batch_size) || 50));
      const password = Deno.env.get('SIMULATION_PASSWORD') ?? 'Simulation123!';
      const previousSummary = (run.summary ?? {}) as Record<string, unknown>;
      const requestedUserCount = Math.max(
        2000,
        Math.min(5000, Number(body?.user_count) || 2000),
      );
      const userCount = requestedRunId
        ? Math.max(2000, Math.min(5000, Number(previousSummary.general_users) || 2000))
        : requestedUserCount;
      const offset = requestedRunId
        ? Math.max(0, Number(previousSummary.processed) || 0)
        : 0;
      const [activeCampusResult, districtResult, teamResult, campusResult, targetResult] =
        await Promise.all([
          serviceClient
            .from('campus_options')
            .select('district_id,district,team_id,team,campus_id,campus')
            .order('district_sort_order')
            .order('team_sort_order')
            .order('campus_sort_order'),
          serviceClient.from('districts').select('id,name,sort_order'),
          serviceClient.from('teams').select('id,district_id,name,sort_order'),
          serviceClient.from('campuses').select('id,team_id,name,sort_order'),
          serviceClient
            .from('app_settings')
            .select('value')
            .eq('key', 'participation_targets')
            .maybeSingle(),
        ]);
      const loadError = [
        activeCampusResult.error,
        districtResult.error,
        teamResult.error,
        campusResult.error,
        targetResult.error,
      ].find(Boolean);
      if (loadError) throw loadError;
      if (!activeCampusResult.data?.length) throw new Error('활성 캠퍼스가 없습니다.');

      const districtById = new Map(
        (districtResult.data ?? []).map((district) => [district.id, district]),
      );
      const teamById = new Map((teamResult.data ?? []).map((team) => [team.id, team]));
      const allCampuses = (campusResult.data ?? [])
        .map((campus) => {
          const team = teamById.get(campus.team_id);
          const district = team ? districtById.get(team.district_id) : null;
          if (!team || !district) return null;
          return {
            district_id: district.id,
            district: district.name,
            team_id: team.id,
            team: team.name,
            campus_id: campus.id,
            campus: campus.name,
            sort_key: `${String(district.sort_order).padStart(5, '0')}:${String(team.sort_order).padStart(5, '0')}:${String(campus.sort_order).padStart(5, '0')}:${campus.name}`,
          };
        })
        .filter(
          (campus): campus is NonNullable<typeof campus> =>
            Boolean(campus && selectedCampusIds.includes(campus.campus_id)),
        )
        .sort((a, b) => a.sort_key.localeCompare(b.sort_key));
      if (!allCampuses.length) {
        throw new Error('1단계에서 선택한 사용 캠퍼스를 찾지 못했습니다.');
      }
      if (offset === 0) {
        const [campusAdminRoleResult, simulationProfileResult] = await Promise.all([
          serviceClient
            .from('admin_roles')
            .select('user_id,campus_id')
            .eq('role', 'campus_admin'),
          serviceClient
            .from('profiles')
            .select('id')
            .like('email', 'sim-%@ccc-bus.test'),
        ]);
        const conflictLoadError =
          campusAdminRoleResult.error ?? simulationProfileResult.error;
        if (conflictLoadError) throw conflictLoadError;

        const simulationProfileIds = new Set(
          (simulationProfileResult.data ?? []).map((profile) => profile.id),
        );
        const targetCampusIds = new Set(allCampuses.map((campus) => campus!.campus_id));
        const conflictingRoles = (campusAdminRoleResult.data ?? []).filter(
          (role) =>
            role.campus_id &&
            targetCampusIds.has(role.campus_id) &&
            !simulationProfileIds.has(role.user_id),
        );
        if (conflictingRoles.length > 0) {
          throw new Error(
            `실제 캠퍼스 회계 순장님 권한 ${conflictingRoles.length}개가 있어 2단계를 실행할 수 없습니다.`,
          );
        }
      }
      const targetValue = targetResult.data?.value as {
        targets?: Record<string, number>;
      } | null;
      const assignments = buildCampusAssignments(
        activeCampusResult.data,
        userCount,
        targetValue?.targets ?? {},
      );
      const generalUserCountByCampus = new Map<string, number>();
      for (const campus of assignments) {
        generalUserCountByCampus.set(
          campus.campus_id,
          (generalUserCountByCampus.get(campus.campus_id) ?? 0) + 1,
        );
      }
      const campusDistribution = [...generalUserCountByCampus.values()];
      const generalSpecs = assignments.map((campus, index) => {
        const sequence = index + 1;
        return {
          email: `sim-user-${pad(sequence)}@ccc-bus.test`,
          name: `시뮬레이션 사용자 ${pad(sequence)}`,
          phone: `010-9${String(sequence).padStart(7, '0').slice(-7)}`,
          sim_role: null,
          sim_seq: sequence,
          ...campus,
        };
      });
      const multiCampusAdminCount = Math.min(5, Math.floor(allCampuses.length / 2));
      const multiCampusGroups = Array.from(
        { length: multiCampusAdminCount },
        (_, index) => allCampuses.slice(index * 2, index * 2 + 2),
      );
      const singleCampusGroups = allCampuses
        .slice(multiCampusAdminCount * 2)
        .map((campus) => [campus]);
      const adminSpecs = [...multiCampusGroups, ...singleCampusGroups].map(
        (managedCampuses, index) => ({
          email: `sim-admin-campus-${pad(index + 1)}@ccc-bus.test`,
          name: `시뮬레이션 캠퍼스 회계 순장님 ${pad(index + 1)}`,
          phone: `010-8${String(index + 1).padStart(7, '0').slice(-7)}`,
          sim_role: 'campus_admin',
          sim_seq: userCount + index + 1,
          managed_campuses: managedCampuses,
          ...managedCampuses[0]!,
        }),
      );
      const specs = [...generalSpecs, ...adminSpecs];
      const batch = specs.slice(offset, offset + batchSize);
      const emails = batch.map((spec) => spec.email);
      const { data: existingProfiles, error: profileLoadError } = await serviceClient
        .from('profiles')
        .select('id,email')
        .in('email', emails);
      if (profileLoadError) throw profileLoadError;
      const existingByEmail = new Map(
        (existingProfiles ?? []).map((profile) => [profile.email, profile.id]),
      );
      let created = 0;
      let skipped = 0;

      await mapWithConcurrency(batch, 10, async (spec) => {
        if (existingByEmail.has(spec.email)) {
          skipped += 1;
          return;
        }
        const { data: createdUser, error: createError } =
          await serviceClient.auth.admin.createUser({
            email: spec.email,
            password,
            email_confirm: true,
            user_metadata: {
              name: spec.name,
              phone: spec.phone,
              district_id: spec.district_id,
              district: spec.district,
              team_id: spec.team_id,
              team: spec.team,
              campus_id: spec.campus_id,
              campus: spec.campus,
              payment_status: spec.sim_role ? 'completed' : 'pending',
              sim_role: spec.sim_role,
              sim_seq: spec.sim_seq,
              managed_campus_ids:
                spec.sim_role === 'campus_admin'
                  ? spec.managed_campuses.map((campus) => campus.campus_id)
                  : [],
            },
          });
        if (createError || !createdUser.user) {
          throw new Error(`${spec.email}: ${createError?.message ?? '계정 생성 실패'}`);
        }
        existingByEmail.set(spec.email, createdUser.user.id);
        created += 1;
      });

      const adminBatch = batch.filter((spec) => spec.sim_role === 'campus_admin');
      for (const spec of adminBatch) {
        const userId = existingByEmail.get(spec.email);
        if (!userId) throw new Error(`${spec.email} 프로필을 찾지 못했습니다.`);
        const { error: roleDeleteError } = await serviceClient
          .from('admin_roles')
          .delete()
          .eq('user_id', userId)
          .eq('role', 'campus_admin');
        if (roleDeleteError) throw roleDeleteError;
        const roleValues = spec.managed_campuses.map((campus) => ({
            user_id: userId,
            role: 'campus_admin',
            district_id: campus.district_id,
            district: campus.district,
            team_id: campus.team_id,
            team: campus.team,
            campus_id: campus.campus_id,
            campus: campus.campus,
          }));
        const { error: roleWriteError } = await serviceClient
          .from('admin_roles')
          .insert(roleValues);
        if (roleWriteError) throw roleWriteError;
      }

      const processed = Math.min(offset + batch.length, specs.length);
      const done = processed >= specs.length;
      const createdTotal = (Number(previousSummary.created_total) || 0) + created;
      const skippedTotal = (Number(previousSummary.skipped_total) || 0) + skipped;
      const summary = {
        total_accounts: specs.length,
        general_users: generalSpecs.length,
        campus_admins: adminSpecs.length,
        multi_campus_admins: multiCampusAdminCount,
        campus_admin_roles: allCampuses.length,
        general_user_distribution_range:
          `${Math.min(...campusDistribution)}~${Math.max(...campusDistribution)}명`,
        processed,
        created_in_batch: created,
        skipped_in_batch: skipped,
        created_total: createdTotal,
        skipped_total: skippedTotal,
      };
      if (done) {
        const [profileCountResult, simulationAdminProfilesResult] = await Promise.all([
          serviceClient
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .like('email', 'sim-%@ccc-bus.test'),
          serviceClient
            .from('profiles')
            .select('id')
            .like('email', 'sim-admin-campus-%@ccc-bus.test'),
        ]);
        const verificationLoadError =
          profileCountResult.error ?? simulationAdminProfilesResult.error;
        if (verificationLoadError) throw verificationLoadError;
        const adminProfileIds = (simulationAdminProfilesResult.data ?? []).map(
          (profile) => profile.id,
        );
        const adminRoleResult = adminProfileIds.length
          ? await serviceClient
              .from('admin_roles')
              .select('*', { count: 'exact', head: true })
              .eq('role', 'campus_admin')
              .in('user_id', adminProfileIds)
          : { count: 0, error: null };
        if (adminRoleResult.error) throw adminRoleResult.error;

        const verifiedProfiles = profileCountResult.count ?? 0;
        const verifiedAdminRoles = adminRoleResult.count ?? 0;
        if (
          verifiedProfiles !== specs.length ||
          verifiedAdminRoles !== allCampuses.length
        ) {
          throw new Error(
            `2단계 검증 실패: 프로필 ${verifiedProfiles}/${specs.length}, 캠퍼스 회계 순장님 권한 ${verifiedAdminRoles}/${allCampuses.length}`,
          );
        }
        Object.assign(summary, {
          verified_profiles: verifiedProfiles,
          verified_campus_admin_roles: verifiedAdminRoles,
        });
      }
      await serviceClient
        .from('simulation_stage_runs')
        .update({
          status: done ? 'completed' : 'running',
          summary,
          completed_at: done ? new Date().toISOString() : null,
        })
        .eq('id', run.id);

      return json({
        run_id: run.id,
        stage,
        status: done ? 'completed' : 'running',
        summary,
        next_offset: processed,
        done,
      });
    }

    if (stage === 'reservations' || stage === 'payments') {
      const batchSize = Math.min(200, Math.max(1, Number(body?.batch_size) || 100));
      const previousSummary = (run.summary ?? {}) as Record<string, unknown>;
      const offset = requestedRunId
        ? Math.max(0, Number(previousSummary.processed) || 0)
        : 0;
      const users = await getSimulationUsers(serviceClient);
      if (users.length === 0) {
        throw new Error('시뮬레이션 계정이 없습니다. 2단계를 먼저 실행하세요.');
      }
      let activeReservationCount = 0;
      if (stage === 'payments') {
        const { count, error } = await serviceClient
          .from('reservations')
          .select('id', { count: 'exact', head: true })
          .in('status', ['requested', 'confirmed']);
        if (error) throw error;
        activeReservationCount = count ?? 0;
        if (activeReservationCount === 0) {
          throw new Error('입금 생성 대상인 요청 또는 확정 상태의 활성 시뮬레이션 신청이 없습니다. 3단계 개별 신청을 먼저 실행하세요.');
        }
      }
      const batch = stage === 'reservations' ? users.slice(offset, offset + batchSize) : [];
      let createdInBatch = 0;
      let updatedInBatch = 0;
      let completedInBatch = 0;
      let verifiedInBatch = 0;
      const skippedInBatch = 0;

      if (stage === 'reservations') {
        const { data: stations, error: stationError } = await serviceClient
          .from('stations')
          .select('id,name,line,address,lat,lng')
          .eq('is_active', true)
          .order('sort_order')
          .order('name');
        if (stationError) throw stationError;
        if (!stations || stations.length < 2) {
          throw new Error('예약 생성에는 활성 행선지가 최소 2개 필요합니다.');
        }
        const now = Date.now();
        const reservationUsers = batch.filter(shouldCreateSimulationReservation);
        const nonReservationUserIds = batch
          .filter((simulationUser) => !shouldCreateSimulationReservation(simulationUser))
          .map((simulationUser) => simulationUser.userId);
        if (nonReservationUserIds.length > 0) {
          const { error: paymentDeleteError } = await serviceClient
            .from('payments')
            .delete()
            .in('user_id', nonReservationUserIds);
          if (paymentDeleteError) {
            throw new Error(`미신청 계정 입금 데이터 정리 실패: ${paymentDeleteError.message}`);
          }
          const { error: reservationDeleteError } = await serviceClient
            .from('reservations')
            .delete()
            .in('user_id', nonReservationUserIds);
          if (reservationDeleteError) {
            throw new Error(`미신청 계정 예약 정리 실패: ${reservationDeleteError.message}`);
          }
        }
        const rows = reservationUsers.map((simulationUser) => {
          const requestedAge = deterministicUnit(`${simulationUser.userId}:requested-age`);
          const requestedAt = new Date(
            now - Math.floor(requestedAge ** 1.7 * 24 * 60) * 60_000,
          ).toISOString();
          const stationPreferences = buildStationPreferences(stations, simulationUser);
          return {
            user_id: simulationUser.userId,
            name: simulationUser.name,
            phone: simulationUser.phone,
            district_id: simulationUser.district_id,
            district: simulationUser.district,
            team_id: simulationUser.team_id,
            team: simulationUser.team,
            campus_id: simulationUser.campus_id,
            campus: simulationUser.campus,
            station_preferences: stationPreferences,
            status: 'requested',
            confirmed_ticket: null,
            data: {
              id: `reservation-sim-${pad(simulationUser.sequence)}`,
              name: simulationUser.name,
              phone: simulationUser.phone,
              district: simulationUser.district,
              team: simulationUser.team,
              campus: simulationUser.campus,
              stationPreferences,
              status: 'requested',
              requestedAt,
            },
            created_at: requestedAt,
            updated_at: requestedAt,
          };
        });
        if (rows.length > 0) {
          const { error } = await serviceClient
            .from('reservations')
            .upsert(rows, { onConflict: 'user_id' });
          if (error) throw new Error(`예약 저장 실패: ${error.message}`);
        }
        createdInBatch = rows.length;
      } else {
        const [
          { data: reservations, error: reservationError },
          { data: priceSetting, error: priceError },
          { data: campusAdminRoles, error: adminRoleError },
        ] =
          await Promise.all([
            serviceClient
              .from('reservations')
              .select('id,user_id,status,district_id,district,team_id,team,campus_id,campus,affiliation_type')
              .in('status', ['requested', 'confirmed'])
              .order('id')
              .range(offset, offset + batchSize - 1),
            serviceClient
              .from('app_settings')
              .select('value')
              .eq('key', 'bus_ticket_price')
              .maybeSingle(),
            serviceClient
              .from('admin_roles')
              .select('user_id,role,district_id,district,team_id,team,campus_id,campus')
              .eq('role', 'campus_admin'),
          ]);
        if (reservationError) throw reservationError;
        if (priceError) throw priceError;
        if (adminRoleError) throw adminRoleError;
        const ticketPrice = Math.max(
          0,
          Number(getSettingObject(priceSetting?.value).price) || 0,
        );
        if (ticketPrice <= 0) {
          throw new Error('유효한 버스표 가격이 없습니다. 1단계 운영 초기값 설정을 먼저 실행하세요.');
        }
        const simulationUserIds = new Set(users.map((simulationUser) => simulationUser.userId));
        const adminByScope = new Map(
          (campusAdminRoles ?? [])
            .filter((role) => simulationUserIds.has(role.user_id))
            .map((role) => [getCampusKey(role), role.user_id]),
        );
        const now = new Date().toISOString();
        const reservationIds = (reservations ?? []).map((reservation) => reservation.id);
        const { data: payments, error: paymentError } = reservationIds.length > 0
          ? await serviceClient
              .from('payments')
              .select('id,reservation_id')
              .in('reservation_id', reservationIds)
          : { data: [], error: null };
        if (paymentError) throw paymentError;
        const paymentByReservationId = new Map(
          (payments ?? []).map((payment) => [payment.reservation_id, payment]),
        );
        const existingReservationIds = new Set(
          (payments ?? []).map((payment) => payment.reservation_id),
        );
        const missingRows = [];
        const existingReservationIdsByAdmin = new Map<string, string[]>();
        const externalReservations = [];
        for (const reservation of reservations ?? []) {
          if (reservation.affiliation_type === 'external') {
            externalReservations.push(reservation);
            continue;
          }
          const scope = getCampusKey(reservation);
          const campusAdminId = adminByScope.get(scope) ?? user.id;
          if (existingReservationIds.has(reservation.id)) {
            existingReservationIdsByAdmin.set(campusAdminId, [
              ...(existingReservationIdsByAdmin.get(campusAdminId) ?? []),
              reservation.id,
            ]);
            continue;
          }
          missingRows.push({
            user_id: reservation.user_id,
            reservation_id: reservation.id,
            amount: ticketPrice,
            status: 'completed',
            paid_at: now,
            verified_by: campusAdminId,
            verified_at: now,
            notes: '시뮬레이션 전체 활성 신청 입금 완료',
            updated_at: now,
          });
        }
        for (const [campusAdminId, existingReservationIds] of existingReservationIdsByAdmin) {
          const { error: updateError } = await serviceClient
            .from('payments')
            .update({
              amount: ticketPrice,
              status: 'completed',
              paid_at: now,
              verified_by: campusAdminId,
              verified_at: now,
              notes: '시뮬레이션 전체 활성 신청 입금 완료',
              updated_at: now,
            })
            .in('reservation_id', existingReservationIds);
          if (updateError) throw new Error(`기존 입금 완료 처리 실패: ${updateError.message}`);
        }
        if (missingRows.length > 0) {
          const { error: insertError } = await serviceClient.from('payments').insert(missingRows);
          if (insertError) throw new Error(`신규 입금 완료 처리 실패: ${insertError.message}`);
        }
        for (const reservation of externalReservations) {
          const { error: externalPaymentError } = await userClient.rpc(
            'upsert_reservation_payment',
            {
              p_payment_id: paymentByReservationId.get(reservation.id)?.id ?? null,
              p_reservation_id: reservation.id,
              p_user_id: reservation.user_id,
              p_amount: ticketPrice,
              p_status: 'completed',
            },
          );
          if (externalPaymentError) {
            throw new Error(`외부 참가자 입금 완료 처리 실패: ${externalPaymentError.message}`);
          }
        }
        createdInBatch = missingRows.length;
        updatedInBatch = existingReservationIds.size;
        completedInBatch = (reservations ?? []).length;
        verifiedInBatch = completedInBatch;
      }

      const totalWorkItems = stage === 'payments' ? activeReservationCount : users.length;
      const processedInBatch = stage === 'payments' ? completedInBatch : batch.length;
      const processed = Math.min(offset + processedInBatch, totalWorkItems);
      const done = processed >= totalWorkItems;
      const previousCreated = Number(previousSummary.created_total) || 0;
      const previousUpdated = Number(previousSummary.updated_total) || 0;
      const previousCompleted = Number(previousSummary.completed_total) || 0;
      const previousVerified = Number(previousSummary.verified_total) || 0;
      const previousSkipped = Number(previousSummary.skipped_total) || 0;
      const createdTotal = previousCreated + createdInBatch;
      const completedTotal = previousCompleted + completedInBatch;
      const summary = {
        total_accounts: totalWorkItems,
        processed,
        created_in_batch: createdInBatch,
        created_total: createdTotal,
        not_applied_total: processed - createdTotal,
        ...(stage === 'payments'
          ? {
              completed_in_batch: completedInBatch,
              updated_in_batch: updatedInBatch,
              skipped_in_batch: skippedInBatch,
              verified_in_batch: verifiedInBatch,
              updated_total: previousUpdated + updatedInBatch,
              completed_total: completedTotal,
              skipped_total: previousSkipped + skippedInBatch,
              verified_total: previousVerified + verifiedInBatch,
            }
          : {}),
      };
      await serviceClient
        .from('simulation_stage_runs')
        .update({
          status: done ? 'completed' : 'running',
          summary,
          completed_at: done ? new Date().toISOString() : null,
        })
        .eq('id', run.id);

      return json({
        run_id: run.id,
        stage,
        status: done ? 'completed' : 'running',
        summary,
        next_offset: processed,
        done,
      });
    }

    if (stage === 'transfers') {
      const users = await getSimulationUsers(serviceClient);
      if (users.length === 0) {
        throw new Error('시뮬레이션 계정이 없습니다. 2단계를 먼저 실행하세요.');
      }
      const simulationUserIds = new Set(users.map((simulationUser) => simulationUser.userId));
      const [
        { data: activeReservations, error: reservationError },
        { data: campusAdminRoles, error: adminRoleError },
      ] = await Promise.all([
        serviceClient
          .from('reservations')
          .select('id,user_id,status,district_id,district,team_id,team,campus_id,campus')
          .neq('status', 'cancelled'),
        serviceClient
          .from('admin_roles')
          .select('user_id,role,district_id,district,team_id,team,campus_id,campus')
          .eq('role', 'campus_admin'),
      ]);
      if (reservationError) throw reservationError;
      if (adminRoleError) throw adminRoleError;

      const nonSimulationReservations = (activeReservations ?? []).filter(
        (reservation) => !simulationUserIds.has(reservation.user_id),
      );
      if (nonSimulationReservations.length > 0) {
        throw new Error(
          `활성 상태의 실제 사용자 예약 ${nonSimulationReservations.length}건이 있어 모두 송금 처리할 수 없습니다.`,
        );
      }
      const reservations = (activeReservations ?? []).filter(
        (reservation) =>
          simulationUserIds.has(reservation.user_id) &&
          (reservation.status === 'requested' || reservation.status === 'confirmed'),
      );
      if (reservations.length === 0) {
        throw new Error('송금 처리할 시뮬레이션 예약이 없습니다. 3단계를 먼저 실행하세요.');
      }

      const adminByScope = new Map(
        (campusAdminRoles ?? [])
          .filter((role) => simulationUserIds.has(role.user_id))
          .map((role) => [getCampusKey(role), role.user_id]),
      );
      const reservationIdsByScope = new Map<string, string[]>();
      const reservationByScope = new Map<string, typeof reservations[number]>();
      for (const reservation of reservations) {
        const scope = getCampusKey(reservation);
        if (!adminByScope.has(scope)) {
          throw new Error(`${scope} 범위의 시뮬레이션 캠퍼스 회계 순장님이 없습니다.`);
        }
        reservationIdsByScope.set(scope, [
          ...(reservationIdsByScope.get(scope) ?? []),
          reservation.id,
        ]);
        reservationByScope.set(scope, reservation);
      }

      const now = new Date().toISOString();
      const reservationIds = reservations.map((reservation) => reservation.id);
      const payments = [];
      for (const reservationIdChunk of chunks(reservationIds)) {
        const { data, error } = await serviceClient
          .from('payments')
          .select('reservation_id,status,amount,verified_by,verified_at')
          .in('reservation_id', reservationIdChunk);
        if (error) throw error;
        payments.push(...(data ?? []));
      }
      const paymentByReservationId = new Map(
        payments.map((payment) => [payment.reservation_id, payment]),
      );
      const transferRows = [...reservationIdsByScope.entries()].map(([scope, ids]) => {
        const reservation = reservationByScope.get(scope);
        const sentBy = adminByScope.get(scope);
        if (!reservation || !sentBy) throw new Error(`${scope} 송금 정보를 만들 수 없습니다.`);
        const scopePayments = ids.map((id) => paymentByReservationId.get(id));
        if (
          scopePayments.some(
            (payment) =>
              !payment ||
              payment.status !== 'completed' ||
              payment.verified_by !== sentBy ||
              !payment.verified_at,
          )
        ) {
          throw new Error(`${scope} 범위에 캠퍼스 회계 순장님이 확인하지 않은 입금이 있습니다. 4단계를 먼저 실행하세요.`);
        }
        return {
          district_id: reservation.district_id,
          district: reservation.district,
          team_id: reservation.team_id,
          team: reservation.team,
          campus_id: reservation.campus_id,
          campus: reservation.campus,
          total_people: ids.length,
          paid_people: ids.length,
          total_amount: scopePayments.reduce(
            (sum, payment) => sum + Number(payment?.amount ?? 0),
            0,
          ),
          status: 'confirmed',
          sent_by: sentBy,
          sent_at: now,
          confirmed_by: user.id,
          confirmed_at: now,
          actual_confirmed_amount: scopePayments.reduce(
            (sum, payment) => sum + Number(payment?.amount ?? 0),
            0,
          ),
          updated_at: now,
        };
      });
      throwIfError(
        (
          await serviceClient.from('app_settings').upsert(
            {
              key: 'first_reservation_deadline',
              value: { deadline_at: new Date(Date.now() - 60_000).toISOString() },
            },
            { onConflict: 'key' },
          )
        ).error,
        '예약 마감 실패',
      );
      throwIfError(
        (
          await serviceClient
            .from('campus_transfers')
            .upsert(transferRows, { onConflict: 'district,team,campus' })
        ).error,
        '캠퍼스 송금 보고 생성 실패',
      );

      const summary = {
        deadline_closed: true,
        completed_payments: payments.length,
        verified_payments: payments.length,
        sent_transfers: transferRows.length,
        confirmed_transfers: transferRows.length,
        sent_total_amount: transferRows.reduce(
          (sum, transfer) => sum + transfer.total_amount,
          0,
        ),
      };
      await serviceClient
        .from('simulation_stage_runs')
        .update({
          status: 'completed',
          summary,
          completed_at: now,
        })
        .eq('id', run.id);

      return json({
        run_id: run.id,
        stage,
        status: 'completed',
        summary,
        next_offset: null,
        done: true,
      });
    }

    if (stage === 'boarding') {
      const users = await getSimulationUsers(serviceClient);
      const simulationUserIds = new Set(users.map((simulationUser) => simulationUser.userId));
      const [
        { data: allocation, error: allocationError },
        { data: ticketedReservations, error: reservationError },
      ] = await Promise.all([
        serviceClient
          .from('bus_allocations')
          .select('id,allocation_data')
          .filter('allocation_data->>status', 'eq', 'confirmed')
          .maybeSingle(),
        serviceClient
          .from('reservations')
          .select('id,user_id,boarding_status,confirmed_ticket')
          .eq('status', 'confirmed')
          .not('confirmed_ticket', 'is', null)
          .order('id'),
      ]);
      if (allocationError) throw allocationError;
      if (reservationError) throw reservationError;
      if (!allocation) {
        throw new Error('확정된 배차안이 없습니다. 배차 단계에서 전체 배차를 먼저 확정하세요.');
      }

      const reservations = (ticketedReservations ?? []).filter((reservation) =>
        simulationUserIds.has(reservation.user_id)
      );
      const nonSimulationReservations = (ticketedReservations ?? []).filter(
        (reservation) => !simulationUserIds.has(reservation.user_id),
      );
      if (nonSimulationReservations.length > 0) {
        throw new Error(
          `확정 버스표가 있는 실제 사용자 ${nonSimulationReservations.length}명이 있어 탑승 리허설을 실행할 수 없습니다.`,
        );
      }
      if (reservations.length === 0) {
        throw new Error('탑승 리허설 대상 확정 버스표가 없습니다.');
      }

      const allocationData = getSettingObject(allocation.allocation_data);
      const buses = Array.isArray(allocationData.buses)
        ? allocationData.buses.filter(
            (bus): bus is Record<string, unknown> =>
              Boolean(bus && typeof bus === 'object' && !Array.isArray(bus)),
          )
        : [];
      if (buses.length === 0) {
        throw new Error('확정 배차안에 호차 정보가 없습니다.');
      }

      const now = new Date().toISOString();
      const reservationIds = reservations.map((reservation) => reservation.id);
      for (const reservationIdChunk of chunks(reservationIds)) {
        throwIfError(
          (
            await serviceClient
              .from('reservations')
              .update({
                boarding_status: 'unchecked',
                boarding_confirmed_at: null,
                boarding_status_updated_at: null,
                boarding_status_updated_by: null,
                boarding_no_show_departure_id: null,
              })
              .in('id', reservationIdChunk)
          ).error,
          '기존 탑승 상태 초기화 실패',
        );
        throwIfError(
          (
            await serviceClient
              .from('boarding_status_events')
              .delete()
              .in('reservation_id', reservationIdChunk)
          ).error,
          '기존 탑승 이벤트 정리 실패',
        );
      }
      throwIfError(
        (
          await serviceClient
            .from('boarding_bus_departures')
            .delete()
            .eq('allocation_id', allocation.id)
        ).error,
        '기존 호차 출발 기록 정리 실패',
      );

      const departureRows = buses.map((bus, index) => ({
        allocation_id: allocation.id,
        bus_id: String(bus.id ?? `simulation-bus-${index + 1}`),
        bus_label: String(bus.label ?? bus.busNumber ?? `${index + 1}호차`),
        departed_at: now,
        departed_by: user.id,
      }));
      const { data: departures, error: departureError } = await serviceClient
        .from('boarding_bus_departures')
        .insert(departureRows)
        .select('id,bus_id,bus_label');
      if (departureError) throw new Error(`호차 출발 기록 생성 실패: ${departureError.message}`);

      const departureByBusKey = new Map<string, string>();
      for (const departure of departures ?? []) {
        departureByBusKey.set(String(departure.bus_id), departure.id);
        departureByBusKey.set(String(departure.bus_label), departure.id);
      }

      const boardedIds: string[] = [];
      const uncheckedIds: string[] = [];
      const noShowIdsByDeparture = new Map<string, string[]>();
      for (const reservation of reservations) {
        const outcome = deterministicUnit(`${reservation.user_id}:boarding-outcome`);
        if (outcome < 0.82) {
          boardedIds.push(reservation.id);
          continue;
        }
        if (outcome >= 0.94) {
          uncheckedIds.push(reservation.id);
          continue;
        }
        const ticket = getSettingObject(reservation.confirmed_ticket);
        const departureId = departureByBusKey.get(
          String(ticket.busId ?? ticket.busNumber ?? ''),
        );
        if (!departureId) {
          throw new Error('확정 버스표와 일치하는 호차 출발 기록을 찾지 못했습니다.');
        }
        noShowIdsByDeparture.set(departureId, [
          ...(noShowIdsByDeparture.get(departureId) ?? []),
          reservation.id,
        ]);
      }

      for (const boardedIdChunk of chunks(boardedIds)) {
        throwIfError(
          (
            await serviceClient
              .from('reservations')
              .update({
                boarding_status: 'boarded',
                boarding_confirmed_at: now,
                boarding_status_updated_at: now,
                boarding_status_updated_by: user.id,
                boarding_no_show_departure_id: null,
              })
              .in('id', boardedIdChunk)
          ).error,
          '탑승 완료 상태 반영 실패',
        );
      }
      for (const [departureId, noShowIds] of noShowIdsByDeparture) {
        for (const noShowIdChunk of chunks(noShowIds)) {
          throwIfError(
            (
              await serviceClient
                .from('reservations')
                .update({
                  boarding_status: 'no_show',
                  boarding_confirmed_at: null,
                  boarding_status_updated_at: now,
                  boarding_status_updated_by: user.id,
                  boarding_no_show_departure_id: departureId,
                })
                .in('id', noShowIdChunk)
            ).error,
            '노쇼 상태 반영 실패',
          );
        }
      }

      const noShowIds = [...noShowIdsByDeparture.values()].flat();
      const eventRows = [
        ...boardedIds.map((reservationId) => ({
          reservation_id: reservationId,
          from_status: 'unchecked',
          to_status: 'boarded',
          actor_id: user.id,
          note: '시뮬레이션 탑승 완료',
          created_at: now,
        })),
        ...noShowIds.map((reservationId) => ({
          reservation_id: reservationId,
          from_status: 'unchecked',
          to_status: 'no_show',
          actor_id: user.id,
          note: '시뮬레이션 호차 출발 후 노쇼',
          created_at: now,
        })),
      ];
      for (const eventRowChunk of chunks(eventRows)) {
        throwIfError(
          (await serviceClient.from('boarding_status_events').insert(eventRowChunk)).error,
          '탑승 이벤트 생성 실패',
        );
      }

      const summary = {
        confirmed_ticket_count: reservations.length,
        departed_buses: departureRows.length,
        boarded: boardedIds.length,
        no_show: noShowIds.length,
        unchecked: uncheckedIds.length,
        boarding_events: eventRows.length,
      };
      await serviceClient
        .from('simulation_stage_runs')
        .update({
          status: 'completed',
          summary,
          completed_at: now,
        })
        .eq('id', run.id);

      return json({
        run_id: run.id,
        stage,
        status: 'completed',
        summary,
        next_offset: null,
        done: true,
      });
    }

    if (referenceConfig.applyRecommendedSeed) {
      const now = new Date().toISOString();
      const { data: district, error: districtError } = await serviceClient
        .from('districts')
        .upsert(
          { name: '서울지구', sort_order: 10, is_active: true, updated_at: now },
          { onConflict: 'name' },
        )
        .select('id')
        .single();
      throwIfError(districtError, '권장 서울지구 등록 실패');
      if (!district) throw new Error('등록한 서울지구 정보를 찾지 못했습니다.');

      for (const [teamIndex, teamSeed] of RECOMMENDED_SEOUL_ORGANIZATION.entries()) {
        const { data: team, error: teamError } = await serviceClient
          .from('teams')
          .upsert(
            {
              district_id: district.id,
              name: teamSeed.name,
              sort_order: (teamIndex + 1) * 10,
              is_active: true,
              updated_at: now,
            },
            { onConflict: 'district_id,name' },
          )
          .select('id')
          .single();
        throwIfError(teamError, `권장 서울지구 ${teamSeed.name} 등록 실패`);
        if (!team) throw new Error(`등록한 ${teamSeed.name} 정보를 찾지 못했습니다.`);

        throwIfError(
          (
            await serviceClient.from('campuses').upsert(
              teamSeed.campuses.map((campus, campusIndex) => ({
                team_id: team.id,
                name: campus,
                sort_order: (campusIndex + 1) * 10,
                is_active: true,
                updated_at: now,
              })),
              { onConflict: 'team_id,name' },
            )
          ).error,
          `권장 서울지구 ${teamSeed.name} 캠퍼스 등록 실패`,
        );
      }

      throwIfError(
        (
          await serviceClient.from('stations').upsert(
            RECOMMENDED_STATIONS.map((station, index) => ({
              ...station,
              sort_order: (index + 1) * 10,
              is_active: true,
              updated_at: now,
            })),
            { onConflict: 'name' },
          )
        ).error,
        '권장 행선지 등록 실패',
      );
    }

    const [campusResult, stationResult, simulationUserResult] = await Promise.all([
      serviceClient
        .from('campus_options')
        .select('district_id,district,team_id,team,campus_id,campus')
        .order('district_sort_order')
        .order('team_sort_order')
        .order('campus_sort_order'),
      serviceClient
        .from('stations')
        .select('id,name,sort_order')
        .eq('is_active', true)
        .order('sort_order')
        .order('name'),
      serviceClient
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .like('email', 'sim-%@ccc-bus.test'),
    ]);
    const firstError =
      campusResult.error ?? stationResult.error ?? simulationUserResult.error;
    if (firstError) throw firstError;
    if (!campusResult.data?.length) {
      throw new Error('운영 초기값 설정에 필요한 활성 캠퍼스가 없습니다. 초기 DB 설치를 먼저 완료하세요.');
    }
    if (!stationResult.data?.length) {
      throw new Error('운영 초기값 설정에 필요한 활성 승선지가 없습니다. 초기 DB 설치를 먼저 완료하세요.');
    }

    const selectedCampusIdSet = new Set(referenceConfig.selectedCampusIds);
    const selectedStationIdSet = new Set(referenceConfig.selectedStationIds);
    const selectedCampuses = selectedCampusIdSet.size > 0
      ? campusResult.data.filter((campus) => selectedCampusIdSet.has(campus.campus_id))
      : campusResult.data.slice(0, referenceConfig.campusCount);
    const selectedStations = selectedStationIdSet.size > 0
      ? stationResult.data.filter((station) => selectedStationIdSet.has(station.id))
      : stationResult.data.slice(0, referenceConfig.stationCount);
    if (!selectedCampuses.length) {
      throw new Error('사용할 캠퍼스를 하나 이상 선택하세요.');
    }
    if (!selectedStations.length) {
      throw new Error('사용할 행선지를 하나 이상 선택하세요.');
    }
    const participationRows = selectedCampuses.map((campus) => {
      const key = getCampusKey(campus);
      return { rowId: key, key, ...campus };
    });
    const targetCounts = new Map(participationRows.map((row) => [row.key, 0]));
    for (const campus of buildCampusAssignments(
      selectedCampuses,
      referenceConfig.participationTarget,
      {},
    )) {
      const key = getCampusKey(campus);
      targetCounts.set(key, (targetCounts.get(key) ?? 0) + 1);
    }
    const participationTargets = Object.fromEntries(targetCounts);
    const participationTarget = Object.values(participationTargets).reduce(
      (sum, value) => sum + value,
      0,
    );
    throwIfError(
      (await serviceClient.from('bus_options').delete().like('notes', 'SIM-%')).error,
      '기존 SIM 버스 옵션 정리 실패',
    );
    throwIfError(
      (
        await serviceClient.from('bus_options').insert(
          referenceConfig.busOptions.map((option, index) => ({
            capacity: option.capacity,
            estimated_price: option.estimatedPrice,
            notes: `SIM-option-${index + 1}`,
          })),
        )
      ).error,
      'SIM 버스 옵션 생성 실패',
    );
    const reservationDeadlineAt = new Date(
      Date.now() + referenceConfig.reservationDeadlineDays * 86_400_000,
    ).toISOString();
    throwIfError(
      (
        await serviceClient.from('app_settings').upsert(
          [
            {
              key: 'bus_ticket_price',
              value: { price: referenceConfig.busTicketPrice },
            },
            {
              key: 'seoul_district_transfer_account',
              value: { account_number: RECOMMENDED_TRANSFER_ACCOUNT },
            },
            {
              key: 'first_reservation_deadline',
              value: { deadline_at: reservationDeadlineAt },
            },
            {
              key: 'participation_targets',
              value: { rows: participationRows, targets: participationTargets },
            },
            {
              key: 'simulation_reference_scope',
              value: {
                campus_ids: selectedCampuses.map((campus) => campus.campus_id),
                station_ids: selectedStations.map((station) => station.id),
                campus_count: selectedCampuses.length,
                station_count: selectedStations.length,
              },
            },
            { key: 'global_scenario_checklist', value: { checked_step_ids: [] } },
          ],
          { onConflict: 'key' },
        )
      ).error,
      '시뮬레이션 앱 설정 생성 실패',
    );

    const summary = {
      project_id: currentProjectId,
      campus_count: selectedCampuses.length,
      campus_ids: selectedCampuses.map((campus) => campus.campus_id),
      campus_labels: selectedCampuses.map(
        (campus) => `${campus.district} · ${campus.team} · ${campus.campus}`,
      ),
      available_campus_count: campusResult.data.length,
      active_station_count: selectedStations.length,
      station_ids: selectedStations.map((station) => station.id),
      station_names: selectedStations.map((station) => station.name),
      available_station_count: stationResult.data.length,
      bus_option_count: referenceConfig.busOptions.length,
      participation_target: participationTarget,
      existing_simulation_profile_count: simulationUserResult.count ?? 0,
      bus_ticket_price: referenceConfig.busTicketPrice,
      district_transfer_account: RECOMMENDED_TRANSFER_ACCOUNT,
      reservation_deadline_days: referenceConfig.reservationDeadlineDays,
      reservation_deadline_at: reservationDeadlineAt,
      bus_options: referenceConfig.busOptions,
      recommended_seed_applied: referenceConfig.applyRecommendedSeed,
      created: true,
      checked_at: new Date().toISOString(),
    };

    await serviceClient
      .from('simulation_stage_runs')
      .update({
        status: 'completed',
        summary,
        completed_at: new Date().toISOString(),
      })
      .eq('id', run.id);

    return json({ run_id: run.id, stage, status: 'completed', summary });
  } catch (error) {
    const message = getErrorMessage(error);
    await serviceClient
      .from('simulation_stage_runs')
      .update({
        status: 'failed',
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', run.id);
    return json({ error: message, run_id: run.id }, 500);
  }
});
