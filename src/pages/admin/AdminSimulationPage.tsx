import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  LoaderCircle,
  Play,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import {
  DEFAULT_SIMULATION_REFERENCE_CONFIG,
  getSimulationPreview,
  getSimulationStageRuns,
  runSimulationStage,
  setSimulationEnabled,
  type SimulationPreview,
  type SimulationStageRun,
} from '../../lib/admin/simulationService';
import {
  getSimulationExecutionSnapshot,
  startSimulationExecution,
  subscribeSimulationExecution,
  type SimulationExecutionStage,
} from '../../lib/admin/simulationExecutionService';
import AdminHeader from './AdminHeader';
import styles from './AdminSimulationPage.module.css';

const simulationStages = [
  ['시뮬레이션 정보 초기화', '시뮬레이션용 시험 계정과 모든 운영 자료를 삭제하고, 유지되는 실제 계정의 조직 소속도 초기화합니다.', ['시뮬레이션용 시험 계정 전체 삭제', '모든 신청·입금·배차·요청·공지 삭제', '캠퍼스 회계 순장님 권한 삭제·전체 사용자 조직 소속 초기화', '조직·행선지·버스 옵션·운영 설정 삭제']],
  ['운영 초기값 설정', '서울지구 조직도와 기본 행선지를 등록하고 권장 시뮬레이션 운영 초기값을 생성합니다.', ['서울지구 조직도·기본 행선지 등록', '예상 참여 인원 2,500명 설정', '신청 마감 시각을 실행 시점부터 14일 후로 설정', '44인승 SIM 버스 옵션·요금 설정']],
  ['사용자 및 캠퍼스 회계 순장님 생성', '서울지구 캠퍼스별 비균등 분포와 서울 외 지구 가입자를 포함해 일반 회원을 생성하고, 기존 캠퍼스 회계 순장님 권한은 재사용합니다.', ['다양한 캠퍼스 규모별 실제 로그인 계정 생성', '서울 외 지구 가입자·담당 간사 정보 생성', '권한이 없는 캠퍼스에만 캠퍼스 회계 순장님 생성']],
  ['개별 신청', '시뮬레이션 계정별 1·2지망 신청을 요청 상태로 만들고, 매 10번째 계정은 미신청 상태로 유지합니다.', ['신청 대상 계정의 기존 신청을 요청 상태로 갱신', '기존 확정 버스표 초기화', '매 10번째 계정의 기존 신청·입금 삭제', '행선지 수요 분산']],
  ['개인 입금', '활성 신청 중 일부만 랜덤 입금 처리하거나 전체를 입금 완료 상태로 설정합니다.', ['랜덤 일부 입금·미입금 상태 설정', '전체 입금 완료 상태 설정', '입금 완료 사용자의 캠퍼스 회계 순장님 확인 기록 반영']],
  ['개인 입금·캠퍼스별 송금 완료 보고·본부 확인', '개인 입금 상태를 처리하고, 신청 마감 후 서울지구 신청이 있는 캠퍼스별 송금 보고와 본부 확인을 생성합니다.', ['랜덤 일부 입금·미입금 상태 설정', '전체 입금 완료 상태 설정', '서울 외 지구 신청은 캠퍼스 송금 대상에서 제외', '서울지구 캠퍼스별 송금 보고·본부 확인 생성']],
  ['신청 마감 및 배차 계획 산출 및 확정', '신청 마감은 이 단계에서 실행하고, 배차 계산·편집·확정과 버스표 발급은 배차 화면에서 진행합니다.', ['신청 마감 자동 실행', '배차 화면에서 추천 계산', '배차 화면에서 배차 초안 편집', '배차 화면에서 전체 배차 확정 및 버스표 발급']],
  ['잔여 좌석 신청 및 추가 버스표', '자동 시뮬레이션 실행 없이 잔여 좌석 신청 관리 화면에서 공개·입금 확인·추가 버스표 발급을 진행합니다.', ['잔여 좌석 신청 관리 화면에서 공개 범위 설정', '추가 신청자 입금 확인', '추가 버스표 발급']],
  ['출발·탑승 리허설', '기존 시뮬레이션 탑승 기록을 초기화한 뒤 확정 버스표를 기준으로 탑승 확인·미탑승·탑승 미확인 상태를 재현합니다.', ['기존 시뮬레이션 탑승 상태·이벤트·출발 기록 초기화', '확정 배차안의 모든 호차 출발 기록 생성', '탑승 확인·미탑승·탑승 미확인 상태 반영', '탑승 확인·미탑승 이벤트 생성']],
] as const;

const simulationStageDisplayOrder = [0, 1, 2, 3, 6, 5, 7, 8] as const;

const getSimulationStageDisplayNumber = (stageIndex: number) => {
  const displayIndex = simulationStageDisplayOrder.indexOf(
    stageIndex as (typeof simulationStageDisplayOrder)[number]
  );

  return displayIndex >= 0 ? displayIndex : stageIndex;
};

interface StagePreviewRow {
  label: string;
  value: string;
  note: string;
}

const getStageRunName = (index: number) =>
  index === 0
    ? 'cleanup'
    : index === 1
      ? 'reference'
      : index === 2
        ? 'accounts'
        : index === 3
          ? 'reservations'
          : index === 4
            ? 'payments'
            : index === 5
              ? 'transfers'
              : index === 6
                ? 'deadline'
                : index === 8
                  ? 'boarding'
                  : '';

const getStageIndexFromRunName = (stage: SimulationExecutionStage | null) =>
  stage === 'cleanup'
    ? 0
    : stage === 'reference'
      ? 1
      : stage === 'accounts'
        ? 2
        : stage === 'reservations'
          ? 3
          : stage === 'payments' || stage === 'transfers'
            ? 5
            : stage === 'deadline'
              ? 6
              : stage === 'boarding'
                ? 8
                : null;

const stageActions: Record<number, { label: string; path: string } | undefined> = {
  6: { label: '배차 화면 열기', path: '/admin/allocations' },
  7: { label: '잔여 좌석 신청 관리 열기', path: '/admin/payments/remaining-seats' },
};

const stageReviewActions: Record<number, { label: string; path: string } | undefined> = {
  3: { label: '신청 현황 확인', path: '/admin/applications' },
  5: {
    label: '입금·송금 최종 검토',
    path: '/admin/payments/final-review',
  },
  8: { label: '탑승 관리 열기', path: '/admin/boarding' },
};

const stageSummaryLabels: Record<string, string> = {
  project_id: '실행 프로젝트 ID',
  campus_count: '등록 캠퍼스',
  available_campus_count: '사용 가능 캠퍼스',
  active_station_count: '등록 행선지',
  available_station_count: '사용 가능 행선지',
  bus_option_count: '버스 옵션',
  participation_target: '예상 참여 인원',
  existing_simulation_profile_count: '기존 시험 계정 정보',
  bus_ticket_price: '버스표 가격',
  reservation_deadline_days: '신청 마감까지 기간',
  reservation_deadline_at: '설정된 신청 마감 시각',
  district_transfer_account: '서울지구 송금 계좌',
  campus_labels: '등록 캠퍼스',
  station_names: '등록 행선지',
  created: '운영 초기값 설정 완료',
  checked_at: '확인 완료 시각',
  total_accounts: '총 계정',
  general_users: '일반 회원',
  seoul_users: '서울지구 일반 회원',
  external_users: '서울 외 지구 일반 회원',
  campus_admins: '캠퍼스 회계 순장님',
  multi_campus_admins: '2개 캠퍼스 담당 관리자',
  campus_admin_roles: '캠퍼스 회계 순장님 권한',
  existing_campus_admin_roles: '재사용한 기존 캠퍼스 회계 순장님 권한',
  generated_campus_admin_roles: '생성한 시뮬레이션 캠퍼스 회계 순장님 권한',
  general_user_distribution_range: '캠퍼스별 일반 회원 분포',
  processed: '처리 완료',
  not_applied_total: '미적용 계정',
  active_reservations: '활성 신청',
  deleted_in_batch: '현재 배치 삭제',
  created_in_batch: '현재 배치 생성',
  skipped_in_batch: '현재 배치 기존 계정',
  created_total: '누적 생성',
  completed_in_batch: '현재 배치 입금 완료',
  pending_in_batch: '현재 배치 미입금',
  updated_in_batch: '현재 배치 대기 상태 변경',
  completed_total: '누적 입금 완료',
  pending_total: '누적 미입금',
  updated_total: '누적 대기 상태 변경',
  deadline_closed: '신청 마감',
  completed_payments: '입금 완료 처리',
  verified_payments: '캠퍼스 확인 처리',
  verified_in_batch: '이번 배치 캠퍼스 확인',
  verified_total: '누적 캠퍼스 확인',
  payment_mode: '개인 입금 설정 모드',
  sent_transfers: '송금 보고 처리',
  confirmed_transfers: '본부 확인 완료',
  sent_total_amount: '총 송금액',
  confirmed_ticket_count: '확정 버스표',
  departed_buses: '출발 처리 호차',
  boarded: '탑승 확인',
  no_show: '미탑승',
  unchecked: '탑승 미확인',
  boarding_events: '탑승 이벤트',
  skipped_total: '누적 기존 계정',
  verified_profiles: '최종 프로필 검증',
  verified_external_profiles: '최종 서울 외 지구 프로필 검증',
  verified_campus_admin_roles: '최종 관리자 권한 검증',
  verified_simulation_campus_admin_roles: '최종 시뮬레이션 관리자 권한 검증',
  external_reservations_excluded: '캠퍼스 송금 제외 서울 외 지구 신청',
  recommended_seed_applied: '권장 조직·행선지 반영',
  operation_data_cleanup: '운영 초기값 초기화 결과',
};

