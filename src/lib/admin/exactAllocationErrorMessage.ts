const koreanTextPattern = /[가-힣]/;

const exactMessages = new Map<string, string>([
  ['At least one passenger is required.', '배차 계산할 신청자가 한 명 이상 필요합니다.'],
  ['Bus capacity must be positive.', '버스 정원은 1명 이상이어야 합니다.'],
  ['Bus price cannot be negative.', '버스 예상 비용은 0원 이상이어야 합니다.'],
  [
    'Recommended minimum passengers must be positive.',
    '권장 최소 탑승 인원은 1명 이상이어야 합니다.',
  ],
  ['Maximum bus count must be positive.', '최대 버스 대수는 1대 이상이어야 합니다.'],
  ['Every passenger needs a reservation ID.', '모든 신청자에게 신청 ID가 필요합니다.'],
  ['Duplicate bus IDs exist.', '배차 결과에 중복된 버스 ID가 있습니다.'],
  [
    'Reported total bus count does not match physical buses.',
    '배차 결과의 총 버스 대수가 실제 버스 목록과 일치하지 않습니다.',
  ],
  [
    'Reported total bus count exceeds the configured maximum.',
    '배차 결과의 총 버스 대수가 설정된 최대 대수를 초과했습니다.',
  ],
  [
    'Reported total cost does not match bus count and price.',
    '배차 결과의 총비용이 버스 대수와 예상 비용에 맞지 않습니다.',
  ],
  [
    'Assignments do not match the optimization passenger snapshot.',
    '배차 결과의 신청자 목록이 계산 시작 시점의 신청자 목록과 일치하지 않습니다.',
  ],
  ['Every passenger must appear exactly once.', '모든 신청자는 배차 결과에 한 번씩만 포함되어야 합니다.'],
  [
    'Assignment references an unknown passenger or bus.',
    '배차 결과에 알 수 없는 신청자 또는 버스가 포함되어 있습니다.',
  ],
  [
    'Assignment destination does not match its bus destination.',
    '신청자의 배정 행선지가 버스 행선지와 일치하지 않습니다.',
  ],
  ['Reported second-choice count is invalid.', '배차 결과의 2지망 배정 인원이 올바르지 않습니다.'],
  ['Unsupported optimization input schema version.', '배차 계산 입력 데이터 버전을 지원하지 않습니다.'],
  ['Optimization input snapshot is malformed.', '배차 계산 입력 데이터 형식이 올바르지 않습니다.'],
  ['Optimization cancellation was requested.', '배차 계산 취소가 요청되었습니다.'],
  [
    'Optimization job is not pending or does not exist.',
    '대기 중인 배차 계산 작업을 찾을 수 없습니다.',
  ],
  [
    'Another allocation optimization job is already active.',
    '이미 진행 중인 배차 계산이 있습니다. 완료 또는 취소 후 다시 시도해주세요.',
  ],
  [
    'Allocation optimizer configuration is invalid.',
    '배차 계산 설정이 올바르지 않습니다. 버스 옵션을 확인해주세요.',
  ],
  [
    'Allocation optimizer configuration contains invalid numbers.',
    '배차 계산 설정에 올바르지 않은 숫자가 있습니다. 버스 옵션을 확인해주세요.',
  ],
  [
    'No active reservations are available for optimization.',
    '배차 계산할 활성 신청자가 없습니다.',
  ],
  [
    'Allocation optimization execution mode is invalid.',
    '배차 계산 실행 방식이 올바르지 않습니다.',
  ],
  [
    'A completed baseline allocation job is required.',
    '완료된 기본 배차 계산 결과가 필요합니다.',
  ],
  [
    'A completed optimal allocation job is required.',
    '완료된 최적 배차 계산 결과가 필요합니다.',
  ],
  [
    'Detailed allocation skipped phases contain an invalid value.',
    '상세 균형 계산 설정에 올바르지 않은 값이 있습니다.',
  ],
  [
    'Active reservations changed after optimization.',
    '계산 후 신청 정보가 변경되었습니다. 최신 신청 정보를 반영해 다시 계산해주세요.',
  ],
  [
    'Allocation optimizer configuration changed after calculation.',
    '계산 후 버스 설정이 변경되었습니다. 최신 설정으로 다시 계산해주세요.',
  ],
  [
    'An allocation draft already exists for this optimization job.',
    '이 최적해로 생성된 배차안이 이미 있습니다. 기존 배차안을 열어주세요.',
  ],
  [
    'Only OPTIMAL allocation optimization jobs can create drafts.',
    '완료된 최적해에서만 배차안을 생성할 수 있습니다.',
  ],
  [
    'Allocation optimization job not found.',
    '배차안 생성에 사용할 계산 작업을 찾을 수 없습니다.',
  ],
]);

