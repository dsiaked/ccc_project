/**
 * CCC Bus 시뮬레이션 실행기
 *
 * 사전 준비:
 *   1. 운영 프로젝트와 분리된 Supabase 테스트 프로젝트를 사용합니다.
 *   2. 테스트 프로젝트에 supabase/migrations를 적용합니다.
 *   3. .env에 SUPABASE_SERVICE_ROLE_KEY를 추가합니다.
 *   4. PowerShell에서는 npm 대신 npm.cmd를 사용합니다.
 *
 * 기본 실행 흐름:
 *   아래 두 명령을 순서대로 실행하면 초기 데이터 생성부터 정산까지 진행됩니다.
 *
 *   npm.cmd run simulation -- seed
 *     - 기존 시뮬레이션 계정과 연결 데이터를 정리합니다.
 *     - 조직 구조, 행선지 정류장, 버스 옵션, 기본 앱 설정을 생성합니다.
 *     - CMD에서 입력한 이메일과 비밀번호로 전체 관리자 계정을 생성하거나 갱신합니다.
 *     - 일반 사용자와 캠퍼스 회계 순장님 Auth 계정을 생성합니다.
 *     - 프로필, 관리자 권한, 예약, 초기 입금 데이터를 생성하고 검증합니다.
 *     - 전체 관리자 비밀번호는 입력 중 *로 표시됩니다.
 *
 *   npm.cmd run simulation -- settle
 *     - 예약을 마감합니다.
 *     - 캠퍼스 입금 확인, 캠퍼스 송금 보고, 본부 입금 확인을 처리합니다.
 *     - 최종 정산 상태를 검증합니다.
 *
 * 전체 과정을 한 번에 실행:
 *   npm.cmd run simulation -- all
 *     - seed 실행 후 settle을 이어서 실행합니다.
 *
 * Seed 세부 단계:
 *   필요한 단계만 확인하거나 실패한 단계부터 다시 실행할 때 사용합니다.
 *
 *   npm.cmd run simulation -- cleanup:simulation
 *     - sim-*@ccc-bus.test 계정과 연결된 시뮬레이션 데이터를 삭제합니다.
 *
 *   npm.cmd run simulation -- seed:reference
 *     - 서울지구 7팀, 47캠퍼스, 행선지 40개와 버스 옵션을 생성합니다.
 *     - 캠퍼스별 예상 참여인원을 설정하며 전체 합계는 2,000명입니다.
 *
 *   npm.cmd run simulation -- seed:global-admin
 *     - CMD에서 전체 관리자 ID(이메일)와 비밀번호를 입력받습니다.
 *     - 계정이 없으면 생성하고, 계정이 있으면 입력한 비밀번호로 갱신합니다.
 *     - profiles 행과 global_admin 권한을 등록하거나 갱신합니다.
 *
 *   npm.cmd run simulation -- seed:accounts
 *     - 일반 사용자와 모든 캠퍼스별 관리자 Auth 계정을 생성합니다.
 *     - 기존 시뮬레이션 Auth 계정이 있으면 중단됩니다.
 *     - 시뮬레이션 Auth 사용자의 profiles 행을 생성합니다.
 *     - 모든 캠퍼스마다 정확히 한 명에게 campus_admin 권한을 등록합니다.
 *
 *   npm.cmd run simulation -- seed:reservations
 *     - 캠퍼스별 인기 행선지에 편향된 다양한 예약을 생성합니다.
 *     - 매 10번째 시뮬레이션 계정은 미신청자로 남깁니다.
 *     - 모든 사용자가 서로 다른 1지망과 2지망 행선지를 선택합니다.
 *     - 신청 시각은 최근 하루 사이에 불규칙하게 분산합니다.
 *     - 관리자에 의한 신청 취소 없이 모든 예약을 requested 상태로 생성합니다.
 *
 *   npm.cmd run simulation -- seed:payments
 *     - 요청 상태 예약에 초기 payments 행을 생성합니다.
 *     - 일반 사용자는 완료 95%, 대기 5% 비율을 사용합니다.
 *     - 캠퍼스 회계 순장님의 입금 상태는 완료로 생성합니다.
 *
 *   npm.cmd run simulation -- seed:verify
 *     - Auth 사용자, 프로필, 관리자 권한, 신청, 입금 개수를 검증합니다.
 *
 * 전체 관리자 보존 DB 정리:
 *   테스트 프로젝트에서 전체 관리자만 남기고 기준정보부터 다시 생성할 때 사용합니다.
 *
 *   $env:SIMULATION_FULL_CLEANUP_CONFIRM="DELETE_ALL_TEST_DATA"
 *   npm.cmd run simulation -- cleanup
 *     - 운영 데이터, 전체 관리자가 아닌 Auth 사용자, 행선지, 버스 옵션, 조직 구조, 앱 설정을 삭제합니다.
 *     - 전체 관리자 Auth 계정, 프로필, global_admin 권한만 보존합니다.
 *     - 캠퍼스 회계 순장님 Auth 계정, 프로필, campus_admin 권한은 모두 삭제합니다.
 *     - 조직 삭제를 위해 보존된 전체 관리자의 지구·팀·캠퍼스 범위는 초기화합니다.
 *     - 현재 DB에 없는 선택 테이블은 건너뛰고 나머지 삭제를 계속합니다.
 *     - 삭제 후 npm.cmd run simulation -- seed:reference 또는 seed를 실행해 복구합니다.
 *
 * Settlement 세부 단계:
 *   정산 흐름을 단계별로 확인하거나 실패한 단계부터 다시 실행할 때 사용합니다.
 *
 *   npm.cmd run simulation -- close
 *     - 첫 예약 마감 시간을 현재 시각보다 1분 전으로 설정합니다.
 *
 *   npm.cmd run simulation -- settle:payments
 *     - 요청 상태 신청의 입금을 완료 상태로 변경합니다.
 *     - 해당 캠퍼스 회계 순장님을 입금 확인자로 기록합니다.
 *
 *   npm.cmd run simulation -- settle:reports
 *     - 미완료 개인 입금을 먼저 캠퍼스 회계 순장님 확인 완료 상태로 변경합니다.
 *     - 캠퍼스별 개인 입금 내역을 합산합니다.
 *     - 각 캠퍼스 회계 순장님이 전체 관리자에게 송금 보고한 sent 상태를 생성합니다.
 *     - 활성 상태의 실제 사용자 예약이 있으면 안전을 위해 중단됩니다.
 *     - 기존 settle:transfers 명령도 같은 단계의 호환용 별칭으로 사용할 수 있습니다.
 *
 *   npm.cmd run simulation -- settle:confirm
 *     - 전체 관리자가 캠퍼스 송금 보고 금액을 확인한 상태로 변경합니다.
 *     - 별도 실행 시 SIMULATION_GLOBAL_ADMIN_EMAIL의 계정을 사용합니다.
 *     - 환경변수가 없으면 기본 전체 관리자 이메일 admin@gmail.com을 사용합니다.
 *
 *   npm.cmd run simulation -- settle:verify
 *     - 예약 마감, 입금 확인, 캠퍼스 송금, 본부 확인 상태를 검증합니다.
 *
 * 소규모 Seed 테스트:
 *   $env:SIMULATION_USER_COUNT=20
 *   npm.cmd run simulation -- seed
 *
 * 환경변수:
 *   SIMULATION_USER_COUNT
 *     - 생성할 일반 사용자 수입니다. 기본값은 2000, 허용 범위는 1~5000입니다.
 *
 *   SIMULATION_PASSWORD
 *     - 생성 계정의 공통 비밀번호입니다. 기본값은 Simulation123!입니다.
 *
 *   SIMULATION_GLOBAL_ADMIN_EMAIL
 *     - seed:global-admin과 본부 입금 확인에 사용할 전체 관리자 이메일입니다.
 *     - 설정하면 CMD에서 이메일 입력을 생략합니다.
 *     - settle:confirm 별도 실행 시 기본값은 admin@gmail.com입니다.
 *
 *   SIMULATION_GLOBAL_ADMIN_PASSWORD
 *     - seed:global-admin에서 생성하거나 갱신할 전체 관리자 비밀번호입니다.
 *     - 설정하면 CMD에서 비밀번호 입력을 생략합니다.
 *
 *   SIMULATION_FULL_CLEANUP_CONFIRM
 *     - 전체 cleanup 실행 확인값입니다.
 *     - 전체 삭제 시에만 DELETE_ALL_TEST_DATA로 설정합니다.
 *
 * 주의:
 *   - seed는 cleanup:simulation을 실행하며 실제 사용자 데이터는 삭제하지 않습니다.
 *   - seed와 seed:global-admin은 환경변수가 없으면 CMD에서 전체 관리자 정보를 입력받습니다.
 *   - CI 등 비대화형 환경에서는 전체 관리자 이메일과 비밀번호 환경변수를 모두 설정하세요.
 *   - cleanup은 확인 환경변수가 있어야 실행되는 전체 삭제 명령입니다.
 *   - all은 seed와 settle을 연속 실행합니다.
 *   - SUPABASE_SERVICE_ROLE_KEY는 절대 VITE_ 접두사를 붙이거나 커밋하지 마세요.
 *   - 반드시 운영 프로젝트가 아닌 테스트 프로젝트에서 실행하세요.
 */