const stageSummaryNotes: Record<string, string> = {
  project_id: '허용된 테스트 프로젝트에서 실행됐는지 확인하는 ID',
  campus_count: '서울지구 구조 및 인원에 등록된 캠퍼스 수',
  available_campus_count: '운영 초기값에 등록된 전체 활성 캠퍼스 수',
  active_station_count: '신청 화면에 등록된 기본 행선지 수',
  available_station_count: '운영 초기값에 등록된 전체 활성 행선지 수',
  bus_option_count: '배차 계산에 사용할 SIM 차량 종류 수',
  participation_target: '다음 단계에서 캠퍼스별로 배분할 일반 회원 총원',
  existing_simulation_profile_count: '실행 전에 이미 존재하던 시뮬레이션용 시험 계정 정보 수',
  bus_ticket_price: '시뮬레이션 신청에 적용할 1인 버스표 가격',
  reservation_deadline_days: '1단계 실행 시점부터 신청 마감까지 설정한 일수',
  reservation_deadline_at: '1단계가 실제로 저장한 신청 마감 시각',
  district_transfer_account: '시뮬레이션 송금 흐름에 사용할 테스트 전용 서울지구 계좌',
  campus_labels: '1단계에서 서울지구 구조 및 인원에 등록한 캠퍼스 목록',
  general_user_distribution_range: '다양한 규모군을 적용한 캠퍼스별 최소~최대 일반 회원 수',
  station_names: '1단계에서 등록한 기본 행선지 목록',
  created: '예상 참여 인원·버스 옵션·요금 설정 생성 여부',
  active_reservations: '신청 마감 처리 당시 요청 또는 확정 상태 신청 수',
  not_applied_total: '이번 실행에서 새 행을 만들지 않은 처리 대상 수',
  recommended_seed_applied: '권장 서울지구 조직과 기본 행선지를 등록했는지 여부',
  checked_at: '운영 초기값 설정과 확인을 마친 서버 시각',
  operation_data_cleanup: '신청·입금·배차·요청·공지·조직·행선지·버스 옵션·운영 설정 삭제 건수',
};

const cleanupResultLabels: Record<string, string> = {
  campusNoticeReads: '공지 읽음 기록',
  campusRequestMessages: '캠퍼스 요청 메시지',
  campusRequests: '캠퍼스 요청',
  campusTransfers: '캠퍼스 송금 보고',
  busAllocations: '배차 자료',
  payments: '입금 자료',
  reservations: '신청 자료',
  homeAnnouncements: '홈 화면 공지',
  stations: '행선지',
  busOptions: '버스 옵션',
  appSettings: '운영 설정',
  campusAdminRoles: '캠퍼스 회계 순장님 권한',
  organization: '조직 구조',
};

const cleanupResultNotes: Record<string, string> = {
  campusNoticeReads: '사용자별 공지 확인 기록',
  campusRequestMessages: '캠퍼스 문의에 연결된 메시지',
  campusRequests: '캠퍼스 문의 및 처리 기록',
  campusTransfers: '캠퍼스별 송금 보고 및 확인 기록',
  busAllocations: '임시·확정 배차 결과',
  payments: '신청자별 입금 및 확인 기록',
  reservations: '신청·확정·취소 신청',
  homeAnnouncements: '홈 화면 공지',
  stations: '신청 화면의 행선지 정보',
  busOptions: '배차 계산용 차량 옵션',
  appSettings: '시뮬레이션 실행 잠금을 제외한 앱 설정',
  campusAdminRoles: '캠퍼스 회계 순장님 권한',
  organization: '지구·팀·캠퍼스',
};

const getCleanupOperationEntries = (summary: Record<string, unknown>) => {
  const cleanup = summary.operation_data_cleanup;
  if (!cleanup || typeof cleanup !== 'object' || Array.isArray(cleanup)) return [];

  return Object.entries(cleanup as Record<string, unknown>)
    .filter(([key, value]) => key in cleanupResultLabels && Number.isFinite(Number(value)))
    .map(([key, value]) => ({
      key,
      count: Number(value),
      label: cleanupResultLabels[key],
      note: cleanupResultNotes[key],
    }));
};

const referenceResultGuide = [
  {
    title: '구조 및 인원',
    description: '서울지구 7개 팀·47개 캠퍼스 구조와 캠퍼스별 예상 참여 인원을 등록합니다.',
  },
  {
    title: '행선지',
    description: '신청자가 희망 행선지로 선택할 기본 행선지 7개를 등록합니다.',
  },
  {
    title: '서울지구 송금 계좌',
    description: '입금 및 송금 흐름 확인을 위한 시뮬레이션 전용 테스트 계좌를 설정합니다.',
  },
  {
    title: '버스 옵션 및 요금',
    description: '44인승·70만원 버스 옵션과 1인 버스표 가격 2만원을 설정합니다.',
  },
] as const;

const setupRequirementGuides: Record<string, string> = {
  '사용 캠퍼스 범위':
    '1단계 운영 초기값 설정에서 시뮬레이션에 사용할 캠퍼스 수를 입력하고 실행하세요.',
  '사용 행선지 범위':
    '1단계 운영 초기값 설정에서 시뮬레이션에 사용할 행선지 수를 입력하고 실행하세요.',
  '활성 캠퍼스':
    '조직 설정에서 지구·팀·캠퍼스를 등록한 뒤 미리보기를 새로고침하세요.',
  '활성 행선지':
    '행선지 설정에서 신청에 사용할 행선지를 등록하고 활성화하세요.',
  'SIM 버스 옵션':
    '1단계 운영 초기값 설정을 실행해 배차 계산용 SIM 버스 옵션을 생성하세요.',
  '버스표 가격':
    '1단계 운영 초기값 설정에서 1인 버스표 가격을 입력하고 실행하세요.',
  '서울지구 송금 계좌':
    '1단계 운영 초기값 설정을 실행해 시뮬레이션 전용 서울지구 송금 계좌를 설정하세요.',
  '예상 참여 인원 2,000명':
    '1단계 운영 초기값 설정에서 예상 참여 인원를 2,000명 이상으로 입력하고 실행하세요.',
  '시나리오 체크리스트':
    '1단계 운영 초기값 설정을 실행해 운영 시나리오 체크리스트를 초기화하세요.',
};

const formatStageSummaryValue = (key: string, value: unknown) => {
  if (typeof value === 'number') {
    const unit =
      key === 'campus_count' ||
      key === 'available_campus_count' ||
      key === 'active_station_count' ||
      key === 'available_station_count' ||
      key === 'bus_option_count'
        ? '개'
        : key === 'participation_target'
          ? '명'
          : key === 'reservation_deadline_days'
            ? '일'
          : key === 'existing_simulation_profile_count'
            ? '개'
            : key === 'bus_ticket_price'
              ? '원'
              : '';
    return `${value.toLocaleString()}${unit}`;
  }
  if (typeof value === 'boolean') return value ? '예' : '아니오';
  if (Array.isArray(value)) return `${value.length.toLocaleString()}개 항목`;
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  if (
    (key === 'checked_at' || key === 'reservation_deadline_at') &&
    typeof value === 'string'
  ) {
    return new Date(value).toLocaleString();
  }
  return String(value ?? '-');
};

const hiddenStageSummaryKeys = new Set([
  'campus_ids',
  'station_ids',
  'last_reservation_id',
]);

const getLatestStageRun = (index: number, stageRuns: SimulationStageRun[]) =>
  stageRuns.find((run) =>
    index === 5
      ? run.stage === 'payments' || run.stage === 'transfers'
      : run.stage === getStageRunName(index)
  );

const formatRunStatus = (status: SimulationStageRun['status']) =>
  status === 'completed' ? '완료' : status === 'failed' ? '실패' : '실행 중';

