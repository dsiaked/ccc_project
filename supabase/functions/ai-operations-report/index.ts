import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const GEMINI_REQUEST_TIMEOUT_MS = 30_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const projectContext = {
  purpose:
    'CCC 행사 버스 예약, 입금 확인, 배차 최적화, 잔여 좌석 판매, 탑승 관리를 위한 운영 시스템',
  architecture: [
    'React 19 + TypeScript + Vite 단일 페이지 애플리케이션',
    'Supabase Auth, PostgreSQL, RLS, RPC, Edge Functions',
    'Firebase Hosting 정적 배포',
    'Python 기반 exact allocation optimizer와 Supabase 작업 큐',
  ],
  majorAreas: {
    public:
      '로그인/가입, 예약 신청, 티켓 조회, 잔여 좌석 신청',
    admin:
      '전체 관리자, 캠퍼스 관리자, 탑승 관리자 역할별 운영 화면',
    operations:
      '신청 마감, 입금 검토, 배차 계산/확정, 탑승 체크인, 예외 처리',
    backend:
      'supabase/migrations의 DB 정책과 RPC, supabase/functions의 서버 작업',
  },
  codeMap: [
    'src/pages: 사용자 및 관리자 화면',
    'src/lib: Supabase 데이터 접근 서비스',
    'src/routes: 공개/관리자 라우팅과 권한 경계',
    'src/components: 인증 및 공통 UI',
    'supabase/migrations: 스키마, RLS, 감사 로그, 원자적 RPC',
    'supabase/functions: 관리자 계정, 시뮬레이션, 최적화, 외부 연동',
    'optimizer: 배차 최적화 워커',
    'tests: Node 기반 회귀 및 안전성 테스트',
  ],
  reviewRules: [
    '운영 데이터의 이상 징후와 반복 실패를 우선한다.',
    '제안은 관련 코드 영역과 예상 효과를 함께 적는다.',
    '로그만으로 단정할 수 없는 내용은 가설로 표시한다.',
    '개인 식별을 시도하지 않는다.',
  ],
};

const increment = (record: Record<string, number>, key: string) => {
  record[key || 'unknown'] = (record[key || 'unknown'] ?? 0) + 1;
};

const aggregateLogs = (
  activityRows: Array<Record<string, unknown>>,
  auditRows: Array<Record<string, unknown>>,
) => {
  const activityByActorKind: Record<string, number> = {};
  const activityByCategory: Record<string, number> = {};
  const activityByEvent: Record<string, number> = {};
  const activityByRoute: Record<string, number> = {};
  const adminAuditByAction: Record<string, number> = {};
  const adminAuditByResource: Record<string, number> = {};
  const uniqueActors = new Set<string>();

  for (const row of activityRows) {
    increment(activityByActorKind, String(row.actor_kind ?? 'unknown'));
    increment(activityByCategory, String(row.category ?? 'unknown'));
    increment(activityByEvent, String(row.event_name ?? 'unknown'));
    if (row.route) increment(activityByRoute, String(row.route));
    if (row.actor_id) uniqueActors.add(String(row.actor_id));
  }

  for (const row of auditRows) {
    increment(adminAuditByAction, String(row.action ?? 'unknown'));
    increment(adminAuditByResource, String(row.resource_type ?? 'unknown'));
  }

  const top = (record: Record<string, number>, limit = 30) =>
    Object.fromEntries(
      Object.entries(record)
        .sort((left, right) => right[1] - left[1])
        .slice(0, limit),
    );

  return {
    activityEventCount: activityRows.length,
    adminAuditCount: auditRows.length,
    uniqueAuthenticatedActors: uniqueActors.size,
    activityByActorKind,
    activityByCategory,
    topActivityEvents: top(activityByEvent),
    topRoutes: top(activityByRoute),
    adminAuditByAction,
    adminAuditByResource,
    notes: [
      '모든 통계는 개인 식별정보와 원본 변경 데이터를 제외한 집계값입니다.',
      '조회 상한 때문에 매우 많은 이벤트가 발생한 기간은 최근 로그 일부만 반영될 수 있습니다.',
    ],
  };
};