import { createClient } from '@supabase/supabase-js';
import { createInterface, emitKeypressEvents } from 'node:readline';

const SIM_SUFFIX = '@ccc-bus.test';
const USER_PREFIX = 'sim-user-';
const ADMIN_PREFIX = 'sim-admin-campus-';
const DEFAULT_PASSWORD = 'Simulation123!';
const DEFAULT_USER_COUNT = 2000;
const DEFAULT_GLOBAL_ADMIN_EMAIL = 'admin@gmail.com';
const CONCURRENCY = 10;
const CHUNK_SIZE = 200;
const PAGE_SIZE = 1000;
const FULL_CLEANUP_CONFIRMATION = 'DELETE_ALL_TEST_DATA';

function getSupabaseProjectId() {
  const rawUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!rawUrl) {
    throw new Error('VITE_SUPABASE_URL or SUPABASE_URL is required.');
  }

  const url = new URL(rawUrl);
  const match = url.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
  if (url.protocol !== 'https:' || !match) {
    throw new Error('Supabase URL must use https://<project-id>.supabase.co.');
  }

  return match[1];
}

function assertFullCleanupProjectAllowed() {
  const currentProjectId = getSupabaseProjectId();
  const allowedProjectId = String(
    process.env.VITE_SIMULATION_PROJECT_ID ?? '',
  ).trim();
  const productionProjectId = String(
    process.env.SIMULATION_PRODUCTION_PROJECT_ID ?? '',
  ).trim();

  if (!allowedProjectId || !productionProjectId) {
    throw new Error(
      'Full cleanup is disabled until VITE_SIMULATION_PROJECT_ID and ' +
        'SIMULATION_PRODUCTION_PROJECT_ID are both configured.',
    );
  }
  if (allowedProjectId === productionProjectId) {
    throw new Error(
      'Full cleanup is disabled because the simulation and production project IDs match.',
    );
  }
  if (currentProjectId === productionProjectId) {
    throw new Error('Full cleanup is permanently blocked for the production project.');
  }
  if (currentProjectId !== allowedProjectId) {
    throw new Error(
      `Full cleanup is allowed only for the configured simulation project (${allowedProjectId}).`,
    );
  }
}

const REFERENCE_ORGANIZATION = [
  {
    name: '서울지구',
    sort_order: 10,
    teams: [
      {
        name: '동팀',
        sort_order: 10,
        campuses: [
          '서일대학교', '세종대학교', '한양대학교', '한양여자대학교',
          '건국대학교', '한국체육대학교', '장로회신학대학교',
        ],
      },
      {
        name: '서팀',
        sort_order: 20,
        campuses: [
          '명지전문대학', '명지대학교', '서강대학교', '연세대학교',
          '경기대학교', '농협대학교', '이화여자대학교', '중부대학교',
          '추계예술대학교', '한국항공대학교', '홍익대학교',
        ],
      },
      {
        name: '남팀',
        sort_order: 30,
        campuses: [
          '서울대학교', '숭실대학교', '서울교육대학교', '중앙대학교',
          '백석예술대학교', '동양미래대학교', '강서대학교', '총신대학교',
        ],
      },
      {
        name: '북팀',
        sort_order: 40,
        campuses: [
          '고려대학교', '동덕여자대학교', '서경대학교', '성신여자대학교',
          '국민대학교',
        ],
      },
      {
        name: '중앙팀',
        sort_order: 50,
        campuses: ['숙명여자대학교', '동국대학교', '상명대학교', '숭의여자대학교'],
      },
      {
        name: '북동팀',
        sort_order: 60,
        campuses: [
          '광운대학교', '서울과학기술대학교', '서울여자대학교', '인덕대학교',
          '한국성서대학교', '경희대학교', '한국외국어대학교', '서울시립대학교',
        ],
      },
      {
        name: '북중앙팀',
        sort_order: 70,
        campuses: ['덕성여자대학교', '배화여자대학교', '성균관대학교', '한성대학교'],
      },
    ],
  },
];

const REFERENCE_STATIONS = [
  ['서울역', '1호선 / 4호선 / 경의중앙선 / 공항철도', '서울 용산구 한강대로 405', 37.5547, 126.9706],
  ['용산역', '1호선 / 경의중앙선', '서울 용산구 한강대로23길 55', 37.5299, 126.9648],
  ['영등포역', '1호선', '서울 영등포구 경인로 846', 37.5157, 126.9074],
  ['신도림역', '1호선 / 2호선', '서울 구로구 새말로 117-21', 37.5088, 126.8913],
  ['홍대입구역', '2호선 / 경의중앙선 / 공항철도', '서울 마포구 양화로 160', 37.5572, 126.9254],
  ['합정역', '2호선 / 6호선', '서울 마포구 양화로 55', 37.5495, 126.9137],
  ['김포공항역', '5호선 / 9호선 / 공항철도 / 김포골드라인', '서울 강서구 하늘길 77', 37.5622, 126.8013],
  ['고속터미널역', '3호선 / 7호선 / 9호선', '서울 서초구 신반포로 188', 37.5048, 127.0049],
  ['사당역', '2호선 / 4호선', '서울 동작구 남부순환로 2089', 37.4766, 126.9816],
  ['교대역', '2호선 / 3호선', '서울 서초구 서초대로 294', 37.4934, 127.0140],
  ['강남역', '2호선 / 신분당선', '서울 강남구 강남대로 396', 37.4979, 127.0276],
  ['양재역', '3호선 / 신분당선', '서울 서초구 남부순환로 2585', 37.4846, 127.0340],
  ['잠실역', '2호선 / 8호선', '서울 송파구 올림픽로 265', 37.5133, 127.1002],
  ['석촌역', '8호선 / 9호선', '서울 송파구 송파대로 439', 37.5054, 127.1069],
  ['천호역', '5호선 / 8호선', '서울 강동구 천호대로 997', 37.5386, 127.1233],
  ['왕십리역', '2호선 / 5호선 / 경의중앙선 / 수인분당선', '서울 성동구 왕십리광장로 17', 37.5612, 127.0371],
  ['청량리역', '1호선 / 경의중앙선 / 경춘선 / 수인분당선', '서울 동대문구 왕산로 214', 37.5801, 127.0464],
  ['건대입구역', '2호선 / 7호선', '서울 광진구 아차산로 243', 37.5404, 127.0692],
  ['군자역', '5호선 / 7호선', '서울 광진구 천호대로 550', 37.5571, 127.0795],
  ['노원역', '4호선 / 7호선', '서울 노원구 상계로 69-1', 37.6551, 127.0614],
  ['창동역', '1호선 / 4호선', '서울 도봉구 마들로11길 77', 37.6532, 127.0477],
  ['수유역', '4호선', '서울 강북구 도봉로 338', 37.6380, 127.0257],
  ['미아사거리역', '4호선', '서울 강북구 도봉로 50', 37.6133, 127.0301],
  ['동대문역사문화공원역', '2호선 / 4호선 / 5호선', '서울 중구 을지로 279', 37.5651, 127.0079],
  ['종로3가역', '1호선 / 3호선 / 5호선', '서울 종로구 종로 129', 37.5716, 126.9919],
  ['광화문역', '5호선', '서울 종로구 세종대로 172', 37.5715, 126.9764],
  ['여의도역', '5호선 / 9호선', '서울 영등포구 여의나루로 40', 37.5216, 126.9243],
  ['공덕역', '5호선 / 6호선 / 경의중앙선 / 공항철도', '서울 마포구 마포대로 100', 37.5436, 126.9517],
  ['디지털미디어시티역', '6호선 / 경의중앙선 / 공항철도', '서울 은평구 수색로 193', 37.5760, 126.9016],
  ['구로디지털단지역', '2호선', '서울 구로구 도림천로 477', 37.4853, 126.9015],
  ['신림역', '2호선 / 신림선', '서울 관악구 남부순환로 1614', 37.4842, 126.9297],
  ['이수역', '4호선 / 7호선', '서울 동작구 동작대로 117', 37.4868, 126.9822],
  ['수원역', '1호선 / 수인분당선', '경기 수원시 팔달구 덕영대로 924', 37.2661, 126.9997],
  ['인덕원역', '4호선', '경기 안양시 동안구 흥안대로 529', 37.4019, 126.9767],
  ['범계역', '4호선', '경기 안양시 동안구 동안로 130', 37.3897, 126.9507],
  ['부평역', '1호선 / 인천1호선', '인천 부평구 광장로 16', 37.4895, 126.7240],
  ['부천역', '1호선', '경기 부천시 원미구 부천로 1', 37.4840, 126.7827],
  ['일산역', '경의중앙선', '경기 고양시 일산서구 경의로 672', 37.6820, 126.7695],
  ['야탑역', '수인분당선', '경기 성남시 분당구 성남대로 903', 37.4113, 127.1286],
  ['판교역', '신분당선 / 경강선', '경기 성남시 분당구 판교역로 160', 37.3948, 127.1112],
].map(([name, line, address, lat, lng], index) => ({
  name,
  line,
  address,
  lat,
  lng,
  sort_order: (index + 1) * 10,
  is_active: true,
}));