const buildStagePreview = (
  index: number,
  preview: SimulationPreview | null,
  stageRuns: SimulationStageRun[],
  referenceConfig = DEFAULT_SIMULATION_REFERENCE_CONFIG
) => {
  const totalAccounts = preview?.totalAccountCount ?? 0;
  const operation = preview?.operation;
  const latestRun = getLatestStageRun(index, stageRuns);
  const common = {
    label: `${getSimulationStageDisplayNumber(index)}단계 미리보기`,
    title: simulationStages[index][0],
    description: simulationStages[index][1],
    status: '실행 전 안내',
  };

  if (index === 0) {
    return {
      ...common,
      status: '초기화 범위 확인',
      metrics: [
        ['삭제 대상 계정', `${(preview?.existingSimulationProfileCount ?? 0).toLocaleString()}개`],
        ['초기화 후 상태', '재설정 필요'],
        ['운영 초기값', '전체 삭제'],
        ['최근 실행', latestRun ? formatRunStatus(latestRun.status) : '미실행'],
      ],
      rows: [
        { label: '시뮬레이션 계정', value: '전체 삭제', note: '연결된 프로필·신청·입금·권한 포함' },
        { label: '실제 계정', value: '계정 유지·조직 소속 초기화', note: '프로필의 지구·팀·캠퍼스 정보는 비워짐' },
        { label: '캠퍼스 회계 순장님 권한', value: '전체 삭제', note: '실제 계정에 부여된 권한도 포함' },
        { label: '운영 데이터', value: '전체 정리', note: '모든 신청·입금·문의·송금·배차·공지 포함' },
        { label: '운영 초기값', value: '전체 삭제', note: '조직·캠퍼스·행선지·버스 옵션·운영 설정' },
        { label: '초기화 후 상태', value: '1단계 실행 필요', note: '운영 초기값 설정으로 조직·행선지·설정을 다시 등록' },
      ] satisfies StagePreviewRow[],
    };
  }

  if (index === 1) {
    return {
      ...common,
      status: '권장 초기값 적용 예정',
      metrics: [
        ['사용 캠퍼스', `${referenceConfig.campusCount.toLocaleString()}개`],
        ['사용 행선지', `${referenceConfig.stationCount.toLocaleString()}개`],
        ['버스 옵션', `${referenceConfig.busOptions.length.toLocaleString()}개`],
        ['예상 참여 인원', `${referenceConfig.participationTarget.toLocaleString()}명`],
        ['신청 마감', '실행 시점부터 14일 후'],
      ],
      rows: [
        {
          label: '현재 기초 세팅',
          value: preview?.referenceSetup.isReady ? '완료' : '미완료',
          note: preview?.referenceSetup.missing.length
            ? `필요 항목: ${preview.referenceSetup.missing.join(', ')}`
            : '예상 참여 인원·SIM 버스 옵션·요금·신청 설정 확인 완료',
        },
        {
          label: '실행 시 변경',
          value: '권장 초기값으로 재설정',
          note: '기존 SIM 버스 옵션과 시뮬레이션 사용 범위·참여 목표·신청 마감 설정을 덮어씀',
        },
      ] satisfies StagePreviewRow[],
    };
  }

  if (index === 2) {
    const accountReferenceConfig = preview?.referenceConfig ?? referenceConfig;
    const selectedCampusIdSet = new Set(accountReferenceConfig.selectedCampusIds);
    const selectedCampuses = (preview?.campuses ?? []).filter((campus) =>
      selectedCampusIdSet.has(campus.campusId)
    );
    const selectedSeoulUsers = selectedCampuses.reduce(
      (sum, campus) => sum + campus.generalUserCount,
      0
    );
    const externalUsers = preview?.externalUserCount ?? 0;
    const selectedGeneralUsers = selectedSeoulUsers + externalUsers;
    const uncoveredCampusCount = selectedCampuses.filter(
      (campus) => campus.campusAdminCount > 0
    ).length;
    const selectedCampusAdmins =
      uncoveredCampusCount - Math.min(5, Math.floor(uncoveredCampusCount / 2));
    const selectedTotalAccounts = selectedGeneralUsers + selectedCampusAdmins;
    const selectedCounts = selectedCampuses.map((campus) => campus.generalUserCount);
    const selectedDistributionRange = selectedCounts.length
      ? `${Math.min(...selectedCounts).toLocaleString()}~${Math.max(...selectedCounts).toLocaleString()}명`
      : '0명';
    return {
      ...common,
      status: preview?.referenceSetup.isReady ? '계정 생성 예정' : '기초 세팅 필요',
      metrics: [
        ['서울지구 일반 회원', `${selectedSeoulUsers.toLocaleString()}명`],
        ['서울 외 지구 일반 회원', `${externalUsers.toLocaleString()}명`],
        ['캠퍼스 회계 순장님', `${selectedCampusAdmins.toLocaleString()}명`],
        ['총 실제 계정', `${selectedTotalAccounts.toLocaleString()}개`],
      ],
      rows: [
        {
          label: '서울 외 지구 가입자',
          value: `${externalUsers.toLocaleString()}명`,
          note: '등록 조직 외 지구·캠퍼스와 담당 간사 정보 포함',
        },
        ...selectedCampuses.map((campus) => ({
          label: `${campus.team} · ${campus.campus}`,
          value: `${campus.generalUserCount.toLocaleString()}명`,
          note: campus.campusAdminCount > 0
            ? `시뮬레이션 캠퍼스 회계 순장님 생성 필요 · 캠퍼스 분포 ${selectedDistributionRange}`
            : `기존 캠퍼스 회계 순장님 권한 재사용 · 캠퍼스 분포 ${selectedDistributionRange}`,
        })),
      ],
    };
  }

  const expectedReservationCount = Math.max(
    0,
    totalAccounts - Math.floor(totalAccounts / 10)
  );
  const activeReservationCount =
    (operation?.reservations.requested ?? 0) +
    (operation?.reservations.confirmed ?? 0);
  const completedPaymentCount = operation?.payments.completed ?? 0;
  const verifiedPaymentCount = operation?.payments.verified ?? 0;
  const laterStages = [
    {
      status:
        (operation?.reservations.total ?? 0) >= expectedReservationCount &&
        expectedReservationCount > 0
          ? '예상 신청 수 충족'
          : (operation?.reservations.total ?? 0) > 0
            ? '일부 신청만 존재'
            : '미신청',
      metrics: [
        ['현재 신청', `${(operation?.reservations.total ?? 0).toLocaleString()}건`],
        ['실행 시 예상 신청', `${expectedReservationCount.toLocaleString()}건`],
        ['요청 신청', `${(operation?.reservations.requested ?? 0).toLocaleString()}건`],
        ['미신청 유지', `${Math.floor(totalAccounts / 10).toLocaleString()}개 계정`],
      ],
      rows: [
        { label: '신청 상태', value: `요청 ${(operation?.reservations.requested ?? 0).toLocaleString()} / 확정 ${(operation?.reservations.confirmed ?? 0).toLocaleString()} / 취소 ${(operation?.reservations.cancelled ?? 0).toLocaleString()}`, note: '실제 reservations 테이블 기준' },
        { label: '신청 대상', value: `${totalAccounts.toLocaleString()}개 시뮬레이션 계정`, note: '일반 회원과 생성한 시뮬레이션 캠퍼스 회계 순장님 계정 포함' },
        { label: '실행 시 변경', value: '신청 재생성·정리', note: '신청 대상은 요청 상태와 새 1·2지망으로 갱신하고, 매 10번째 계정은 기존 신청·입금을 삭제' },
        { label: '확정 버스표', value: '신청 대상 계정 초기화', note: '재생성되는 신청의 기존 확정 버스표를 제거' },
      ],
    },
    {
      status:
        activeReservationCount > 0 &&
        completedPaymentCount >= activeReservationCount &&
        verifiedPaymentCount >= activeReservationCount
          ? '개인 입금 완료'
          : activeReservationCount > 0
            ? '미입금 사용자 있음'
            : '개별 신청 필요',
      metrics: [
        ['활성 신청', `${activeReservationCount.toLocaleString()}건`],
        ['입금 완료', `${completedPaymentCount.toLocaleString()}건`],
        ['입금 대기', `${(operation?.payments.pending ?? 0).toLocaleString()}건`],
        ['미입금 추정', `${Math.max(0, activeReservationCount - completedPaymentCount).toLocaleString()}건`],
      ],
      rows: [
        { label: '개인 입금 상태', value: `완료 ${(operation?.payments.completed ?? 0).toLocaleString()} / 대기 ${(operation?.payments.pending ?? 0).toLocaleString()}`, note: '랜덤 일부 입금 또는 전체 입금 완료 중 선택' },
        { label: '처리 대상', value: `${activeReservationCount.toLocaleString()}건`, note: '요청 또는 확정 상태인 모든 활성 신청' },
        { label: '랜덤 일부 입금', value: '입금 완료·미입금 혼합', note: '최소 1건은 입금 완료, 최소 1건은 미입금 상태로 유지' },
        { label: '전체 입금 완료', value: '모든 활성 신청 완료·확인', note: '입금 완료 대상에는 담당 캠퍼스 회계 순장님 또는 전체 관리자 확인 기록도 함께 반영' },
      ],
    },
    {
      status:
        (operation?.transfers.confirmed ?? 0) > 0
          ? '입금·송금·본부 확인 완료'
          : !operation?.deadlineClosed
            ? '신청 마감 필요'
            : activeReservationCount > 0 &&
                completedPaymentCount >= activeReservationCount &&
                verifiedPaymentCount >= activeReservationCount
              ? '송금·본부 확인 필요'
              : activeReservationCount > 0
                ? '미입금 사용자 있음'
                : '개인 입금 필요',
      metrics: [
        ['신청 마감', operation?.deadlineClosed ? '마감됨' : '마감 필요'],
        ['활성 신청', `${activeReservationCount.toLocaleString()}건`],
        ['입금 확인', `${verifiedPaymentCount.toLocaleString()}건`],
        ['본부 확인', `${(operation?.transfers.confirmed ?? 0).toLocaleString()}건`],
      ],
      rows: [
        { label: '개인 입금 상태', value: `완료 ${(operation?.payments.completed ?? 0).toLocaleString()} / 대기 ${(operation?.payments.pending ?? 0).toLocaleString()}`, note: '랜덤 일부 입금 또는 전체 입금 완료 중 선택' },
        { label: '캠퍼스 입금 확인', value: `${(operation?.payments.verified ?? 0).toLocaleString()}건`, note: 'verified_at이 기록된 실제 입금' },
        { label: '캠퍼스 송금 처리', value: `송금 ${(operation?.transfers.sent ?? 0).toLocaleString()} / 본부 확인 ${(operation?.transfers.confirmed ?? 0).toLocaleString()}`, note: '서울지구 활성 신청이 있는 캠퍼스 범위별로 생성' },
        { label: '서울 외 지구 신청', value: '캠퍼스 송금 대상 제외', note: '개인 입금 상태에는 포함되지만 서울지구 캠퍼스 송금 보고에는 포함하지 않음' },
      ],
    },
    {
      status:
        !operation?.deadlineClosed
          ? '신청 마감 필요'
          : (operation?.allocations.confirmed ?? 0) > 0
            ? '배차 확정됨'
            : (operation?.allocations.draft ?? 0) > 0
              ? '배차 초안 있음'
              : '미배차',
      metrics: [
        ['신청 마감', operation?.deadlineClosed ? '마감됨' : '진행 중'],
        ['배차 초안', `${(operation?.allocations.draft ?? 0).toLocaleString()}건`],
        ['확정 배차안', `${(operation?.allocations.confirmed ?? 0).toLocaleString()}건`],
        ['확정 차량', `${(operation?.allocations.confirmedBuses ?? 0).toLocaleString()}대`],
      ],
      rows: [
        { label: '자동 실행 범위', value: '신청 마감만 처리', note: '활성 실제 사용자 신청이 있으면 안전을 위해 자동 마감을 중단' },
        { label: '배차 계획', value: '배차 화면에서 진행', note: '추천 계산·임시안 편집·확정·버스표 발급은 자동 실행하지 않음' },
        { label: '신청 마감 일시', value: operation?.deadlineAt ? new Date(operation.deadlineAt).toLocaleString() : '설정 없음', note: '신청 마감 후 배차안을 산출할 수 있음' },
        { label: '확정 좌석 용량', value: `${(operation?.allocations.confirmedCapacity ?? 0).toLocaleString()}석`, note: '확정 배차안 차량 정원 합계' },
        { label: '배정 탑승자', value: `${(operation?.allocations.confirmedPassengers ?? 0).toLocaleString()}명`, note: '확정 배차안 passengers 기준' },
        { label: '버스표 일치', value: `${(operation?.reservations.ticketed ?? 0).toLocaleString()}건`, note: 'confirmed_ticket이 발급된 실제 신청' },
      ],
    },
    {
      status:
        (operation?.allocations.confirmed ?? 0) === 0
          ? '확정 배차 필요'
          : (operation?.allocations.remainingSeats ?? 0) > 0
            ? '신청 가능'
            : '잔여 좌석 없음',
      metrics: [
        ['확정 좌석', `${(operation?.allocations.confirmedCapacity ?? 0).toLocaleString()}석`],
        ['배정 인원', `${(operation?.allocations.confirmedPassengers ?? 0).toLocaleString()}명`],
        ['잔여 좌석', `${(operation?.allocations.remainingSeats ?? 0).toLocaleString()}석`],
        ['발급 버스표', `${(operation?.reservations.ticketed ?? 0).toLocaleString()}건`],
      ],
      rows: [
        { label: '자동 실행', value: '없음', note: '잔여 좌석 신청 관리 화면에서 관리자가 직접 진행' },
        { label: '신청 전제', value: operation?.deadlineClosed ? '신청 마감 완료' : '신청 마감 필요', note: '마감 후 확정 배차가 있어야 잔여 좌석 신청 가능' },
        { label: '현재 신청 가능 좌석', value: `${(operation?.allocations.remainingSeats ?? 0).toLocaleString()}석`, note: '확정 정원에서 배정 탑승자를 뺀 값' },
        { label: '신청 검증', value: '원자적 좌석 배정', note: '좌석 중복과 정원 초과 신청을 DB 함수에서 차단' },
      ],
    },
    {
      status:
        (operation?.boarding.boarded ?? 0) + (operation?.boarding.noShow ?? 0) > 0
          ? '탑승 리허설 완료'
          : (operation?.reservations.ticketed ?? 0) > 0
            ? '탑승 리허설 준비'
            : '확정 버스표 필요',
      metrics: [
        ['발급 버스표', `${(operation?.reservations.ticketed ?? 0).toLocaleString()}건`],
        ['탑승 확인', `${(operation?.boarding.boarded ?? 0).toLocaleString()}명`],
        ['미탑승', `${(operation?.boarding.noShow ?? 0).toLocaleString()}명`],
        ['탑승 미확인', `${(operation?.boarding.unchecked ?? 0).toLocaleString()}명`],
      ],
      rows: [
        { label: '탑승 상태', value: `탑승 확인 ${(operation?.boarding.boarded ?? 0).toLocaleString()} / 미탑승 ${(operation?.boarding.noShow ?? 0).toLocaleString()} / 탑승 미확인 ${(operation?.boarding.unchecked ?? 0).toLocaleString()}`, note: '확정 버스표가 있는 신청 기준' },
        { label: '실행 전 초기화', value: '기존 시뮬레이션 탑승 기록 삭제', note: '탑승 상태·탑승 이벤트·현재 확정 배차안의 출발 기록을 다시 생성' },
        { label: '탑승 이벤트', value: `${(operation?.boarding.events ?? 0).toLocaleString()}건`, note: '탑승 확인과 미탑승 상태 변경 이력' },
        { label: '운영 확인 화면', value: '탑승 관리', note: '호차별 탑승 명단과 출발 상태를 최종 확인' },
      ],
    },
  ];

  const laterStagePreviewIndex = [0, 1, 2, 3, 4, 5][index - 3];
  return { ...common, ...laterStages[laterStagePreviewIndex] };
};