const dynamicMessages: Array<[RegExp, string]> = [
  [
    /No API key found in request/i,
    'Supabase API 키가 요청에 포함되지 않았습니다. 배포 환경의 VITE_SUPABASE_ANON_KEY와 배차 Worker의 SUPABASE_SERVICE_ROLE_KEY 설정을 확인해주세요.',
  ],
  [
    /Invalid API key/i,
    '배차 계산 서버의 Supabase API 키가 올바르지 않습니다. 로컬 Worker를 재설치하거나 Cloud Run Worker의 SUPABASE_SERVICE_ROLE_KEY 설정을 확인해주세요.',
  ],
  [/^Duplicate reservation IDs:/, '중복된 신청 ID가 있습니다. 신청 정보를 확인해주세요.'],
  [/: campus is required\./, '일부 신청자의 캠퍼스 정보가 없습니다.'],
  [/: team is required\./, '일부 신청자의 팀 정보가 없습니다.'],
  [/: first and second choices are required\./, '일부 신청자의 1·2지망 정보가 없습니다.'],
  [/: first and second choices must differ\./, '일부 신청자의 1지망과 2지망이 같습니다.'],
  [/: reported preference rank is invalid\./, '일부 신청자의 지망 순위 결과가 올바르지 않습니다.'],
  [/: assignment is outside preferences\./, '일부 신청자가 선택하지 않은 행선지에 배정되었습니다.'],
  [/: bus capacity does not match the input\./, '배차 결과의 버스 정원이 입력 설정과 일치하지 않습니다.'],
  [/: bus price does not match the input\./, '배차 결과의 버스 비용이 입력 설정과 일치하지 않습니다.'],
  [/: empty buses are not allowed\./, '배차 결과에 탑승자가 없는 버스가 포함되어 있습니다.'],
  [/: bus capacity exceeded\./, '배차 결과에서 버스 정원을 초과했습니다.'],
  [/: passenger list does not match assignments\./, '버스별 신청자 목록과 배정 결과가 일치하지 않습니다.'],
  [/: seat numbers must be contiguous and unique\./, '좌석번호가 중복되었거나 순서대로 배정되지 않았습니다.'],
  [/ phase ended with INFEASIBLE\./, '현재 신청 정보와 배차 조건을 만족하는 결과를 찾을 수 없습니다.'],
  [/ phase ended with /, '배차 계산 단계가 정상적으로 완료되지 않았습니다. 다시 시도해주세요.'],
  [/^Passenger \d+ field .+ must be a string\./, '일부 신청자 정보 형식이 올바르지 않습니다.'],
  [/^Passenger \d+ must be an object\./, '일부 신청자 데이터 형식이 올바르지 않습니다.'],
  [/^Bus field .+ must be an integer\./, '버스 설정의 숫자 형식이 올바르지 않습니다.'],
  [/^Active reservations have invalid allocation data:/, '활성 신청 정보에 배차 계산에 사용할 수 없는 값이 있습니다.'],
  [/^Optimization job entered unexpected status:/, '배차 계산 작업 상태가 변경되어 계산을 계속할 수 없습니다.'],
  [
    /canceling statement due to (lock|statement) timeout/i,
    '다른 배차 작업이 계산 기록을 사용 중입니다. 잠시 후 다시 시도해주세요.',
  ],
  [/^Supabase request failed with HTTP /, '배차 계산 서버와 통신하는 중 오류가 발생했습니다.'],
  [/^Missing required environment variables:/, '배차 계산 서버 설정이 누락되었습니다.'],
  [/^Missing local worker settings:/, '로컬 배차 계산기 설정이 누락되었습니다.'],
];

export const formatExactAllocationErrorMessage = (
  message: string | null | undefined
) => {
  const normalized = message?.trim();
  if (!normalized) return '배차 계산 중 알 수 없는 오류가 발생했습니다.';

  const exactMessage = exactMessages.get(normalized);
  if (exactMessage) return exactMessage;

  const dynamicMessage = dynamicMessages.find(([pattern]) => pattern.test(normalized));
  if (dynamicMessage) return dynamicMessage[1];

  if (koreanTextPattern.test(normalized)) return normalized;

  return '배차 계산 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
};