const REFERENCE_PARTICIPATION_TARGETS = {
  'campus|서울지구|남팀|서울대학교': 170,
  'campus|서울지구|남팀|숭실대학교': 95,
  'campus|서울지구|남팀|중앙대학교': 140,
  'campus|서울지구|북동팀|광운대학교': 90,
  'campus|서울지구|북동팀|서울과학기술대학교': 105,
  'campus|서울지구|북동팀|서울여자대학교': 70,
  'campus|서울지구|북팀|고려대학교': 110,
  'campus|서울지구|북팀|국민대학교': 105,
  'campus|서울지구|북팀|성신여자대학교': 64,
  'campus|서울지구|서팀|연세대학교': 120,
  'campus|서울지구|서팀|이화여자대학교': 88,
  'campus|서울지구|서팀|홍익대학교': 115,
};

const command = process.argv[2] ?? 'help';
const userCount = Number.parseInt(
  process.env.SIMULATION_USER_COUNT ?? String(DEFAULT_USER_COUNT),
  10,
);
const password = process.env.SIMULATION_PASSWORD ?? DEFAULT_PASSWORD;
let globalAdminEmail =
  process.env.SIMULATION_GLOBAL_ADMIN_EMAIL ?? DEFAULT_GLOBAL_ADMIN_EMAIL;

const pad = (value) => String(value).padStart(4, '0');
const userEmail = (sequence) => `${USER_PREFIX}${pad(sequence)}${SIM_SUFFIX}`;
const adminEmail = (sequence) => `${ADMIN_PREFIX}${pad(sequence)}${SIM_SUFFIX}`;
const isSimulationEmail = (email) =>
  email?.startsWith('sim-') && email.endsWith(SIM_SUFFIX);
const scopeKey = (item) =>
  `${item.district_id ?? ''}:${item.team_id ?? ''}:${item.campus_id ?? ''}`;
const textScopeKey = (item) =>
  `${item.district ?? ''}:${item.team ?? ''}:${item.campus ?? ''}`;
const hashString = (value) => {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};
const deterministicUnit = (value) => hashString(value) / 0x100000000;
const shouldCreateSimulationReservation = (user) =>
  Math.max(1, user.sequence) % 10 !== 0;
const chunks = (items, size = CHUNK_SIZE) => {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
};

let supabase;

function getClient() {
  if (supabase) return supabase;

  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'VITE_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요합니다. ' +
        '반드시 분리된 테스트 프로젝트만 사용하세요.',
    );
  }

  supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return supabase;
}

function assertUserCount() {
  if (!Number.isInteger(userCount) || userCount < 1 || userCount > 5000) {
    throw new Error('SIMULATION_USER_COUNT는 1~5000 사이의 정수여야 합니다.');
  }
}

function promptText(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      `${label} 대화형 터미널이 아니므로 입력할 수 없습니다.`,
    );
  }

  const input = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    input.question(label, (answer) => {
      input.close();
      resolve(answer);
    });
  });
}

function promptPassword(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) {
    throw new Error(
      `${label} 대화형 터미널이 아니므로 입력할 수 없습니다.`,
    );
  }

  return new Promise((resolve, reject) => {
    let value = '';
    const wasRaw = process.stdin.isRaw;

    const finish = (error) => {
      process.stdin.off('keypress', onKeypress);
      process.stdin.setRawMode(Boolean(wasRaw));
      process.stdin.pause();
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };

    const onKeypress = (character, key) => {
      if (key?.ctrl && key.name === 'c') {
        finish(new Error('전체 관리자 비밀번호 입력이 취소되었습니다.'));
        return;
      }
      if (key?.name === 'return' || key?.name === 'enter') {
        finish();
        return;
      }
      if (key?.name === 'backspace') {
        if (value.length > 0) {
          value = value.slice(0, -1);
          process.stdout.write('\b \b');
        }
        return;
      }
      if (character && !key?.ctrl && !key?.meta) {
        value += character;
        process.stdout.write('*');
      }
    };

    process.stdout.write(label);
    emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('keypress', onKeypress);
  });
}

function normalizeAdminEmail(value) {
  const email = value.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error('전체 관리자 ID는 올바른 이메일 주소여야 합니다.');
  }
  if (isSimulationEmail(email)) {
    throw new Error('전체 관리자 ID에는 시뮬레이션 계정 도메인을 사용할 수 없습니다.');
  }
  return email;
}

async function mapWithConcurrency(items, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, runWorker),
  );
  return results;
}

async function fetchAllAuthUsers() {
  const client = getClient();
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: PAGE_SIZE,
    });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < PAGE_SIZE) return users;
  }
}

async function fetchAllRows(table, columns, applyFilters = (query) => query) {
  const client = getClient();
  const rows = [];
  let cursorId = null;

  while (true) {
    let query = client
      .from(table)
      .select(columns)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);
    if (cursorId) query = query.gt('id', cursorId);
    query = applyFilters(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table} 조회 실패: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
    cursorId = data[data.length - 1].id;
  }
}

async function fetchRowsByIds(table, columns, column, ids) {
  const rows = [];
  for (const idChunk of chunks(ids)) {
    const { data, error } = await getClient()
      .from(table)
      .select(columns)
      .in(column, idChunk);
    if (error) throw new Error(`${table} 조회 실패: ${error.message}`);
    rows.push(...data);
  }
  return rows;
}

async function deleteRowsByIds(table, column, ids) {
  for (const idChunk of chunks(ids)) {
    const { error } = await getClient().from(table).delete().in(column, idChunk);
    if (error) throw new Error(`${table} 정리 실패: ${error.message}`);
  }
}

async function updateRowsByIds(table, column, ids, values) {
  for (const idChunk of chunks(ids)) {
    const { error } = await getClient()
      .from(table)
      .update(values)
      .in(column, idChunk);
    if (error) throw new Error(`${table} 정리 실패: ${error.message}`);
  }
}

function isMissingTableError(error) {
  return (
    error?.code === 'PGRST205' ||
    error?.code === '42P01' ||
    error?.message?.includes('Could not find the table') ||
    error?.message?.includes('does not exist')
  );
}

async function deleteAllRows(table, column = 'id') {
  const { count, error } = await getClient()
    .from(table)
    .delete({ count: 'exact' })
    .not(column, 'is', null);
  if (isMissingTableError(error)) {
    console.log(`  ${table}: 테이블이 없어 건너뜀`);
    return;
  }
  if (error) throw new Error(`${table} 전체 정리 실패: ${error.message}`);
  console.log(`  ${table}: ${count ?? 0}개 행 삭제`);
}

async function clearReferences(table, column, ids) {
  for (const idChunk of chunks(ids)) {
    const { error } = await getClient()
      .from(table)
      .update({ [column]: null, updated_at: new Date().toISOString() })
      .in(column, idChunk);
    if (error) throw new Error(`${table} 정리 실패: ${error.message}`);
  }
}

function authUserToSpec(user) {
  const metadata = user.user_metadata ?? {};
  return {
    userId: user.id,
    email: user.email,
    name: metadata.name,
    phone: metadata.phone,
    district_id: metadata.district_id,
    district: metadata.district,
    team_id: metadata.team_id,
    team: metadata.team,
    campus_id: metadata.campus_id,
    campus: metadata.campus,
    paymentStatus: metadata.payment_status,
    simRole: metadata.sim_role ?? null,
    sequence: Number(metadata.sim_seq),
  };
}

async function loadSimulationUsers() {
  const users = (await fetchAllAuthUsers())
    .filter((user) => isSimulationEmail(user.email))
    .map(authUserToSpec);
  if (users.length === 0) {
    throw new Error('시뮬레이션 Auth 사용자가 없습니다. seed:accounts를 먼저 실행하세요.');
  }
  return users;
}

async function loadCampuses() {
  const { data, error } = await getClient()
    .from('campus_options')
    .select('district_id,district,team_id,team,campus_id,campus')
    .order('district_sort_order')
    .order('team_sort_order')
    .order('campus_sort_order');
  if (error) throw new Error(`campus_options 조회 실패: ${error.message}`);
  if (data.length === 0) throw new Error('활성 캠퍼스가 없습니다.');
  return data;
}

async function loadAllCampuses() {
  const [districts, teams, campuses] = await Promise.all([
    fetchAllRows('districts', 'id,name,sort_order'),
    fetchAllRows('teams', 'id,district_id,name,sort_order'),
    fetchAllRows('campuses', 'id,team_id,name,sort_order'),
  ]);
  const districtById = new Map(districts.map((district) => [district.id, district]));
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const result = campuses.map((campus) => {
    const team = teamById.get(campus.team_id);
    const district = team && districtById.get(team.district_id);
    if (!team || !district) {
      throw new Error(`${campus.name} 캠퍼스의 지구 또는 팀 정보를 찾을 수 없습니다.`);
    }
    return {
      district_id: district.id,
      district: district.name,
      district_sort_order: district.sort_order,
      team_id: team.id,
      team: team.name,
      team_sort_order: team.sort_order,
      campus_id: campus.id,
      campus: campus.name,
      campus_sort_order: campus.sort_order,
    };
  });
  result.sort(
    (a, b) =>
      a.district_sort_order - b.district_sort_order ||
      a.team_sort_order - b.team_sort_order ||
      a.campus_sort_order - b.campus_sort_order ||
      a.campus.localeCompare(b.campus),
  );
  if (result.length === 0) throw new Error('등록된 캠퍼스가 없습니다.');
  return result;
}