const buildStageResultPreview = (
  index: number,
  preview: SimulationPreview | null,
  stageRuns: SimulationStageRun[]
) => {
  const run = getLatestStageRun(index, stageRuns);
  const before = buildStagePreview(index, preview, stageRuns);

  if (!run) {
    return {
      ...before,
      label: `${getSimulationStageDisplayNumber(index)}단계 최근 실행 결과`,
      status: '실행 기록 없음',
      metrics: [
        ['실행 상태', '미실행'],
        ['실행 결과', '아직 없음'],
      ],
      rows: [
        {
          label: '실행 후 결과',
          value: '아직 실행되지 않음',
          note: '단계를 실행하면 실제 처리 결과가 여기에 표시됩니다.',
        },
      ],
    };
  }

  const summary = run.summary ?? {};
  const cleanupEntries = index === 0 ? getCleanupOperationEntries(summary) : [];
  const cleanupDeletedTotal = cleanupEntries.reduce(
    (total, entry) => total + entry.count,
    0
  );
  const cleanupRows = cleanupEntries.map((entry) => ({
    label: entry.label,
    value: `${entry.count.toLocaleString()}건 삭제`,
    note: entry.note,
  }));
  const summaryRows = Object.entries(summary)
    .filter(([key]) => !hiddenStageSummaryKeys.has(key))
    .map(([key, value]) => ({
      label: stageSummaryLabels[key] ?? key.replaceAll('_', ' '),
      value: formatStageSummaryValue(key, value),
      note: stageSummaryNotes[key] ?? '서버 실행 결과',
    }));
  const metricEntries = summaryRows.slice(0, 4).map((row) => [
    row.label,
    row.value,
  ]);
  const referenceMetricKeys = [
    'campus_count',
    'active_station_count',
    'bus_option_count',
    'participation_target',
  ];
  const referenceMetricEntries = referenceMetricKeys
    .filter((key) => key in summary)
    .map((key) => {
      const row = summaryRows.find((item) => item.label === stageSummaryLabels[key]);
      return [stageSummaryLabels[key], row?.value ?? '-'];
    });

  return {
    ...before,
    label: `${getSimulationStageDisplayNumber(index)}단계 최근 실행 결과`,
    status:
      index === 0 && run.status === 'completed'
        ? '초기화 완료'
        : formatRunStatus(run.status),
    metrics:
      index === 0
        ? [
            ['실행 상태', run.status === 'completed' ? '초기화 완료' : run.status],
            ['삭제한 시험 계정', `${Number(summary.deleted ?? 0).toLocaleString()}개`],
            ['삭제한 운영 자료', `${cleanupDeletedTotal.toLocaleString()}건`],
            ['남은 시험 계정', `${Number(summary.remaining ?? 0).toLocaleString()}개`],
          ]
        : index === 1 && referenceMetricEntries.length > 0
        ? referenceMetricEntries
        : metricEntries.length > 0
        ? metricEntries
        : [
            ['실행 상태', run.status],
            ['완료 시각', run.completed_at ? new Date(run.completed_at).toLocaleString() : '-'],
          ],
    rows:
      index === 0 && cleanupRows.length > 0
        ? cleanupRows
        : summaryRows.length > 0
        ? summaryRows
        : [
            {
              label: '실행 결과',
              value: run.status,
              note: run.error_message ?? '서버 실행 기록이 저장되었습니다.',
            },
          ],
  };
};