const readGeminiOutputText = (body: Record<string, unknown>) => {
  const candidates = Array.isArray(body.candidates) ? body.candidates : [];
  const texts: string[] = [];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const content = (candidate as { content?: unknown }).content;
    if (!content || typeof content !== 'object') continue;
    const parts = Array.isArray((content as { parts?: unknown }).parts)
      ? (content as { parts: unknown[] }).parts
      : [];

    for (const part of parts) {
      if (
        part &&
        typeof part === 'object' &&
        typeof (part as { text?: unknown }).text === 'string'
      ) {
        texts.push((part as { text: string }).text);
      }
    }
  }

  return texts.join('\n').trim();
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
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY') ?? '';
  const model = Deno.env.get('AI_REPORT_MODEL') ?? 'gemini-2.5-flash';
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
  } = await userClient.auth.getUser();

  if (!actor) return json({ error: '로그인이 필요합니다.' }, 401);

  const { count: globalAdminCount } = await serviceClient
    .from('admin_roles')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', actor.id)
    .eq('role', 'global_admin');

  if (!globalAdminCount) {
    return json({ error: '전체 관리자만 운영 보고서를 생성할 수 있습니다.' }, 403);
  }

  const body = await request.json().catch(() => ({}));
  const periodStart = new Date(String(body?.periodStart ?? ''));
  const periodEnd = new Date(String(body?.periodEnd ?? ''));

  if (
    Number.isNaN(periodStart.getTime()) ||
    Number.isNaN(periodEnd.getTime()) ||
    periodStart >= periodEnd
  ) {
    return json({ error: '분석 기간이 올바르지 않습니다.' }, 400);
  }
  if (periodEnd.getTime() - periodStart.getTime() > 1000 * 60 * 60 * 24 * 93) {
    return json({ error: '한 번에 최대 93일까지 분석할 수 있습니다.' }, 400);
  }

  const { data: report, error: createError } = await serviceClient
    .from('ai_operations_reports')
    .insert({
      requested_by: actor.id,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      anonymized: true,
    })
    .select('id')
    .single();

  if (createError || !report) {
    return json({ error: createError?.message || '보고서 기록을 만들지 못했습니다.' }, 500);
  }

  let summary: Record<string, unknown> = {};

  try {
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY 서버 비밀값이 설정되지 않았습니다.');
    }

    const start = periodStart.toISOString();
    const end = periodEnd.toISOString();
    const [{ data: activityRows, error: activityError }, { data: auditRows, error: auditError }] =
      await Promise.all([
        serviceClient
          .from('activity_event_logs')
          .select('actor_id, actor_kind, event_name, category, route, occurred_at')
          .gte('occurred_at', start)
          .lte('occurred_at', end)
          .order('occurred_at', { ascending: false })
          .limit(5000),
        serviceClient
          .from('admin_action_audit_logs')
          .select('action, resource_type, created_at')
          .gte('created_at', start)
          .lte('created_at', end)
          .order('created_at', { ascending: false })
          .limit(5000),
      ]);

    if (activityError) throw activityError;
    if (auditError) throw auditError;

    summary = aggregateLogs(activityRows ?? [], auditRows ?? []);
    const prompt = JSON.stringify({
      task:
        '운영 현황을 평가하고 이상 징후, 운영 개선, 코드 수정 제안, 우선순위별 실행 계획을 작성한다.',
      requiredSections: [
        '요약',
        '운영 현황과 주요 지표',
        '이상 징후 및 위험',
        '운영 프로세스 개선 제안',
        '코드 수정 및 구조 개선 제안',
        '우선순위별 실행 계획',
        '분석 한계',
      ],
      period: { start, end },
      projectContext,
      anonymizedLogSummary: summary,
    });
    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
      method: 'POST',
      signal: AbortSignal.timeout(GEMINI_REQUEST_TIMEOUT_MS),
      headers: {
        'x-goog-api-key': geminiApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{
            text:
              '당신은 운영 데이터와 코드 구조를 함께 검토하는 시니어 소프트웨어 운영 감사자입니다. 한국어 Markdown으로 간결하지만 실행 가능한 최종보고서를 작성하세요.',
          }],
        },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 8192 },
      }),
    });
    const aiBody = await aiResponse.json().catch(() => ({})) as Record<string, unknown>;
    const reportMarkdown = readGeminiOutputText(aiBody);

    if (!aiResponse.ok || !reportMarkdown) {
      const message =
        typeof aiBody.error === 'object' && aiBody.error
          ? String((aiBody.error as { message?: unknown }).message ?? 'Gemini 요청 실패')
          : 'Gemini가 보고서 본문을 반환하지 않았습니다.';
      throw new Error(message);
    }

    const { error: updateError } = await serviceClient
      .from('ai_operations_reports')
      .update({
        status: 'completed',
        input_summary: summary,
        report_markdown: reportMarkdown,
        model,
        completed_at: new Date().toISOString(),
      })
      .eq('id', report.id);

    if (updateError) throw updateError;

    return json({ reportId: report.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to generate an AI operations report:', error);
    await serviceClient
      .from('ai_operations_reports')
      .update({
        status: 'failed',
        input_summary: summary,
        model,
        error_message: message.slice(0, 2000),
        completed_at: new Date().toISOString(),
      })
      .eq('id', report.id);
    return json(
      { error: 'AI 운영 보고서를 생성하지 못했습니다.', reportId: report.id },
      500,
    );
  }
});