function assertOneAdminPerCampus(admins, campuses) {
  const counts = new Map();
  for (const admin of admins) {
    const key = scopeKey(admin);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const invalid = campuses.filter((campus) => counts.get(scopeKey(campus)) !== 1);
  const extra = [...counts].filter(
    ([key]) => !campuses.some((campus) => scopeKey(campus) === key),
  );
  if (invalid.length > 0 || extra.length > 0 || admins.length !== campuses.length) {
    throw new Error(
      `모든 캠퍼스마다 캠퍼스 회계 순장님이 정확히 한 명이어야 합니다. ` +
        `캠퍼스 ${campuses.length}개, 관리자 ${admins.length}명, ` +
        `누락 또는 중복 ${invalid.length + extra.length}건`,
    );
  }
}

async function loadStations() {
  const { data, error } = await getClient()
    .from('stations')
    .select('id,name,line,address,lat,lng')
    .eq('is_active', true)
    .order('sort_order')
    .order('name');
  if (error) throw new Error(`정류장 조회 실패: ${error.message}`);
  if (data.length < 2) throw new Error('활성 정류장이 최소 2개 필요합니다.');
  return data;
}

async function seedReferenceData() {
  const referenceTeamCount = REFERENCE_ORGANIZATION.reduce(
    (sum, district) => sum + district.teams.length,
    0,
  );
  const referenceCampusCount = REFERENCE_ORGANIZATION.reduce(
    (sum, district) =>
      sum + district.teams.reduce((teamSum, team) => teamSum + team.campuses.length, 0),
    0,
  );
  if (
    referenceTeamCount !== 7 ||
    referenceCampusCount !== 47 ||
    REFERENCE_STATIONS.length !== 40
  ) {
    throw new Error(
      `기준정보 목록이 올바르지 않습니다. ` +
        `팀 ${referenceTeamCount}개, 캠퍼스 ${referenceCampusCount}개, ` +
        `행선지 ${REFERENCE_STATIONS.length}개를 확인하세요.`,
    );
  }

  console.log('조직 구조를 생성하는 중...');
  for (const district of REFERENCE_ORGANIZATION) {
    const now = new Date().toISOString();
    const { data: districtRow, error: districtError } = await getClient()
      .from('districts')
      .upsert(
        {
          name: district.name,
          sort_order: district.sort_order,
          is_active: true,
          updated_at: now,
        },
        { onConflict: 'name' },
      )
      .select('id,name')
      .single();
    if (districtError) {
      throw new Error(`지구 생성 실패: ${districtError.message}`);
    }

    const { data: existingTeams, error: existingTeamError } = await getClient()
      .from('teams')
      .select('id')
      .eq('district_id', districtRow.id);
    if (existingTeamError) {
      throw new Error(`기존 팀 조회 실패: ${existingTeamError.message}`);
    }
    const existingTeamIds = existingTeams.map((team) => team.id);
    if (existingTeamIds.length > 0) {
      const { error: campusDeactivateError } = await getClient()
        .from('campuses')
        .update({ is_active: false, updated_at: now })
        .in('team_id', existingTeamIds);
      if (campusDeactivateError) {
        throw new Error(`기존 캠퍼스 비활성화 실패: ${campusDeactivateError.message}`);
      }
    }
    const { error: teamDeactivateError } = await getClient()
      .from('teams')
      .update({ is_active: false, updated_at: now })
      .eq('district_id', districtRow.id);
    if (teamDeactivateError) {
      throw new Error(`기존 팀 비활성화 실패: ${teamDeactivateError.message}`);
    }

    const { data: teamRows, error: teamError } = await getClient()
      .from('teams')
      .upsert(
        district.teams.map((team) => ({
          district_id: districtRow.id,
          name: team.name,
          sort_order: team.sort_order,
          is_active: true,
          updated_at: now,
        })),
        { onConflict: 'district_id,name' },
      )
      .select('id,name');
    if (teamError) throw new Error(`팀 생성 실패: ${teamError.message}`);

    const teamIdByName = new Map(teamRows.map((team) => [team.name, team.id]));
    const campusRows = district.teams.flatMap((team) =>
      team.campuses.map((campus, index) => ({
        team_id: teamIdByName.get(team.name),
        name: campus,
        sort_order: (index + 1) * 10,
        is_active: true,
        updated_at: now,
      })),
    );
    const { error: campusError } = await getClient()
      .from('campuses')
      .upsert(campusRows, { onConflict: 'team_id,name' });
    if (campusError) throw new Error(`캠퍼스 생성 실패: ${campusError.message}`);
  }

  console.log('행선지, 버스 옵션, 앱 설정을 생성하는 중...');
  const { error: stationDeactivateError } = await getClient()
    .from('stations')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('is_active', true);
  if (stationDeactivateError) {
    throw new Error(`기존 정류장 비활성화 실패: ${stationDeactivateError.message}`);
  }
  const { error: stationError } = await getClient()
    .from('stations')
    .upsert(REFERENCE_STATIONS, { onConflict: 'name' });
  if (stationError) throw new Error(`정류장 생성 실패: ${stationError.message}`);

  const { error: busDeleteError } = await getClient()
    .from('bus_options')
    .delete()
    .like('notes', 'SIM-%');
  if (busDeleteError) {
    throw new Error(`버스 옵션 정리 실패: ${busDeleteError.message}`);
  }
  const { error: busInsertError } = await getClient().from('bus_options').insert([
    { capacity: 40, estimated_price: 850000, notes: 'SIM-40-seat' },
    { capacity: 45, estimated_price: 920000, notes: 'SIM-45-seat' },
  ]);
  if (busInsertError) {
    throw new Error(`버스 옵션 생성 실패: ${busInsertError.message}`);
  }

  const referenceCampuses = REFERENCE_ORGANIZATION.flatMap((district) =>
    district.teams.flatMap((team) =>
      team.campuses.map((campus) => ({
        district: district.name,
        team: team.name,
        campus,
      })),
    ),
  );
  const participationRows = referenceCampuses.map((campus) => {
    const key = `campus|${campus.district}|${campus.team}|${campus.campus}`;
    return { rowId: key, key, ...campus };
  });
  const fixedTargetTotal = Object.values(REFERENCE_PARTICIPATION_TARGETS).reduce(
    (sum, count) => sum + count,
    0,
  );
  const unassignedCampuses = referenceCampuses.filter((campus) => {
    const key = `campus|${campus.district}|${campus.team}|${campus.campus}`;
    return REFERENCE_PARTICIPATION_TARGETS[key] === undefined;
  });
  const remainingTarget = DEFAULT_USER_COUNT - fixedTargetTotal;
  if (remainingTarget < 0) {
    throw new Error('지정된 캠퍼스 참여인원 합계가 예상 참여인원 2,000명을 초과합니다.');
  }
  const targetCounts = new Map(
    participationRows.map((row) => [
      row.key,
      REFERENCE_PARTICIPATION_TARGETS[row.key] ?? 0,
    ]),
  );
  for (const campus of buildCampusAssignments(unassignedCampuses, remainingTarget)) {
    const key = `campus|${campus.district}|${campus.team}|${campus.campus}`;
    targetCounts.set(key, (targetCounts.get(key) ?? 0) + 1);
  }
  const participationTargets = Object.fromEntries(targetCounts);
  const participationTargetTotal = Object.values(participationTargets).reduce(
    (sum, count) => sum + count,
    0,
  );
  if (participationTargetTotal !== DEFAULT_USER_COUNT) {
    throw new Error(
      `예상 참여인원 합계가 ${DEFAULT_USER_COUNT}명이 아닌 ` +
        `${participationTargetTotal}명입니다.`,
    );
  }

  const { error: settingsError } = await getClient().from('app_settings').upsert(
    [
      { key: 'bus_ticket_price', value: { price: 10000 } },
      {
        key: 'first_reservation_deadline',
        value: { deadline_at: new Date(Date.now() + 7 * 86_400_000).toISOString() },
      },
      {
        key: 'participation_targets',
        value: { rows: participationRows, targets: participationTargets },
      },
      { key: 'global_scenario_checklist', value: { checked_step_ids: [] } },
    ],
    { onConflict: 'key' },
  );
  if (settingsError) {
    throw new Error(`앱 설정 생성 실패: ${settingsError.message}`);
  }

  console.table({
    활성_팀: referenceTeamCount,
    활성_캠퍼스: referenceCampuses.length,
    예상_참여인원: participationTargetTotal,
    활성_행선지: REFERENCE_STATIONS.length,
    참여인원_고정값_캠퍼스: Object.keys(REFERENCE_PARTICIPATION_TARGETS).length,
  });
}

function paymentStatusFor(sequence) {
  const percentile = ((sequence - 1) % 100) + 1;
  if (percentile <= 95) return 'completed';
  return 'pending';
}

function validPaymentStatus(status) {
  return status === 'completed' || status === 'refunded' ? status : 'pending';
}

function buildCampusAssignments(campuses, count) {
  const weighted = campuses.map((campus) => ({
    campus,
    weight: (() => {
      const key = `campus|${campus.district ?? ''}|${campus.team ?? ''}|${campus.campus ?? ''}`;
      const tierUnit = deterministicUnit(`${key}:distribution-tier`);
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
    })(),
  }));
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  const allocations = weighted.map((item) => {
    const exact = (count * item.weight) / totalWeight;
    return { ...item, count: Math.floor(exact), remainder: exact % 1 };
  });
  let remaining = count - allocations.reduce((sum, item) => sum + item.count, 0);
  allocations
    .slice()
    .sort((a, b) => b.remainder - a.remainder || b.weight - a.weight)
    .forEach((item) => {
      if (remaining > 0) {
        item.count += 1;
        remaining -= 1;
      }
    });

  const assignments = allocations.flatMap((item) =>
    Array.from({ length: item.count }, () => item.campus),
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
}

async function createAuthUser(spec) {
  const { data, error } = await getClient().auth.admin.createUser({
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
      payment_status: spec.paymentStatus,
      sim_role: spec.simRole,
      sim_seq: spec.sequence,
    },
  });
  if (error || !data.user) {
    throw new Error(`${spec.email} 생성 실패: ${error?.message ?? '사용자 정보 없음'}`);
  }
  return authUserToSpec(data.user);
}

async function seedGlobalAdmin() {
  const configuredEmail = process.env.SIMULATION_GLOBAL_ADMIN_EMAIL?.trim();
  const configuredPassword = process.env.SIMULATION_GLOBAL_ADMIN_PASSWORD;
  const email = normalizeAdminEmail(
    configuredEmail ?? (await promptText('전체 관리자 ID(이메일): ')),
  );
  const adminPassword =
    configuredPassword ?? (await promptPassword('전체 관리자 비밀번호: '));

  if (adminPassword.length < 6) {
    throw new Error('전체 관리자 비밀번호는 6자 이상이어야 합니다.');
  }

  const existingUser = (await fetchAllAuthUsers()).find(
    (user) => user.email?.toLowerCase() === email,
  );
  const adminName = existingUser?.user_metadata?.name ?? '전체 관리자';
  let userId;

  if (existingUser) {
    const { data, error } = await getClient().auth.admin.updateUserById(
      existingUser.id,
      {
        password: adminPassword,
        email_confirm: true,
        user_metadata: {
          ...existingUser.user_metadata,
          name: adminName,
        },
      },
    );
    if (error || !data.user) {
      throw new Error(
        `전체 관리자 ${email} 수정 실패: ${error?.message ?? '사용자 정보 없음'}`,
      );
    }
    userId = data.user.id;
    console.log(`기존 전체 관리자 Auth 계정 수정 완료: ${email}`);
  } else {
    const { data, error } = await getClient().auth.admin.createUser({
      email,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { name: adminName },
    });
    if (error || !data.user) {
      throw new Error(
        `전체 관리자 ${email} 생성 실패: ${error?.message ?? '사용자 정보 없음'}`,
      );
    }
    userId = data.user.id;
    console.log(`전체 관리자 Auth 계정 생성 완료: ${email}`);
  }

  const now = new Date().toISOString();
  const { error: profileError } = await getClient().from('profiles').upsert(
    {
      id: userId,
      email,
      name: adminName,
      updated_at: now,
    },
    { onConflict: 'id' },
  );
  if (profileError) {
    throw new Error(`전체 관리자 프로필 저장 실패: ${profileError.message}`);
  }

  const roleValues = {
    user_id: userId,
    role: 'global_admin',
    district_id: null,
    district: null,
    team_id: null,
    team: null,
    campus_id: null,
    campus: null,
    updated_at: now,
  };
  const { data: existingRoles, error: roleLoadError } = await getClient()
    .from('admin_roles')
    .select('id')
    .eq('user_id', userId)
    .eq('role', 'global_admin');
  if (roleLoadError) {
    throw new Error(`전체 관리자 권한 조회 실패: ${roleLoadError.message}`);
  }

  const roleQuery =
    existingRoles.length > 0
      ? getClient().from('admin_roles').update(roleValues).eq('id', existingRoles[0].id)
      : getClient().from('admin_roles').insert(roleValues);
  const { error: roleError } = await roleQuery;
  if (roleError) {
    throw new Error(`전체 관리자 권한 등록 실패: ${roleError.message}`);
  }

  globalAdminEmail = email;
  console.log(`global_admin 권한 등록 완료: ${email}`);
}

async function seedAuth() {
  assertUserCount();
  const existing = (await fetchAllAuthUsers()).filter((user) =>
    isSimulationEmail(user.email),
  );
  if (existing.length > 0) {
    throw new Error(
      `기존 시뮬레이션 사용자 ${existing.length}명이 있습니다. cleanup:simulation을 먼저 실행하세요.`,
    );
  }

  const activeCampuses = await loadCampuses();
  const allCampuses = await loadAllCampuses();
  const assignments = buildCampusAssignments(activeCampuses, userCount);
  const generalSpecs = assignments.map((campus, index) => {
    const sequence = index + 1;
    return {
      sequence,
      email: userEmail(sequence),
      name: `시뮬레이션 사용자 ${pad(sequence)}`,
      phone: `010-9${String(sequence).padStart(7, '0').slice(-7)}`,
      paymentStatus: paymentStatusFor(sequence),
      simRole: null,
      ...campus,
    };
  });
  const adminSpecs = allCampuses.map((campus, index) => ({
    sequence: userCount + index + 1,
    email: adminEmail(index + 1),
    name: `시뮬레이션 캠퍼스 회계 순장님 ${pad(index + 1)}`,
    phone: `010-8${String(index + 1).padStart(7, '0').slice(-7)}`,
    paymentStatus: 'completed',
    simRole: 'campus_admin',
    ...campus,
  }));

  console.log(`일반 사용자 ${generalSpecs.length}명을 생성하는 중...`);
  await mapWithConcurrency(generalSpecs, async (spec, index) => {
    const user = await createAuthUser(spec);
    if ((index + 1) % 100 === 0 || index + 1 === generalSpecs.length) {
      console.log(`  Auth 사용자: ${index + 1}/${generalSpecs.length}`);
    }
    return user;
  });
  console.log(`캠퍼스 회계 순장님 ${adminSpecs.length}명을 생성하는 중...`);
  await mapWithConcurrency(adminSpecs, createAuthUser);
}

async function seedProfiles() {
  const users = await loadSimulationUsers();
  const admins = users.filter((user) => user.simRole === 'campus_admin');
  const generalUsers = users.filter((user) => user.simRole !== 'campus_admin');
  const campuses = await loadAllCampuses();
  if (generalUsers.length !== userCount) {
    throw new Error(`일반 사용자 ${userCount}명이 필요하지만 ${generalUsers.length}명을 찾았습니다.`);
  }
  assertOneAdminPerCampus(admins, campuses);
  const rows = users.map((user) => ({
    id: user.userId,
    email: user.email,
    name: user.name,
    phone: user.phone,
    district_id: user.district_id,
    district: user.district,
    team_id: user.team_id,
    team: user.team,
    campus_id: user.campus_id,
    campus: user.campus,
    updated_at: new Date().toISOString(),
  }));
  for (const rowChunk of chunks(rows)) {
    const { error } = await getClient()
      .from('profiles')
      .upsert(rowChunk, { onConflict: 'id' });
    if (error) throw new Error(`프로필 저장 실패: ${error.message}`);
  }

  const existingRoles = await fetchAllRows(
    'admin_roles',
    'id,user_id,role,district_id,district,team_id,team,campus_id,campus',
    (query) => query.eq('role', 'campus_admin'),
  );
  const adminIds = new Set(admins.map((admin) => admin.userId));
  const scopes = new Set(admins.map(scopeKey));
  const textScopes = new Set(admins.map(textScopeKey));
  const conflicts = existingRoles.filter(
    (role) =>
      (scopes.has(scopeKey(role)) || textScopes.has(textScopeKey(role))) &&
      !adminIds.has(role.user_id),
  );
  if (conflicts.length > 0) {
    throw new Error(
      `시뮬레이션 범위에 실제 캠퍼스 회계 순장님 ${conflicts.length}명이 있습니다.`,
    );
  }

  await deleteRowsByIds('admin_roles', 'user_id', [...adminIds]);
  const roleRows = admins.map((admin) => ({
    user_id: admin.userId,
    role: 'campus_admin',
    district_id: admin.district_id,
    district: admin.district,
    team_id: admin.team_id,
    team: admin.team,
    campus_id: admin.campus_id,
    campus: admin.campus,
    updated_at: new Date().toISOString(),
  }));
  for (const rowChunk of chunks(roleRows)) {
    const { error } = await getClient().from('admin_roles').insert(rowChunk);
    if (error) throw new Error(`캠퍼스 회계 순장님 권한 등록 실패: ${error.message}`);
  }
  const registeredRoles = await fetchRowsByIds(
    'admin_roles',
    'user_id,role,district_id,team_id,campus_id',
    'user_id',
    [...adminIds],
  );
  assertOneAdminPerCampus(
    registeredRoles.filter((role) => role.role === 'campus_admin'),
    campuses,
  );
}

async function seedAccounts() {
  await seedAuth();
  await seedProfiles();
}

const stationPreference = (station, rank) => ({
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

function campusStationHotspots(stations, user) {
  const hotspotCount = Math.min(5, stations.length);
  const hotspots = [];
  let state = hashString(`hotspots:${scopeKey(user)}`);
  while (hotspots.length < hotspotCount) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const station = stations[state % stations.length];
    if (!hotspots.includes(station)) hotspots.push(station);
  }
  return hotspots;
}

function pickStation(pool, user, label, excludedId) {
  const candidates = pool.filter((station) => station.id !== excludedId);
  if (candidates.length === 0) return null;
  const unit = deterministicUnit(`${user.userId}:${label}`);
  const index = Math.min(
    candidates.length - 1,
    Math.floor(unit ** 1.8 * candidates.length),
  );
  return candidates[index];
}

function buildStationPreferences(stations, user) {
  const hotspots = campusStationHotspots(stations, user);
  const firstPool =
    deterministicUnit(`${user.userId}:first-pool`) < 0.82 ? hotspots : stations;
  const first = pickStation(firstPool, user, 'first-station');
  if (!first) throw new Error('1지망 행선지를 선택할 수 없습니다.');

  const preferences = [stationPreference(first, 1)];
  const secondPool =
    deterministicUnit(`${user.userId}:second-pool`) < 0.68 ? hotspots : stations;
  const second =
    pickStation(secondPool, user, 'second-station', first.id) ??
    pickStation(stations, user, 'second-station-fallback', first.id);
  if (!second) throw new Error('2지망 행선지를 선택할 수 없습니다.');
  preferences.push(stationPreference(second, 2));
  return preferences;
}

function requestedAtFor(user, now) {
  const ageUnit = deterministicUnit(`${user.userId}:requested-age`);
  const ageMinutes = Math.floor(ageUnit ** 1.7 * 24 * 60);
  return new Date(now - ageMinutes * 60_000).toISOString();
}

async function seedReservations() {
  const users = await loadSimulationUsers();
  const reservationUsers = users.filter(shouldCreateSimulationReservation);
  const nonReservationUserIds = users
    .filter((user) => !shouldCreateSimulationReservation(user))
    .map((user) => user.userId);
  const adminIds = users
    .filter((user) => user.simRole === 'campus_admin')
    .map((user) => user.userId);
  const profileCount = await countRows(
    'profiles',
    'id',
    users.map((user) => user.userId),
  );
  if (profileCount !== users.length) {
    throw new Error('프로필이 완전하지 않습니다. seed:accounts를 먼저 실행하세요.');
  }
  const adminRoleCount = await countRows('admin_roles', 'user_id', adminIds);
  if (adminRoleCount !== adminIds.length) {
    throw new Error('캠퍼스 회계 순장님 권한이 완전하지 않습니다. seed:accounts를 먼저 실행하세요.');
  }
  const stations = await loadStations();
  const now = Date.now();
  await deleteRowsByIds('payments', 'user_id', nonReservationUserIds);
  await deleteRowsByIds('reservations', 'user_id', nonReservationUserIds);
  const rows = reservationUsers.map((user) => {
    const requestedAt = requestedAtFor(user, now);
    const preferences = buildStationPreferences(stations, user);
    const status = 'requested';
    return {
      user_id: user.userId,
      name: user.name,
      phone: user.phone,
      district_id: user.district_id,
      district: user.district,
      team_id: user.team_id,
      team: user.team,
      campus_id: user.campus_id,
      campus: user.campus,
      station_preferences: preferences,
      status,
      confirmed_ticket: null,
      data: {
        id: `reservation-sim-${pad(user.sequence)}`,
        name: user.name,
        phone: user.phone,
        district: user.district,
        team: user.team,
        campus: user.campus,
        stationPreferences: preferences,
        status,
        requestedAt,
      },
      created_at: requestedAt,
      updated_at: requestedAt,
    };
  });
  for (const rowChunk of chunks(rows)) {
    const { error } = await getClient()
      .from('reservations')
      .upsert(rowChunk, { onConflict: 'user_id' });
    if (error) throw new Error(`예약 저장 실패: ${error.message}`);
  }
  const firstChoiceCounts = new Map();
  for (const row of rows) {
    const station = row.station_preferences[0].station.name;
    firstChoiceCounts.set(station, (firstChoiceCounts.get(station) ?? 0) + 1);
  }
  const sortedFirstChoices = [...firstChoiceCounts.values()].sort((a, b) => a - b);
  console.table({
    전체_계정: users.length,
    전체_예약: rows.length,
    미신청_계정: users.length - rows.length,
    신청_상태: rows.filter((row) => row.status === 'requested').length,
    취소_상태: rows.filter((row) => row.status === 'cancelled').length,
    '2지망까지_선택': rows.filter((row) => row.station_preferences.length === 2).length,
    '1지망_선택된_행선지': firstChoiceCounts.size,
    '행선지별_최소_1지망': sortedFirstChoices[0] ?? 0,
    '행선지별_최대_1지망': sortedFirstChoices.at(-1) ?? 0,
  });
}

async function seedPayments() {
  const users = await loadSimulationUsers();
  const userIds = users.map((user) => user.userId);
  const expectedReservationUsers = users.filter(shouldCreateSimulationReservation);
  const expectedReservationUserIds = new Set(
    expectedReservationUsers.map((user) => user.userId),
  );
  const reservations = await fetchRowsByIds(
    'reservations',
    'id,user_id,status',
    'user_id',
    userIds,
  );
  if (
    reservations.length !== expectedReservationUsers.length ||
    reservations.some((reservation) => !expectedReservationUserIds.has(reservation.user_id))
  ) {
    throw new Error('예약이 완전하지 않습니다. seed:reservations를 먼저 실행하세요.');
  }
  const cancelledReservations = reservations.filter(
    (reservation) => reservation.status === 'cancelled',
  );
  if (cancelledReservations.length > 0) {
    throw new Error(
      `취소된 예약 ${cancelledReservations.length}건이 있습니다. ` +
        'seed:reservations 단계에서는 모든 예약이 requested 상태여야 합니다.',
    );
  }

  await deleteRowsByIds('payments', 'user_id', userIds);
  const usersById = new Map(users.map((user) => [user.userId, user]));
  const rows = reservations.flatMap((reservation) => {
    const user = usersById.get(reservation.user_id);
    if (!user) return [];
    const status = validPaymentStatus(user.paymentStatus);
    return [{
      user_id: user.userId,
      reservation_id: reservation.id,
      amount: 10000,
      status,
      paid_at: status === 'completed' ? new Date().toISOString() : null,
      notes: '시뮬레이션 초기 입금',
    }];
  });
  for (const rowChunk of chunks(rows)) {
    const { error } = await getClient().from('payments').insert(rowChunk);
    if (error) throw new Error(`입금 데이터 생성 실패: ${error.message}`);
  }
}

async function closeReservations() {
  const now = new Date(Date.now() - 60_000).toISOString();
  const { error } = await getClient()
    .from('app_settings')
    .upsert(
      { key: 'first_reservation_deadline', value: { deadline_at: now } },
      { onConflict: 'key' },
    );
  if (error) throw new Error(`예약 마감 실패: ${error.message}`);
}

async function assertReservationsClosed() {
  const { data, error } = await getClient()
    .from('app_settings')
    .select('value')
    .eq('key', 'first_reservation_deadline')
    .maybeSingle();
  if (error) throw new Error(`예약 마감 확인 실패: ${error.message}`);
  const deadline = data?.value?.deadline_at;
  if (!deadline || new Date(deadline).getTime() > Date.now()) {
    throw new Error('예약이 아직 열려 있습니다. close를 먼저 실행하세요.');
  }
}

async function loadAdminByScope(users) {
  const admins = users.filter((user) => user.simRole === 'campus_admin');
  const roles = await fetchRowsByIds(
    'admin_roles',
    'user_id,role,district_id,team_id,campus_id',
    'user_id',
    admins.map((admin) => admin.userId),
  );
  const adminById = new Map(admins.map((admin) => [admin.userId, admin]));
  return new Map(
    roles
      .filter((role) => role.role === 'campus_admin' && adminById.has(role.user_id))
      .map((role) => [scopeKey(role), role.user_id]),
  );
}

async function settlePayments() {
  await assertReservationsClosed();
  const users = await loadSimulationUsers();
  const requested = (await fetchRowsByIds(
    'reservations',
    'id,user_id,status,district_id,team_id,campus_id',
    'user_id',
    users.map((user) => user.userId),
  )).filter((reservation) => reservation.status === 'requested');
  const paymentCount = await countRows(
    'payments',
    'user_id',
    users.map((user) => user.userId),
  );
  if (paymentCount !== requested.length) {
    throw new Error('초기 입금 데이터가 완전하지 않습니다. seed:payments를 먼저 실행하세요.');
  }
  const adminByScope = await loadAdminByScope(users);
  const reservationIdsByAdmin = new Map();

  for (const reservation of requested) {
    const adminId = adminByScope.get(scopeKey(reservation));
    if (!adminId) {
      throw new Error(`${scopeKey(reservation)} 범위의 시뮬레이션 캠퍼스 회계 순장님이 없습니다.`);
    }
    const ids = reservationIdsByAdmin.get(adminId) ?? [];
    ids.push(reservation.id);
    reservationIdsByAdmin.set(adminId, ids);
  }

  for (const [adminId, reservationIds] of reservationIdsByAdmin) {
    for (const idChunk of chunks(reservationIds)) {
      const now = new Date().toISOString();
      const { error } = await getClient()
        .from('payments')
        .update({
          status: 'completed',
          paid_at: now,
          verified_by: adminId,
          verified_at: now,
          notes: '시뮬레이션 캠퍼스 입금 확인',
          updated_at: now,
        })
        .in('reservation_id', idChunk);
      if (error) throw new Error(`입금 정산 실패: ${error.message}`);
    }
  }
}

async function settleTransferReports() {
  await settlePayments();

  const users = await loadSimulationUsers();
  const simulationIds = new Set(users.map((user) => user.userId));
  const activeReservations = await fetchAllRows(
    'reservations',
    'id,user_id,status,district_id,district,team_id,team,campus_id,campus',
    (query) => query.neq('status', 'cancelled'),
  );
  const nonSimulation = activeReservations.filter(
    (reservation) => !simulationIds.has(reservation.user_id),
  );
  if (nonSimulation.length > 0) {
    throw new Error(
      `활성 상태의 실제 사용자 예약 ${nonSimulation.length}건이 있습니다. ` +
        '분리된 테스트 데이터베이스를 사용하세요.',
    );
  }
  const requestedReservations = activeReservations.filter(
    (reservation) => reservation.status === 'requested',
  );

  const payments = await fetchRowsByIds(
    'payments',
    'reservation_id,status,amount',
    'user_id',
    [...simulationIds],
  );
  const paymentByReservation = new Map(
    payments.map((payment) => [payment.reservation_id, payment]),
  );
  const adminByScope = await loadAdminByScope(users);
  const grouped = new Map();

  for (const reservation of requestedReservations) {
    const payment = paymentByReservation.get(reservation.id);
    if (!payment || payment.status !== 'completed') {
      throw new Error('요청 상태의 모든 시뮬레이션 예약이 먼저 입금 완료되어야 합니다.');
    }
    const key = scopeKey(reservation);
    const current = grouped.get(key) ?? {
      ...reservation,
      total_people: 0,
      paid_people: 0,
      total_amount: 0,
    };
    current.total_people += 1;
    current.paid_people += 1;
    current.total_amount += payment.amount;
    grouped.set(key, current);
  }

  const now = new Date().toISOString();
  const rows = [...grouped.values()].map((group) => {
    const sentBy = adminByScope.get(scopeKey(group));
    if (!sentBy) throw new Error(`${scopeKey(group)} 범위의 캠퍼스 회계 순장님이 없습니다.`);
    return {
      district_id: group.district_id,
      district: group.district,
      team_id: group.team_id,
      team: group.team,
      campus_id: group.campus_id,
      campus: group.campus,
      total_people: group.total_people,
      paid_people: group.paid_people,
      total_amount: group.total_amount,
      status: 'sent',
      sent_by: sentBy,
      sent_at: now,
      confirmed_by: null,
      confirmed_at: null,
      actual_confirmed_amount: null,
      updated_at: now,
    };
  });
  for (const rowChunk of chunks(rows)) {
    const { error } = await getClient()
      .from('campus_transfers')
      .upsert(rowChunk, { onConflict: 'district,team,campus' });
    if (error) throw new Error(`캠퍼스 송금 보고 생성 실패: ${error.message}`);
  }

  const reports = await fetchRowsByIds(
    'campus_transfers',
    'id,district_id,team_id,campus_id,status,sent_by,confirmed_by',
    'sent_by',
    [...new Set(rows.map((row) => row.sent_by))],
  );
  const expectedScopes = new Set(rows.map(scopeKey));
  const reportedScopes = new Set(
    reports
      .filter(
        (report) =>
          expectedScopes.has(scopeKey(report)) &&
          report.status === 'sent' &&
          report.sent_by &&
          !report.confirmed_by,
      )
      .map(scopeKey),
  );
  if (reportedScopes.size !== expectedScopes.size) {
    throw new Error(
      `캠퍼스 송금 보고 검증 실패: 예상 ${expectedScopes.size}개, ` +
        `sent 상태 ${reportedScopes.size}개`,
    );
  }
  console.table({
    송금_보고_캠퍼스: reportedScopes.size,
    보고_상태: 'sent',
    본부_확인_대기: reportedScopes.size,
  });
}

async function settleConfirmation() {
  const allAuthUsers = await fetchAllAuthUsers();
  const globalAdmin = allAuthUsers.find(
    (user) => user.email?.toLowerCase() === globalAdminEmail.toLowerCase(),
  );
  if (!globalAdmin) throw new Error(`전체 관리자 ${globalAdminEmail}을 찾을 수 없습니다.`);
  const { count, error: roleError } = await getClient()
    .from('admin_roles')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', globalAdmin.id)
    .eq('role', 'global_admin');
  if (roleError) throw new Error(`전체 관리자 권한 확인 실패: ${roleError.message}`);
  if (!count) throw new Error(`${globalAdminEmail}에 global_admin 권한이 없습니다.`);

  const users = await loadSimulationUsers();
  const adminIds = users
    .filter((user) => user.simRole === 'campus_admin')
    .map((user) => user.userId);
  const transfers = await fetchRowsByIds(
    'campus_transfers',
    'id,total_amount',
    'sent_by',
    adminIds,
  );
  if (transfers.length === 0) {
    throw new Error('시뮬레이션 캠퍼스 송금 보고가 없습니다. settle:reports를 먼저 실행하세요.');
  }
  for (const transfer of transfers) {
    const now = new Date().toISOString();
    const { error } = await getClient()
      .from('campus_transfers')
      .update({
        status: 'confirmed',
        confirmed_by: globalAdmin.id,
        confirmed_at: now,
        actual_confirmed_amount: transfer.total_amount,
        updated_at: now,
      })
      .eq('id', transfer.id);
    if (error) throw new Error(`송금 확인 실패: ${error.message}`);
  }
}

async function countRows(table, column, ids) {
  let total = 0;
  for (const idChunk of chunks(ids)) {
    const { count, error } = await getClient()
      .from(table)
      .select('*', { count: 'exact', head: true })
      .in(column, idChunk);
    if (error) throw new Error(`${table} 검증 실패: ${error.message}`);
    total += count ?? 0;
  }
  return total;
}

async function verifySettlement() {
  await assertReservationsClosed();
  const users = await loadSimulationUsers();
  const ids = users.map((user) => user.userId);
  const adminIds = users
    .filter((user) => user.simRole === 'campus_admin')
    .map((user) => user.userId);
  const reservations = (await fetchRowsByIds(
    'reservations',
    'id,status,district_id,team_id,campus_id',
    'user_id',
    ids,
  )).filter((reservation) => reservation.status === 'requested');
  const payments = await fetchRowsByIds(
    'payments',
    'reservation_id,status,verified_by,verified_at',
    'user_id',
    ids,
  );
  const paymentByReservation = new Map(
    payments.map((payment) => [payment.reservation_id, payment]),
  );
  const invalidPayments = reservations.filter((reservation) => {
    const payment = paymentByReservation.get(reservation.id);
    return (
      !payment ||
      payment.status !== 'completed' ||
      !payment.verified_by ||
      !payment.verified_at
    );
  });
  const transfers = await fetchRowsByIds(
    'campus_transfers',
    'district_id,team_id,campus_id,status,confirmed_by,confirmed_at,total_amount,actual_confirmed_amount',
    'sent_by',
    adminIds,
  );
  const expectedScopes = new Set(reservations.map(scopeKey));
  const invalidTransfers = transfers.filter(
    (transfer) =>
      transfer.status !== 'confirmed' ||
      !transfer.confirmed_by ||
      !transfer.confirmed_at ||
      transfer.actual_confirmed_amount !== transfer.total_amount,
  );
  console.table({
    요청_예약: reservations.length,
    잘못된_입금: invalidPayments.length,
    예상_캠퍼스_송금: expectedScopes.size,
    캠퍼스_송금: transfers.length,
    잘못된_송금: invalidTransfers.length,
  });
  if (
    invalidPayments.length > 0 ||
    transfers.length !== expectedScopes.size ||
    invalidTransfers.length > 0
  ) {
    throw new Error('정산 검증에 실패했습니다. 위 요약을 확인하세요.');
  }
}

async function verify() {
  const users = await loadSimulationUsers();
  const ids = users.map((user) => user.userId);
  const admins = users.filter((user) => user.simRole === 'campus_admin');
  const adminIds = admins.map((user) => user.userId);
  const campuses = await loadAllCampuses();
  assertOneAdminPerCampus(admins, campuses);
  const campusAdminRoles = await fetchRowsByIds(
    'admin_roles',
    'user_id,role,district_id,team_id,campus_id',
    'user_id',
    adminIds,
  );
  assertOneAdminPerCampus(
    campusAdminRoles.filter((role) => role.role === 'campus_admin'),
    campuses,
  );
  const reservations = await fetchRowsByIds(
    'reservations',
    'id,user_id,status',
    'user_id',
    ids,
  );
  const requested = reservations.filter((row) => row.status === 'requested');
  const expectedReservationUserIds = new Set(
    users.filter(shouldCreateSimulationReservation).map((user) => user.userId),
  );
  const reservationUserIds = new Set(
    reservations.map((reservation) => reservation.user_id),
  );
  const [profiles, payments, adminRoles, transfers] = await Promise.all([
    countRows('profiles', 'id', ids),
    countRows('payments', 'user_id', ids),
    countRows('admin_roles', 'user_id', adminIds),
    countRows('campus_transfers', 'sent_by', adminIds),
  ]);
  const summary = {
    Auth_사용자: users.length,
    일반_사용자: users.length - adminIds.length,
    전체_캠퍼스: campuses.length,
    캠퍼스_관리자: adminIds.length,
    프로필: profiles,
    관리자_권한: adminRoles,
    예약: reservations.length,
    미신청_계정: users.length - reservations.length,
    요청_예약: requested.length,
    입금: payments,
    캠퍼스_송금: transfers,
  };
  console.table(summary);

  if (
    profiles !== users.length ||
    adminRoles !== adminIds.length ||
    reservations.length !== expectedReservationUserIds.size ||
    [...expectedReservationUserIds].some((id) => !reservationUserIds.has(id)) ||
    [...reservationUserIds].some((id) => !expectedReservationUserIds.has(id)) ||
    payments !== requested.length
  ) {
    throw new Error('시뮬레이션 검증에 실패했습니다. 위 요약을 확인하세요.');
  }
}

async function cleanupSimulation() {
  const users = (await fetchAllAuthUsers()).filter((user) =>
    isSimulationEmail(user.email),
  );
  if (users.length === 0) {
    console.log('삭제할 시뮬레이션 사용자가 없습니다.');
    return;
  }
  const ids = users.map((user) => user.id);
  console.log(`시뮬레이션 사용자 ${ids.length}명과 연결 데이터를 삭제하는 중...`);

  await deleteRowsByIds('campus_request_messages', 'sender_id', ids);
  await deleteRowsByIds('campus_requests', 'created_by', ids);
  await clearReferences('campus_requests', 'handled_by', ids);
  await deleteRowsByIds('campus_transfers', 'sent_by', ids);
  await deleteRowsByIds('campus_transfers', 'confirmed_by', ids);
  await deleteRowsByIds('bus_allocations', 'created_by', ids);
  await clearReferences('payments', 'verified_by', ids);
  await deleteRowsByIds('payments', 'user_id', ids);
  await deleteRowsByIds('reservations', 'user_id', ids);
  await clearReferences('admin_roles', 'granted_by', ids);
  await deleteRowsByIds('admin_roles', 'user_id', ids);
  await deleteRowsByIds('profiles', 'id', ids);
  await mapWithConcurrency(users, async (user) => {
    const { error } = await getClient().auth.admin.deleteUser(user.id);
    if (error) throw new Error(`${user.email} 삭제 실패: ${error.message}`);
  });
}

async function cleanup() {
  assertFullCleanupProjectAllowed();

  if (process.env.SIMULATION_FULL_CLEANUP_CONFIRM !== FULL_CLEANUP_CONFIRMATION) {
    throw new Error(
      `cleanup은 앱 데이터와 전체 관리자가 아닌 Auth 사용자를 삭제합니다. ` +
        `테스트 프로젝트 환경에서 SIMULATION_FULL_CLEANUP_CONFIRM=` +
        `${FULL_CLEANUP_CONFIRMATION}로 설정한 뒤 다시 실행하세요. ` +
        `시뮬레이션 사용자만 삭제하려면 cleanup:simulation을 사용하세요.`,
    );
  }

  const globalAdminRoles = await fetchAllRows(
    'admin_roles',
    'id,user_id',
    (query) => query.eq('role', 'global_admin'),
  );
  const globalAdminUserIds = [
    ...new Set(globalAdminRoles.map((role) => role.user_id)),
  ];
  const globalAdminUserIdSet = new Set(globalAdminUserIds);
  const users = await fetchAllAuthUsers();
  const deletableUsers = users.filter(
    (user) => !globalAdminUserIdSet.has(user.id),
  );
  const deletableUserIds = deletableUsers.map((user) => user.id);

  console.log(
    `앱 데이터와 전체 관리자가 아닌 Auth 사용자 ${deletableUsers.length}명을 삭제하는 중...`,
  );
  console.log(`  보존되는 전체 관리자 계정: ${globalAdminUserIds.length}명`);
  await deleteAllRows('campus_notice_reads', 'user_id');
  await deleteAllRows('campus_request_messages');
  await deleteAllRows('campus_requests');
  await deleteAllRows('campus_transfers');
  await deleteAllRows('bus_allocations');
  await deleteAllRows('payments');
  await deleteAllRows('reservations');
  await deleteAllRows('home_announcements');

  await clearReferences('admin_roles', 'granted_by', deletableUserIds);
  const { count: campusAdminRoleCount, error: campusAdminRoleError } =
    await getClient()
      .from('admin_roles')
      .delete({ count: 'exact' })
      .eq('role', 'campus_admin');
  if (campusAdminRoleError) {
    throw new Error(`캠퍼스 회계 순장님 권한 삭제 실패: ${campusAdminRoleError.message}`);
  }
  console.log(`  admin_roles: campus_admin 권한 ${campusAdminRoleCount ?? 0}건 삭제`);
  await deleteRowsByIds('profiles', 'id', deletableUserIds);

  console.log(
    `  auth.users: 전체 관리자가 아닌 사용자 ${deletableUsers.length}명 삭제 중`,
  );
  await mapWithConcurrency(deletableUsers, async (user) => {
    const { error } = await getClient().auth.admin.deleteUser(user.id);
    if (error) throw new Error(`${user.email} 삭제 실패: ${error.message}`);
  });

  const clearedScope = {
    district_id: null,
    district: null,
    team_id: null,
    team: null,
    campus_id: null,
    campus: null,
    updated_at: new Date().toISOString(),
  };
  await updateRowsByIds(
    'admin_roles',
    'user_id',
    globalAdminUserIds,
    clearedScope,
  );
  await updateRowsByIds('profiles', 'id', globalAdminUserIds, clearedScope);

  await deleteAllRows('stations');
  await deleteAllRows('bus_options');
  await deleteAllRows('campuses');
  await deleteAllRows('teams');
  await deleteAllRows('districts');
  await deleteAllRows('app_settings', 'key');
}

async function runSeed() {
  await cleanupSimulation();
  await seedReferenceData();
  await seedGlobalAdmin();
  await seedAccounts();
  await seedReservations();
  await seedPayments();
  await verify();
}

async function runSettle() {
  await closeReservations();
  await settleTransferReports();
  await settleConfirmation();
  await verifySettlement();
}

function printHelp() {
  console.log(`
CCC 버스 시뮬레이션 실행기

전체 실행:
  npm run simulation -- seed
  npm run simulation -- settle
  npm run simulation -- all

데이터 생성 세부 단계:
  npm run simulation -- cleanup:simulation
  npm run simulation -- seed:reference
  npm run simulation -- seed:global-admin
  npm run simulation -- seed:accounts
  npm run simulation -- seed:reservations
  npm run simulation -- seed:payments
  npm run simulation -- seed:verify

정산 세부 단계:
  npm run simulation -- close
  npm run simulation -- settle:payments
  npm run simulation -- settle:reports
  npm run simulation -- settle:confirm
  npm run simulation -- settle:verify
  npm run simulation -- verify

테스트 프로젝트 전체 정리(전체 관리자 계정과 권한만 보존):
  $env:SIMULATION_FULL_CLEANUP_CONFIRM="DELETE_ALL_TEST_DATA"
  npm run simulation -- cleanup
`);
}

const commands = {
  seed: runSeed,
  'seed:reference': seedReferenceData,
  'seed:global-admin': seedGlobalAdmin,
  'seed:accounts': seedAccounts,
  'seed:reservations': seedReservations,
  'seed:payments': seedPayments,
  'seed:verify': verify,
  close: closeReservations,
  settle: runSettle,
  'settle:payments': settlePayments,
  'settle:reports': settleTransferReports,
  'settle:transfers': settleTransferReports,
  'settle:confirm': settleConfirmation,
  'settle:verify': verifySettlement,
  verify,
  'cleanup:simulation': cleanupSimulation,
  cleanup,
  all: async () => {
    await runSeed();
    await runSettle();
  },
  help: printHelp,
};

async function main() {
  const runner = commands[command];
  if (!runner) {
    printHelp();
    throw new Error(`알 수 없는 시뮬레이션 명령: ${command}`);
  }
  console.log(`시뮬레이션 명령 시작: ${command}`);
  await runner();
  console.log(`시뮬레이션 명령 완료: ${command}`);
}

main().catch((error) => {
  console.error(`오류: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