const AdminSimulationPage = () => {
  const navigate = useNavigate();
  const [preview, setPreview] = useState<SimulationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedStageIndex, setExpandedStageIndex] = useState(-1);
  const [stageRuns, setStageRuns] = useState<SimulationStageRun[]>([]);
  const [fallbackRunningStageIndex, setRunningStageIndex] = useState<number | null>(
    null
  );
  const [actionMessage, setRunMessage] = useState<string | null>(null);
  const [updatingSafety, setUpdatingSafety] = useState(false);
  const safetyDisableInFlightRef = useRef(false);
  const [disableSafetyDialogOpen, setDisableSafetyDialogOpen] = useState(false);
  const [disableSafetyError, setDisableSafetyError] = useState<string | null>(
    null
  );
  const [previewMode, setPreviewMode] = useState<'before' | 'after'>('before');
  const referenceConfig = DEFAULT_SIMULATION_REFERENCE_CONFIG;
  const executionState = useSyncExternalStore(
    subscribeSimulationExecution,
    getSimulationExecutionSnapshot,
    getSimulationExecutionSnapshot
  );
  const runningStageIndex =
    executionState.status === 'running'
      ? getStageIndexFromRunName(executionState.stage)
      : fallbackRunningStageIndex;
  const runMessage = actionMessage ?? executionState.message;

  const loadPreview = async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextPreview, runs] = await Promise.all([
        getSimulationPreview(),
        getSimulationStageRuns(),
      ]);
      setPreview(nextPreview);
      setStageRuns(runs);
    } catch (loadError) {
      console.error('Failed to load simulation preview:', loadError);
      setError(loadError instanceof Error ? loadError.message : '시뮬레이션 미리보기를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadPreview();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, []);

  const distributionRange = useMemo(() => {
    const selectedCampusIdSet = new Set(
      preview?.referenceConfig.selectedCampusIds ?? []
    );
    const counts =
      preview?.campuses
        .filter(
          (campus) =>
            selectedCampusIdSet.size === 0 || selectedCampusIdSet.has(campus.campusId)
        )
        .map((campus) => campus.generalUserCount) ?? [];
    return { min: counts.length ? Math.min(...counts) : 0, max: counts.length ? Math.max(...counts) : 0 };
  }, [preview]);
  const latestCleanupRun = getLatestStageRun(0, stageRuns);
  const latestReferenceSummary = getLatestStageRun(1, stageRuns)?.summary ?? {};
  const latestReferenceCampusLabels = Array.isArray(
    latestReferenceSummary.campus_labels
  )
    ? latestReferenceSummary.campus_labels.filter(
        (value): value is string => typeof value === 'string'
      )
    : [];
  const latestReferenceStationNames = Array.isArray(
    latestReferenceSummary.station_names
  )
    ? latestReferenceSummary.station_names.filter(
        (value): value is string => typeof value === 'string'
      )
    : [];
  const latestReferenceBusOptions = Array.isArray(latestReferenceSummary.bus_options)
    ? latestReferenceSummary.bus_options.flatMap((value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
        const option = value as Record<string, unknown>;
        const capacity = Number(option.capacity);
        const estimatedPrice = Number(option.estimatedPrice);
        return Number.isFinite(capacity) && Number.isFinite(estimatedPrice)
          ? [{ capacity, estimatedPrice }]
          : [];
      })
    : [];
  const accountsStageUnlocked = preview?.referenceSetup.isReady ?? false;
  const reservationsStageUnlocked =
    (preview?.existingSimulationProfileCount ?? 0) > 0;
  const activeReservationCount =
    (preview?.operation.reservations.requested ?? 0) +
    (preview?.operation.reservations.confirmed ?? 0);
  const paymentsStageUnlocked = activeReservationCount > 0;
  const unpaidIndividualCount = Math.max(
    0,
    activeReservationCount - (preview?.operation.payments.completed ?? 0)
  );
  const allPaymentsCompleted =
    (preview?.operation.payments.total ?? 0) > 0 &&
    preview?.operation.payments.total === activeReservationCount &&
    preview?.operation.payments.completed === activeReservationCount &&
    preview?.operation.payments.verified === activeReservationCount;
  const remainingSeatStageUnlocked =
    (preview?.operation.allocations.confirmed ?? 0) > 0;
  const boardingStageUnlocked =
    (preview?.operation.reservations.ticketed ?? 0) > 0;
  const getStageDisabledReason = (index: number) => {
    if (index > 8) return stageActions[index] ? null : '아직 실행 기능이 구현되지 않은 단계입니다.';
    if (!preview) return '시뮬레이션 상태를 불러온 뒤 실행할 수 있습니다.';
    if (!preview.safety.projectIdMatches) {
      return '허용된 테스트 Supabase 프로젝트에서만 실행할 수 있습니다.';
    }
    if (!preview.safety.simulationEnabled) {
      return '상단의 실행 잠금에서 시뮬레이션 실행을 활성화해야 합니다.';
    }
    if (runningStageIndex !== null) {
      return runningStageIndex === index
        ? '현재 이 단계를 실행하고 있습니다.'
        : `${getSimulationStageDisplayNumber(runningStageIndex)}단계를 실행 중이므로 완료될 때까지 기다려주세요.`;
    }
    if (index === 2 && !accountsStageUnlocked) {
      return `운영 초기값이 부족합니다: ${preview.referenceSetup.missing.join(', ') || '1단계 실행 필요'}`;
    }
    if (index === 3 && !reservationsStageUnlocked) {
      return '신청을 만들 시뮬레이션 계정이 없습니다. 2단계를 먼저 실행하세요.';
    }
    if (index === 5 && !paymentsStageUnlocked) {
      return '입금 상태를 설정할 요청 또는 확정 상태의 활성 신청이 없습니다. 3단계를 먼저 실행하세요.';
    }
    if (index === 6 && activeReservationCount === 0) {
      return '마감하고 배차할 요청 또는 확정 상태의 활성 신청이 없습니다. 3단계를 먼저 실행하세요.';
    }
    if (index === 7 && !remainingSeatStageUnlocked) {
      return `확정된 배차안이 없습니다. ${getSimulationStageDisplayNumber(6)}단계 배차 화면에서 배차안을 확정하세요.`;
    }
    if (index === 8 && !boardingStageUnlocked) {
      return `확정 버스표가 없습니다. ${getSimulationStageDisplayNumber(6)}단계 배차 화면에서 전체 배차를 확정하세요.`;
    }
    return null;
  };

  const handleRunStage = async (index: number, paymentMode?: 'random' | 'all') => {
    if (index > 8 || index === 7) return;

    if (index === 0) {
      const confirmation = window.prompt(
        '시뮬레이션용 시험 계정과 모든 운영 자료를 삭제합니다.\n모든 신청·입금·배차·요청·공지와 조직·캠퍼스·행선지·버스 옵션·운영 설정이 삭제됩니다.\n\n삭제 후에는 1단계를 실행해 서울지구 조직도와 기본 행선지, 운영 초기값을 자동 등록해야 합니다.\n계속하려면 "시뮬레이션 초기화"를 입력하세요.'
      );
      if (confirmation?.trim() !== '시뮬레이션 초기화') return;
    }

    setRunMessage(null);
    const stage: SimulationExecutionStage =
      index === 0
        ? 'cleanup'
        : index === 1
          ? 'reference'
          : index === 2
            ? 'accounts'
            : index === 3
              ? 'reservations'
              : index === 5 && paymentMode
                ? 'payments'
                : index === 5
                  ? 'transfers'
                  : index === 6
                    ? 'deadline'
                    : 'boarding';
    const executionResult = await startSimulationExecution({
      stage,
      paymentMode,
      referenceConfig,
      userCount: preview?.generalUserCount ?? 2000,
    });

    // Keep the existing inline runner only as a fallback for an unexpected idle result.
    if (executionResult.status !== 'idle') {
      try {
        const [nextPreview, runs] = await Promise.all([
          getSimulationPreview(),
          getSimulationStageRuns(),
        ]);
        setPreview(nextPreview);
        setStageRuns(runs);
        if (executionResult.status === 'completed') setPreviewMode('after');
      } catch (refreshError) {
        console.error('Failed to refresh simulation result:', refreshError);
      }
      return;
    }

    setRunningStageIndex(index);
    setRunMessage(null);
    try {
      if (index === 0) {
        let runId: string | undefined;
        let done = false;

        while (!done) {
          const run = await runSimulationStage('cleanup', {
            runId,
            batchSize: 100,
          });
          runId = run.id;
          done = run.done;
          const deleted = Number(run.summary.deleted ?? 0);
          const remaining = Number(run.summary.remaining ?? 0);
          setRunMessage(
            `시뮬레이션 정보 초기화 중: ${deleted.toLocaleString()}개 계정 삭제, ${remaining.toLocaleString()}개 남음`
          );
        }

        setStageRuns(await getSimulationStageRuns());
        setRunMessage(`${getSimulationStageDisplayNumber(0)}단계 시뮬레이션 정보 초기화가 완료되었습니다.`);
      } else if (index === 1) {
        const run = await runSimulationStage('reference', { referenceConfig });
        setStageRuns((current) => [run, ...current]);
        setRunMessage(`${getSimulationStageDisplayNumber(1)}단계 운영 초기값 설정을 완료했습니다.`);
      } else if (index === 2) {
        let offset = 0;
        let runId: string | undefined;
        let done = false;

        while (!done) {
          const run = await runSimulationStage('accounts', {
            runId,
            offset,
            batchSize: 100,
            userCount: preview?.generalUserCount ?? 2000,
          });
          runId = run.id;
          offset = run.next_offset ?? offset;
          done = run.done;
          const total = Number(run.summary.total_accounts ?? 0);
          const processed = Number(run.summary.processed ?? offset);
          setRunMessage(
            `실제 로그인 계정 생성 중: ${processed.toLocaleString()} / ${total.toLocaleString()}`
          );
        }

        setStageRuns(await getSimulationStageRuns());
        setRunMessage('서울지구·서울 외 지구 일반 회원 생성과 캠퍼스 회계 순장님 권한 준비를 완료했습니다.');
      } else if (index === 3 || (index === 5 && paymentMode)) {
        const stage = index === 3 ? 'reservations' : 'payments';
        let offset = 0;
        let runId: string | undefined;
        let done = false;
        let finalSummary: Record<string, unknown> = {};

        while (!done) {
          const run = await runSimulationStage(stage, {
            runId,
            offset,
            batchSize: 200,
            paymentMode,
          });
          runId = run.id;
          offset = run.next_offset ?? offset;
          done = run.done;
          finalSummary = run.summary;
          const total = Number(run.summary.total_accounts ?? 0);
          const processed = Number(run.summary.processed ?? offset);
          setRunMessage(
            `${index === 3 ? '개별 신청' : paymentMode === 'random' ? '랜덤 일부 입금 설정' : '전체 입금 완료 설정'} 중: ${processed.toLocaleString()} / ${total.toLocaleString()}`
          );
        }

        if (
          index === 5 &&
          paymentMode === 'random' &&
          (
            finalSummary.payment_mode !== 'random' ||
            Number(finalSummary.completed_total ?? 0) === 0 ||
            Number(finalSummary.pending_total ?? 0) === 0
          )
        ) {
          throw new Error(
            '랜덤 일부 입금 결과에 입금 완료와 미입금 사용자가 모두 포함되지 않았습니다. simulation-runner 배포 상태를 확인하세요.'
          );
        }

        setStageRuns(await getSimulationStageRuns());
        setRunMessage(
          index === 3
            ? `${getSimulationStageDisplayNumber(3)}단계 개별 신청을 완료했습니다. 매 10번째 계정은 미신청자로 유지됩니다.`
            : paymentMode === 'random'
              ? `${getSimulationStageDisplayNumber(5)}단계 랜덤 일부 입금 설정을 완료했습니다. 일부 신청자는 미입금 상태로 유지됩니다.`
              : `${getSimulationStageDisplayNumber(5)}단계 전체 입금 완료 설정을 마쳤습니다.`
        );
      } else if (index === 5) {
        const run = await runSimulationStage('transfers');
        setStageRuns((current) => [run, ...current]);
        setRunMessage(`${getSimulationStageDisplayNumber(5)}단계 캠퍼스 송금·본부 확인을 마쳤습니다.`);
      } else if (index === 6) {
        const run = await runSimulationStage('deadline');
        setStageRuns((current) => [run, ...current]);
        setRunMessage(`${getSimulationStageDisplayNumber(6)}단계 신청 마감을 완료했습니다. 배차 화면에서 계획을 산출하고 확정하세요.`);
      } else if (index === 8) {
        const run = await runSimulationStage('boarding');
        setStageRuns((current) => [run, ...current]);
        setRunMessage(`${getSimulationStageDisplayNumber(8)}단계 출발·탑승 리허설을 마쳤습니다.`);
      }
      setPreview(await getSimulationPreview());
      setPreviewMode('after');
    } catch (runError) {
      console.error('Failed to run simulation stage:', runError);
      setRunMessage(
        runError instanceof Error ? runError.message : '단계를 실행하지 못했습니다.'
      );
      try {
        setStageRuns(await getSimulationStageRuns());
      } catch (historyError) {
        console.error('Failed to refresh simulation stage runs:', historyError);
      }
    } finally {
      setRunningStageIndex(null);
    }
  };

  const applySimulationEnabledChange = async (enabled: boolean) => {
    if (
      updatingSafety ||
      (enabled === false && safetyDisableInFlightRef.current)
    ) {
      return;
    }

    if (!enabled) safetyDisableInFlightRef.current = true;
    setUpdatingSafety(true);
    setError(null);
    setDisableSafetyError(null);
    setRunMessage(null);
    try {
      await setSimulationEnabled(enabled);
      setPreview(await getSimulationPreview());
      setDisableSafetyDialogOpen(false);
      setRunMessage(
        enabled
          ? '시뮬레이션 실행 잠금이 활성화되었습니다.'
          : '시뮬레이션 실행 잠금이 비활성화되었습니다.'
      );
    } catch (updateError) {
      console.error('Failed to update simulation safety lock:', updateError);
      const message =
        updateError instanceof Error
          ? updateError.message
          : '시뮬레이션 실행 잠금을 변경하지 못했습니다.';
      if (enabled) {
        setError(message);
      } else {
        setDisableSafetyError(message);
      }
    } finally {
      safetyDisableInFlightRef.current = false;
      setUpdatingSafety(false);
    }
  };

  const handleSimulationEnabledChange = async (enabled: boolean) => {
    if (!preview?.safety.projectIdMatches || !preview.safety.allowedProjectId) {
      setError('허용된 테스트 프로젝트에서만 실행 잠금을 변경할 수 있습니다.');
      return;
    }

    if (enabled) {
      const confirmedProjectId = window.prompt(
        `시뮬레이션 실행을 활성화하려면 테스트 프로젝트 ID를 입력하세요.\n\n${preview.safety.allowedProjectId}`
      );
      if (confirmedProjectId?.trim() !== preview.safety.allowedProjectId) {
        if (confirmedProjectId !== null) {
          setError('프로젝트 ID가 일치하지 않아 활성화하지 않았습니다.');
        }
        return;
      }
      await applySimulationEnabledChange(true);
      return;
    }

    if (runningStageIndex !== null || updatingSafety) return;
    setDisableSafetyError(null);
    setDisableSafetyDialogOpen(true);
  };

  const confirmSimulationDisable = async () => {
    if (runningStageIndex !== null || !preview?.safety.simulationEnabled) return;
    await applySimulationEnabledChange(false);
  };

  useEffect(() => {
    if (!disableSafetyDialogOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !updatingSafety) {
        setDisableSafetyDialogOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [disableSafetyDialogOpen, updatingSafety]);

  return (
    <div className={styles.pageContainer}>
      <AdminHeader />
      <main className={styles.main}>
        <button type="button" className={styles.backButton} onClick={() => navigate('/admin/dashboard')}>
          <ArrowLeft size={16} />전체 관리자
        </button>

        <header className={styles.hero}>
          <div>
            <span>전체 관리자 · 테스트 프로젝트 전용</span>
            <h1>전체 운영 시뮬레이션</h1>
            <p>회원가입부터 행사 종료와 최종 정산까지, 각 단계의 변경사항을 미리 확인한 뒤 관리자가 직접 실행합니다.</p>
          </div>
          <button type="button" onClick={() => void loadPreview()} disabled={loading}>
            <RefreshCw size={16} />미리보기 새로고침
          </button>
        </header>

        {error && <div className={styles.errorBox}>{error}</div>}

        <section className={styles.safetyPanel}>
          <div className={styles.sectionTitle}><ShieldCheck size={21} /><div><h2>실행 안전 잠금</h2><p>아래 두 조건을 모두 만족해야 DB 반영 기능이 열립니다.</p></div></div>
          <div className={styles.safetyGrid}>
            <div className={preview?.safety.projectIdMatches ? styles.pass : styles.fail}>
              {preview?.safety.projectIdMatches ? <CheckCircle2 /> : <AlertTriangle />}
              <span>허용된 테스트 프로젝트 ID</span><strong>{preview?.safety.currentProjectId ?? '확인 불가'}</strong>
            </div>
            <div className={preview?.safety.simulationEnabled ? styles.pass : styles.fail}>
              {preview?.safety.simulationEnabled ? <CheckCircle2 /> : <AlertTriangle />}
              <span>DB simulation_enabled=true</span><strong>{preview?.safety.simulationEnabled ? '활성화됨' : '비활성화됨'}</strong>
            </div>
          </div>
          {!preview?.safety.allowedProjectId && <p className={styles.safetyHint}>실행을 허용하려면 배포 환경에 `VITE_SIMULATION_PROJECT_ID`를 설정해야 합니다.</p>}
          <div className={styles.safetyControls}>
            <div>
              <strong>웹 실행 잠금 제어</strong>
              <p>전체 관리자만 변경할 수 있습니다. 활성화할 때는 테스트 프로젝트 ID를 다시 입력해야 합니다.</p>
            </div>
            <button
              type="button"
              className={preview?.safety.simulationEnabled ? styles.disableButton : styles.enableButton}
              disabled={
                loading ||
                updatingSafety ||
                runningStageIndex !== null ||
                !preview?.safety.projectIdMatches
              }
              onClick={() =>
                void handleSimulationEnabledChange(!preview?.safety.simulationEnabled)
              }
            >
              <ShieldCheck size={16} />
              {updatingSafety
                ? '변경 중...'
                : preview?.safety.simulationEnabled
                  ? '실행 비활성화'
                  : '실행 활성화'}
            </button>
          </div>
        </section>

        <section className={styles.workflowSection}>
          <div className={styles.sectionTitle}><Play size={21} /><div><h2>단계별 실행</h2><p>신청 마감과 자동 처리 버튼은 서버에서 반영하고, 배차 확정과 잔여 좌석 신청은 전용 관리자 화면에서 검토 후 진행합니다.</p></div></div>
          <div className={styles.stageList}>
            {simulationStageDisplayOrder.map((index) => {
              const [title, description, changes] = simulationStages[index];
              const displayStageNumber = getSimulationStageDisplayNumber(index);
              const expanded = expandedStageIndex === index;
              const stageAction = stageActions[index];
              const stageReviewAction = stageReviewActions[index];
              const stagePreview =
                previewMode === 'before'
                  ? buildStagePreview(index, preview, stageRuns, referenceConfig)
                  : buildStageResultPreview(index, preview, stageRuns);
              const stageDisabledReason = getStageDisabledReason(index);
              const paymentMutationDisabledReason =
                index === 5
                  ? stageDisabledReason ??
                    ((preview?.operation.transfers.confirmed ?? 0) > 0
                      ? '캠퍼스 송금과 본부 확인이 완료된 뒤에는 개인 입금 상태를 다시 변경할 수 없습니다.'
                      : null)
                  : stageDisabledReason;
              const randomPaymentDisabledReason =
                index === 5
                  ? paymentMutationDisabledReason ??
                    (activeReservationCount < 2
                      ? '랜덤 일부 입금은 활성 신청이 2건 이상일 때 실행할 수 있습니다.'
                      : null)
                  : stageDisabledReason;
              const allPaymentDisabledReason =
                index === 5
                  ? paymentMutationDisabledReason ??
                    (unpaidIndividualCount === 0
                      ? '모든 활성 신청의 입금 완료 처리가 이미 끝났습니다.'
                      : null)
                  : stageDisabledReason;
              const settlementDisabledReason =
                index === 5
                  ? stageDisabledReason ??
                    (!(preview?.operation.deadlineClosed ?? false)
                      ? `${getSimulationStageDisplayNumber(6)}단계에서 신청을 먼저 마감하세요.`
                      : !allPaymentsCompleted
                        ? `활성 신청 ${activeReservationCount.toLocaleString()}건 중 입금 완료·확인은 ${(preview?.operation.payments.verified ?? 0).toLocaleString()}건입니다. 개인 미입금 처리를 먼저 완료하세요.`
                        : (preview?.operation.transfers.confirmed ?? 0) > 0
                          ? '모든 캠퍼스 송금·본부 확인이 이미 완료되었습니다.'
                          : null)
                  : stageDisabledReason;
              const deadlineDisabledReason =
                index === 6
                  ? stageDisabledReason ??
                    ((preview?.operation.deadlineClosed ?? false)
                      ? '신청 마감이 이미 완료되었습니다.'
                      : null)
                  : stageDisabledReason;
              const allocationDisabledReason =
                index === 6
                  ? stageDisabledReason ??
                    (!(preview?.operation.deadlineClosed ?? false)
                      ? '신청 마감을 완료한 뒤 배차 화면을 열 수 있습니다.'
                      : null)
                  : stageDisabledReason;
              return <article key={title} className={expanded ? styles.stageExpanded : undefined}>
                <button
                  type="button"
                  className={styles.stageHeader}
                  onClick={() => {
                    setExpandedStageIndex(expanded ? -1 : index);
                    if (!expanded) setPreviewMode('before');
                  }}
                >
                  <span className={styles.stageNumber}>{displayStageNumber}</span><div><h3>{title}</h3><p>{description}</p></div>{expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                {expanded && (
                  <div className={styles.stageExpandedBody}>
                    <div className={styles.stageDetail}>
                      <div>
                        <strong>{index === 0 ? '초기화 처리 항목' : '자료 반영 항목'}</strong>
                        <ul>{changes.map((change) => <li key={change}>{change}</li>)}</ul>
                      </div>
                      {index !== 1 && <div className={styles.stageActionArea}>
                        {index !== 5 && index !== 6 && <button
                          type="button"
                          className={index === 0 ? styles.cleanupButton : undefined}
                          onClick={() =>
                            stageAction
                              ? navigate(stageAction.path)
                              : void handleRunStage(index)
                          }
                          disabled={stageDisabledReason !== null}
                          title={stageDisabledReason ?? undefined}
                        >
                          <Play size={15} />
                          {runningStageIndex === index
                            ? '실행 중...'
                            : index === 0
                              ? '시뮬레이션 초기화'
                              : index === 3
                                ? '개별 신청'
                                : index === 8
                                  ? '출발·탑승 리허설'
                                  : index <= 2
                                    ? '이 단계 실행'
                                    : stageAction?.label ?? '이 단계 실행'}
                        </button>}
                        {index === 5 && <div className={styles.paymentActions}>
                          <button
                            type="button"
                            onClick={() => void handleRunStage(index, 'random')}
                            disabled={randomPaymentDisabledReason !== null}
                            title={randomPaymentDisabledReason ?? undefined}
                          >
                            <Play size={15} />
                            {runningStageIndex === index
                              ? '입금 상태 변경 중...'
                              : '랜덤 일부 입금'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRunStage(index, 'all')}
                            disabled={allPaymentDisabledReason !== null}
                            title={allPaymentDisabledReason ?? undefined}
                          >
                            <Play size={15} />
                            {runningStageIndex === index
                              ? '입금 상태 변경 중...'
                              : `모두 입금 완료로 만들기 · ${activeReservationCount.toLocaleString()}명`}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRunStage(index)}
                            disabled={settlementDisabledReason !== null}
                            title={settlementDisabledReason ?? undefined}
                          >
                            <Play size={15} />
                            {runningStageIndex === index
                              ? '송금·본부 확인 중...'
                              : '캠퍼스 송금·본부 확인'}
                          </button>
                        </div>}
                        {index === 6 && <div className={styles.paymentActions}>
                          <button
                            type="button"
                            onClick={() => void handleRunStage(index)}
                            disabled={deadlineDisabledReason !== null}
                            title={deadlineDisabledReason ?? undefined}
                          >
                            <Play size={15} />
                            {runningStageIndex === index
                              ? '신청 마감 중...'
                              : '신청 마감'}
                          </button>
                          <button
                            type="button"
                            onClick={() => stageAction && navigate(stageAction.path)}
                            disabled={allocationDisabledReason !== null}
                            title={allocationDisabledReason ?? undefined}
                          >
                            <Play size={15} />
                            {stageAction?.label ?? '배차 화면 열기'}
                          </button>
                        </div>}
                        {stageReviewAction && (
                          <button
                            type="button"
                            className={styles.reviewButton}
                            onClick={() => navigate(stageReviewAction.path)}
                          >
                            <Database size={15} />
                            {stageReviewAction.label}
                          </button>
                        )}
                        {index === 5 ? (
                          <div className={styles.actionReasons}>
                            {paymentMutationDisabledReason && (
                              <p className={styles.disabledReason}>
                                <AlertTriangle size={15} />
                                <span><strong>개인 입금 상태 변경</strong>{paymentMutationDisabledReason}</span>
                              </p>
                            )}
                            {settlementDisabledReason && (
                              <p className={styles.disabledReason}>
                                <AlertTriangle size={15} />
                                <span><strong>캠퍼스 송금·본부 확인</strong>{settlementDisabledReason}</span>
                              </p>
                            )}
                          </div>
                        ) : index === 6 ? (
                          allocationDisabledReason && (
                            <p className={styles.disabledReason}>
                              <AlertTriangle size={15} />
                              <span><strong>배차 화면 열기</strong>{allocationDisabledReason}</span>
                            </p>
                          )
                        ) : stageDisabledReason && (
                          <p className={styles.disabledReason}>
                            <AlertTriangle size={15} />
                            <span><strong>현재 실행할 수 없는 이유</strong>{stageDisabledReason}</span>
                          </p>
                        )}
                      </div>}
                    </div>

                    {index !== 7 && <div className={styles.previewTabs} role="tablist" aria-label={`${title} 미리보기 전환`}>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={previewMode === 'before'}
                        className={previewMode === 'before' ? styles.activePreviewTab : undefined}
                        onClick={() => setPreviewMode('before')}
                      >
                        {index > 2 ? '현재 상태·실행 안내' : '실행 전 미리보기'}
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={previewMode === 'after'}
                        className={previewMode === 'after' ? styles.activePreviewTab : undefined}
                        onClick={() => setPreviewMode('after')}
                      >
                        최근 실행 결과
                      </button>
                    </div>}

                    <div className={styles.inlinePreview}>
                      {index === 0 && previewMode === 'before' && (
                        <div className={styles.resultGuide}>
                          <div className={styles.resultGuideHeader}>
                            <strong>초기화 범위 안내</strong>
                            <span>시험 계정과 모든 운영 자료를 삭제하고 실제 계정의 조직 소속도 초기화합니다.</span>
                          </div>
                          <div className={styles.resultGuideGrid}>
                            <article>
                              <strong>삭제되는 자료</strong>
                              <p>시뮬레이션용 시험 계정, 모든 신청·입금·배차·요청·공지, 캠퍼스 회계 순장님 권한, 조직·행선지·버스 옵션·운영 설정을 삭제합니다. 실제 계정은 유지하지만 조직 소속은 비워집니다.</p>
                            </article>
                            <article>
                              <strong>초기화 후 진행</strong>
                              <p>초기화가 끝나면 1단계를 실행해 서울지구 조직도와 기본 행선지, 운영 초기값을 자동 등록합니다.</p>
                            </article>
                          </div>
                        </div>
                      )}

                      <div className={styles.inlinePreviewHeader}>
                        <div>
                          <span>{previewMode === 'after' ? '최근 자동 실행 결과' : index > 2 ? '현재 실제 운영 상태와 실행 영향' : '실행 전 예상'}</span>
                          <h4>{stagePreview.title}</h4>
                        </div>
                        <strong>{stagePreview.status}</strong>
                      </div>

                      {index === 1 && previewMode === 'before' && (
                        <div className={styles.referenceEditor}>
                          <div className={styles.referenceEditorHeader}>
                            <div>
                              <strong>권장 시뮬레이션 운영 초기값</strong>
                              <p>1단계를 실행하면 아래 자료와 설정을 자동으로 일괄 등록합니다.</p>
                            </div>
                          </div>
                          <div className={styles.recommendedValueGrid}>
                            <article>
                              <span>구조 및 인원</span>
                              <strong>서울지구 7개 팀 · 캠퍼스 47개 · 예상 참여 인원 2,500명</strong>
                            </article>
                            <article>
                              <span>행선지</span>
                              <strong>기본 행선지 7개</strong>
                            </article>
                            <article>
                              <span>서울지구 송금 계좌</span>
                              <strong>테스트은행 000-0000-0000</strong>
                            </article>
                            <article>
                              <span>버스 옵션 및 요금</span>
                              <strong>44인승 · 700,000원 · 버스표 20,000원</strong>
                            </article>
                            <article>
                              <span>신청 마감</span>
                              <strong>실행 시점부터 14일 후</strong>
                            </article>
                          </div>
                          <div className={styles.referenceActionBar}>
                            <div>
                              <strong>1단계 실행 요약</strong>
                              <span>구조 및 인원·행선지·신청 마감·송금 계좌·버스 옵션 및 요금 설정</span>
                              <small>실행 후 다음 사용자 생성 단계를 진행할 수 있습니다.</small>
                            </div>
                            <div className={styles.stageActionArea}>
                              <button
                                type="button"
                                onClick={() => void handleRunStage(1)}
                                disabled={stageDisabledReason !== null}
                                title={stageDisabledReason ?? undefined}
                              >
                                <Play size={15} />
                                {runningStageIndex === 1 ? '1단계 실행 중...' : '1단계 실행'}
                              </button>
                              {stageDisabledReason && (
                                <p className={styles.disabledReason}>
                                  <AlertTriangle size={15} />
                                  <span><strong>현재 실행할 수 없는 이유</strong>{stageDisabledReason}</span>
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {index === 2 && previewMode === 'before' && !accountsStageUnlocked && (
                        <div className={styles.setupRequiredGuide}>
                          <div className={styles.setupRequiredGuideHeader}>
                            <AlertTriangle size={19} />
                            <div>
                              <strong>사용자 및 캠퍼스 회계 순장님 생성 전 기초 세팅이 필요합니다.</strong>
                              <p>
                                아래 {preview?.referenceSetup.missing.length ?? 0}개 항목을
                                준비한 뒤 미리보기를 새로고침하면 실행 버튼이 열립니다.
                              </p>
                            </div>
                          </div>
                          <ul>
                            {(preview?.referenceSetup.missing ?? []).map((item) => (
                              <li key={item}>
                                <strong>{item}</strong>
                                <span>
                                  {setupRequirementGuides[item] ??
                                    '해당 운영 초기값을 확인하고 다시 설정하세요.'}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {!(index === 1 && previewMode === 'before') && (
                        <div className={styles.inlineMetrics}>
                          {stagePreview.metrics.map(([label, value]) => (
                            <article key={label}>
                              <span>{label}</span>
                              <strong>{value}</strong>
                            </article>
                          ))}
                        </div>
                      )}

                      {index === 1 && previewMode === 'after' && (
                        <div className={styles.resultGuide}>
                          <div className={styles.resultGuideHeader}>
                            <strong>결과 읽는 법</strong>
                            <span>이 값들이 2단계 계정 생성과 이후 신청·배차의 기준이 됩니다.</span>
                          </div>
                          <div className={styles.resultGuideGrid}>
                            {referenceResultGuide.map((item) => (
                              <article key={item.title}>
                                <strong>{item.title}</strong>
                                <p>{item.description}</p>
                              </article>
                            ))}
                          </div>
                          <div className={styles.dbChanges}>
                            <strong>실제 DB 반영 내용</strong>
                            <ul>
                              <li>
                                기존 SIM 버스 옵션을 정리하고{' '}
                                {latestReferenceBusOptions
                                  .map((option) => `${option.capacity}인승`)
                                  .join('·') || '실행 기록에 저장된'}{' '}
                                옵션을 생성합니다.
                              </li>
                              <li>
                                실행 당시 선택한 캠퍼스 {Number(latestReferenceSummary.campus_count ?? latestReferenceCampusLabels.length).toLocaleString()}개와
                                행선지 {Number(latestReferenceSummary.active_station_count ?? latestReferenceStationNames.length).toLocaleString()}개를 시뮬레이션 사용 범위로 저장했습니다.
                              </li>
                              <li>
                                버스표 가격 {Number(latestReferenceSummary.bus_ticket_price ?? 0).toLocaleString()}원을 설정했습니다.
                              </li>
                              <li>캠퍼스별 예상 참여 인원를 생성하고 운영 시나리오 체크리스트를 초기화합니다.</li>
                            </ul>
                          </div>
                        </div>
                      )}

                      {index === 0 &&
                        previewMode === 'after' &&
                        latestCleanupRun?.status === 'completed' && (
                        <div className={styles.cleanupResultGuide}>
                          <CheckCircle2 size={22} />
                          <div>
                            <strong>시뮬레이션 정보를 초기 상태로 되돌렸습니다.</strong>
                            <p>
                              시험 계정과 운영 자료 삭제 결과를 아래에서 확인하세요.
                              다음 시뮬레이션을 준비하려면 1단계 운영 초기값 설정을 실행합니다.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedStageIndex(1);
                              setPreviewMode('before');
                            }}
                          >
                            1단계로 이동
                          </button>
                        </div>
                      )}

                      {index === 2 && previewMode === 'before' && (
                        <p className={styles.distributionHint}>
                          캠퍼스별 일반 회원 범위: {distributionRange.min.toLocaleString()}~
                          {distributionRange.max.toLocaleString()}명
                        </p>
                      )}

                      {!(index === 1 && previewMode === 'before') && (
                        <div className={styles.tableWrap}>
                          <table>
                            <thead><tr><th>항목</th><th>{previewMode === 'before' ? '예상 값' : '실제 값'}</th><th>내용</th></tr></thead>
                            <tbody>
                              {stagePreview.rows.map((row) => (
                                <tr key={row.label}>
                                  <td>{row.label}</td><td>{row.value}</td><td>{row.note}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </article>;
            })}
          </div>
          {runMessage && <p className={styles.runMessage}>{runMessage}</p>}
        </section>

        <section className={styles.historySection}>
          <div className={styles.sectionTitle}><Database size={21} /><div><h2>최근 실행 기록</h2><p>서버가 기록한 단계별 실행 결과입니다.</p></div></div>
          <div className={styles.historyList}>
            {stageRuns.length > 0 ? stageRuns.map((run) => <article key={run.id}>
              <div><strong>{run.stage === 'cleanup' ? `${getSimulationStageDisplayNumber(0)}단계 시뮬레이션 정보 초기화` : run.stage === 'reference' ? `${getSimulationStageDisplayNumber(1)}단계 운영 초기값 설정` : run.stage === 'accounts' ? `${getSimulationStageDisplayNumber(2)}단계 사용자 및 캠퍼스 회계 순장님 생성` : run.stage === 'reservations' ? `${getSimulationStageDisplayNumber(3)}단계 개별 신청` : run.stage === 'deadline' ? `${getSimulationStageDisplayNumber(6)}단계 신청 마감` : run.stage === 'payments' ? `${getSimulationStageDisplayNumber(5)}단계 개인 입금` : run.stage === 'transfers' ? `${getSimulationStageDisplayNumber(5)}단계 캠퍼스 송금·본부 확인` : run.stage === 'boarding' ? `${getSimulationStageDisplayNumber(8)}단계 출발·탑승 리허설` : run.stage}</strong><span>{new Date(run.started_at).toLocaleString()}</span></div>
              <span className={run.status === 'completed' ? styles.completedBadge : run.status === 'failed' ? styles.failedBadge : styles.runningBadge}>{run.status}</span>
            </article>) : <p className={styles.emptyHistory}>아직 실행 기록이 없습니다.</p>}
          </div>
        </section>

      </main>

      {disableSafetyDialogOpen && preview?.safety.simulationEnabled && (
        <div
          className={styles.modalBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !updatingSafety) {
              setDisableSafetyDialogOpen(false);
            }
          }}
        >
          <section
            className={styles.disableSafetyDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="simulation-disable-title"
            aria-describedby="simulation-disable-description"
          >
            <span className={styles.disableSafetyIcon} aria-hidden="true">
              <ShieldCheck size={26} />
            </span>
            <p className={styles.disableSafetyEyebrow}>시뮬레이션 실행 안전 잠금</p>
            <h2 id="simulation-disable-title">실행을 즉시 비활성화할까요?</h2>
            <p id="simulation-disable-description">
              비활성화하면 새로운 시뮬레이션 단계 실행이 차단됩니다. 이미 생성된
              테스트 데이터와 실행 기록은 유지되며, 데이터 초기화 작업은 실행되지
              않습니다.
            </p>
            <dl className={styles.disableSafetySummary}>
              <div>
                <dt>테스트 프로젝트</dt>
                <dd>{preview.safety.currentProjectId}</dd>
              </div>
              <div>
                <dt>현재 신청</dt>
                <dd>{activeReservationCount.toLocaleString()}건 유지</dd>
              </div>
              <div>
                <dt>실행 기록</dt>
                <dd>{stageRuns.length.toLocaleString()}건 유지</dd>
              </div>
              <div>
                <dt>비활성화 결과</dt>
                <dd>신규 단계 실행 차단</dd>
              </div>
              <div>
                <dt>데이터 초기화</dt>
                <dd>실행하지 않음</dd>
              </div>
            </dl>
            <div className={styles.disableSafetyWarning}>
              <AlertTriangle size={18} aria-hidden="true" />
              <span>
                테스트 데이터를 삭제하려면 별도의 시뮬레이션 정보 초기화 단계를
                실행해야 합니다.
              </span>
            </div>
            {disableSafetyError && (
              <p className={styles.disableSafetyError} role="alert">
                {disableSafetyError}
              </p>
            )}
            <div className={styles.disableSafetyActions}>
              <button
                type="button"
                className={styles.disableSafetyCancel}
                onClick={() => setDisableSafetyDialogOpen(false)}
                disabled={updatingSafety}
                autoFocus
              >
                실행 유지
              </button>
              <button
                type="button"
                className={styles.disableSafetySubmit}
                onClick={() => void confirmSimulationDisable()}
                disabled={updatingSafety || runningStageIndex !== null}
              >
                {updatingSafety ? (
                  <>
                    <LoaderCircle className={styles.spin} size={18} />
                    비활성화 중...
                  </>
                ) : (
                  <>
                    <ShieldCheck size={18} />
                    실행 즉시 비활성화
                  </>
                )}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default AdminSimulationPage;

