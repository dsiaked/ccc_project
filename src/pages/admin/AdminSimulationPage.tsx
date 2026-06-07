import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
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
import AdminHeader from './AdminHeader';
import styles from './AdminSimulationPage.module.css';

const simulationStages = [
  ['시뮬레이션 정보 초기화', '시뮬레이션용 시험 계정과 모든 운영 자료를 삭제하여 처음부터 다시 설정할 수 있는 상태로 되돌립니다.', ['시뮬레이션용 시험 계정 전체 삭제', '모든 신청·입금·배차·요청·공지 삭제', '조직·캠퍼스·행선지·버스 옵션·운영 설정 삭제']],
  ['운영 초기값 설정', '서울지구 조직도와 기본 행선지를 등록하고 권장 시뮬레이션 운영 초기값을 생성합니다.', ['서울지구 조직도·기본 행선지 등록', '예상 참여 인원 2,500명 설정', '44인승 SIM 버스 옵션·요금 설정']],
  ['사용자 및 캠퍼스 관리자 생성', '소형·중형·대형·거점형 캠퍼스가 섞인 비균등 분포로 일반 회원과 모든 캠퍼스 관리자를 생성합니다.', ['다양한 캠퍼스 규모별 실제 로그인 계정 생성', '프로필 생성', '관리자 5명은 캠퍼스 2개씩 담당']],
  ['개별 신청', '사용자별 1·2지망 신청을 생성하고 실제 신청 건수를 확인합니다.', ['개별 신청', '행선지 수요 분산', '신청 상태 확인']],
  ['개별 입금', '신청자별 입금 여부를 랜덤으로 나누거나 모든 신청자를 입금 완료 상태로 설정합니다.', ['랜덤 입금·미입금 상태 설정', '전체 입금 완료 상태 설정', '입금 완료 사용자의 캠퍼스 관리자 확인 기록 반영']],
  ['임시 배차안 생성', '전체 입금 완료 여부와 관계없이 활성 신청 수요를 기준으로 임시 배차안을 생성합니다.', ['활성 신청 기준 배차 추천 계산', '임시 배차안 생성 및 편집', '전체 입금 전에도 실행 가능']],
  ['잔여 좌석 판매 및 추가 버스표', '기존 미탑승 사용자과 신규 사용자을 섞어 잔여 좌석을 판매합니다.', ['추가 구매자 선정·생성', '잔여 좌석 판매', '추가 버스표 발급']],
  ['모두 송금 완료', '캠퍼스 관리자가 확인한 개인 입금을 기준으로 캠퍼스별 송금 보고를 생성합니다.', ['신청 마감', '개인 입금 확인 상태 검증', '모든 캠퍼스 송금 보고 생성']],
  ['행사 종료 및 전체 정산 보고서', '현재 저장 가능한 정산 자료를 확인하고, 아직 필요한 탑승·노쇼 기록 기능을 구분합니다.', ['현재 정산 자료 확인', '탑승·노쇼 기록 모델 설계', '최종 보고서 기능 구현']],
] as const;

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
            : index === 7
              ? 'transfers'
              : '';

const stageActions: Record<number, { label: string; path: string } | undefined> = {
  5: { label: '배차 화면 열기', path: '/admin/allocation' },
  6: { label: '잔여 좌석 판매 열기', path: '/admin/remaining-seat-sales' },
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
  district_transfer_account: '서울지구 송금 계좌',
  campus_labels: '등록 캠퍼스',
  station_names: '등록 행선지',
  created: '운영 초기값 설정 완료',
  checked_at: '확인 완료 시각',
  total_accounts: '총 계정',
  general_users: '일반 회원',
  campus_admins: '캠퍼스 관리자',
  multi_campus_admins: '2개 캠퍼스 담당 관리자',
  campus_admin_roles: '캠퍼스 관리자 권한',
  general_user_distribution_range: '캠퍼스별 일반 회원 분포',
  processed: '처리 완료',
  created_in_batch: '현재 배치 생성',
  skipped_in_batch: '현재 배치 기존 계정',
  created_total: '누적 생성',
  completed_in_batch: '현재 배치 입금 완료',
  pending_in_batch: '현재 배치 입금 대기',
  completed_total: '누적 입금 완료',
  pending_total: '누적 입금 대기',
  deadline_closed: '신청 마감',
  completed_payments: '입금 완료 처리',
  verified_payments: '캠퍼스 확인 처리',
  verified_in_batch: '이번 배치 캠퍼스 확인',
  verified_total: '누적 캠퍼스 확인',
  payment_mode: '개별 입금 설정 모드',
  sent_transfers: '송금 보고 처리',
  sent_total_amount: '총 송금액',
  skipped_total: '누적 기존 계정',
  verified_profiles: '최종 프로필 검증',
  verified_campus_admin_roles: '최종 관리자 권한 검증',
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
  district_transfer_account: '시뮬레이션 송금 흐름에 사용할 테스트 전용 서울지구 계좌',
  campus_labels: '1단계에서 서울지구 구조 및 인원에 등록한 캠퍼스 목록',
  general_user_distribution_range: '다양한 규모군을 적용한 캠퍼스별 최소~최대 일반 회원 수',
  station_names: '1단계에서 등록한 기본 행선지 목록',
  created: '예상 참여 인원·버스 옵션·요금 설정 생성 여부',
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
  homeAnnouncements: '홈 공지',
  stations: '행선지',
  busOptions: '버스 옵션',
  appSettings: '운영 설정',
  campusAdminRoles: '캠퍼스 관리자 권한',
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
  campusAdminRoles: '캠퍼스 관리자 권한',
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
    key === 'checked_at' && typeof value === 'string'
  ) {
    return new Date(value).toLocaleString();
  }
  return String(value ?? '-');
};

const getLatestStageRun = (index: number, stageRuns: SimulationStageRun[]) =>
  stageRuns.find((run) => run.stage === getStageRunName(index));

const buildStagePreview = (
  index: number,
  preview: SimulationPreview | null,
  stageRuns: SimulationStageRun[],
  referenceConfig = DEFAULT_SIMULATION_REFERENCE_CONFIG
) => {
  const campusAdmins = preview?.campusAdminCount ?? 0;
  const totalAccounts = preview?.totalAccountCount ?? 0;
  const operation = preview?.operation;
  const latestRun = stageRuns.find((run) => run.stage === getStageRunName(index));
  const common = {
    label: `${index}단계 미리보기`,
    title: simulationStages[index][0],
    description: simulationStages[index][1],
    status: latestRun?.status ?? '미실행',
  };

  if (index === 0) {
    return {
      ...common,
      metrics: [
        ['삭제 대상 계정', `${(preview?.existingSimulationProfileCount ?? 0).toLocaleString()}개`],
        ['초기화 후 상태', '재설정 필요'],
        ['운영 초기값', '전체 삭제'],
        ['최근 실행', latestRun?.status ?? '미실행'],
      ],
      rows: [
        { label: '시뮬레이션 계정', value: '전체 삭제', note: '연결된 프로필·신청·입금·권한 포함' },
        { label: '시뮬레이션 운영 데이터', value: '전체 정리', note: '문의·송금·배차 결과 포함' },
        { label: '운영 초기값', value: '전체 삭제', note: '조직·캠퍼스·행선지·버스 옵션·운영 설정' },
        { label: '초기화 후 상태', value: '재설정 필요', note: '조직·행선지 등록 후 1단계 실행' },
      ] satisfies StagePreviewRow[],
    };
  }

  if (index === 1) {
    const summary = latestRun?.summary ?? {};
    return {
      ...common,
      metrics: [
        ['등록 캠퍼스', `${Number(summary.campus_count ?? referenceConfig.campusCount).toLocaleString()}개`],
        ['등록 행선지', `${Number(summary.active_station_count ?? referenceConfig.stationCount).toLocaleString()}개`],
        ['버스 옵션', `${Number(summary.bus_option_count ?? referenceConfig.busOptions.length).toLocaleString()}개`],
        ['예상 참여 인원', `${Number(summary.participation_target ?? referenceConfig.participationTarget).toLocaleString()}명`],
        ['최근 실행', latestRun?.status ?? '미실행'],
      ],
      rows: [
        {
          label: '현재 기초 세팅',
          value: preview?.referenceSetup.isReady ? '완료' : '미완료',
          note: preview?.referenceSetup.missing.length
            ? `필요 항목: ${preview.referenceSetup.missing.join(', ')}`
            : '예상 참여 인원·SIM 버스 옵션·요금·신청 설정 확인 완료',
        },
      ] satisfies StagePreviewRow[],
    };
  }

  if (index === 2) {
    const selectedCampusIdSet = new Set(referenceConfig.selectedCampusIds);
    const selectedCampuses = (preview?.campuses ?? []).filter((campus) =>
      selectedCampusIdSet.has(campus.campusId)
    );
    const selectedGeneralUsers = selectedCampuses.reduce(
      (sum, campus) => sum + campus.generalUserCount,
      0
    );
    const selectedCampusAdmins = selectedCampuses.length;
    const selectedTotalAccounts = selectedGeneralUsers + selectedCampusAdmins;
    const selectedCounts = selectedCampuses.map((campus) => campus.generalUserCount);
    const selectedDistributionRange = selectedCounts.length
      ? `${Math.min(...selectedCounts).toLocaleString()}~${Math.max(...selectedCounts).toLocaleString()}명`
      : '0명';
    return {
      ...common,
      metrics: [
        ['일반 회원', `${selectedGeneralUsers.toLocaleString()}명`],
        ['캠퍼스 관리자', `${selectedCampusAdmins.toLocaleString()}명`],
        ['총 실제 계정', `${selectedTotalAccounts.toLocaleString()}개`],
        ['캠퍼스별 일반 회원 분포', selectedDistributionRange],
      ],
      rows: selectedCampuses.map((campus) => ({
        label: `${campus.team} · ${campus.campus}`,
        value: `${campus.generalUserCount.toLocaleString()}명`,
        note: `캠퍼스 관리자 ${campus.campusAdminCount}명`,
      })),
    };
  }

  const laterStages = [
    {
      status:
        (operation?.reservations.total ?? 0) > 0 ? '개별 신청 완료' : '미신청',
      metrics: [
        ['실제 신청', `${(operation?.reservations.total ?? 0).toLocaleString()}건`],
        ['요청 신청', `${(operation?.reservations.requested ?? 0).toLocaleString()}건`],
        ['취소 신청', `${(operation?.reservations.cancelled ?? 0).toLocaleString()}건`],
        ['신청 없는 계정', `${Math.max(0, totalAccounts - (operation?.reservations.total ?? 0)).toLocaleString()}개`],
      ],
      rows: [
        { label: '신청 상태', value: `요청 ${(operation?.reservations.requested ?? 0).toLocaleString()} / 확정 ${(operation?.reservations.confirmed ?? 0).toLocaleString()} / 취소 ${(operation?.reservations.cancelled ?? 0).toLocaleString()}`, note: '실제 reservations 테이블 기준' },
        { label: '신청 대상', value: `${totalAccounts.toLocaleString()}개 계정`, note: '매 10번째 계정은 미신청자로 유지' },
        { label: '신청 방법', value: '웹 시뮬레이션 실행기', note: '개별 신청 버튼으로 배치 실행' },
      ],
    },
    {
      status:
        (operation?.payments.total ?? 0) > 0
          ? '개별 입금 설정됨'
          : (operation?.reservations.total ?? 0) > 0
            ? '입금 생성 필요'
            : '개별 신청 필요',
      metrics: [
        ['입금 데이터', `${(operation?.payments.total ?? 0).toLocaleString()}건`],
        ['입금 완료', `${(operation?.payments.completed ?? 0).toLocaleString()}건`],
        ['입금 대기', `${(operation?.payments.pending ?? 0).toLocaleString()}건`],
        ['입금 없는 요청 신청', `${Math.max(0, (operation?.reservations.requested ?? 0) - (operation?.payments.total ?? 0)).toLocaleString()}건`],
      ],
      rows: [
        { label: '개별 입금 상태', value: `완료 ${(operation?.payments.completed ?? 0).toLocaleString()} / 미입금 ${(operation?.payments.pending ?? 0).toLocaleString()}`, note: '입금 완료 사용자는 소속 캠퍼스 관리자를 확인자로 기록' },
        { label: '설정 대상 신청', value: `${(operation?.reservations.requested ?? 0).toLocaleString()}건`, note: '현재 요청 상태인 신청의 입금 데이터를 교체' },
        { label: '설정 방법', value: '랜덤 또는 전체 입금', note: '두 실행 버튼 중 필요한 시뮬레이션 상태를 선택' },
      ],
    },
    {
      status:
        operation?.deadlineClosed &&
        (operation?.transfers.confirmed ?? 0) > 0
          ? '본부 확인 완료'
          : operation?.deadlineClosed
            ? (operation?.transfers.sent ?? 0) > 0
              ? '모두 송금 완료'
              : '신청 마감됨'
            : '마감 전',
      metrics: [
        ['입금 검증', `${(operation?.payments.verified ?? 0).toLocaleString()}건`],
        ['송금 보고', `${(operation?.transfers.total ?? 0).toLocaleString()}건`],
        ['송금 처리', `${(operation?.transfers.sent ?? 0).toLocaleString()}건`],
        ['신청 마감', operation?.deadlineClosed ? '마감됨' : '진행 중'],
      ],
      rows: [
        { label: '신청 마감 일시', value: operation?.deadlineAt ? new Date(operation.deadlineAt).toLocaleString() : '설정 없음', note: '현재 서버 설정 기준' },
        { label: '캠퍼스 입금 확인', value: `${(operation?.payments.verified ?? 0).toLocaleString()}건`, note: 'verified_at이 기록된 실제 입금' },
        { label: '캠퍼스 송금 처리', value: `송금 ${(operation?.transfers.sent ?? 0).toLocaleString()} / 본부 확인 ${(operation?.transfers.confirmed ?? 0).toLocaleString()}`, note: `캠퍼스 관리자 ${campusAdmins.toLocaleString()}명 기준` },
      ],
    },
    {
      status:
        (operation?.allocations.confirmed ?? 0) > 0
          ? '배차 확정됨'
          : (operation?.allocations.draft ?? 0) > 0
            ? '임시 배차안 있음'
            : '미배차',
      metrics: [
        ['임시 배차안', `${(operation?.allocations.draft ?? 0).toLocaleString()}건`],
        ['확정 배차안', `${(operation?.allocations.confirmed ?? 0).toLocaleString()}건`],
        ['확정 차량', `${(operation?.allocations.confirmedBuses ?? 0).toLocaleString()}대`],
        ['버스표 발급', `${(operation?.reservations.ticketed ?? 0).toLocaleString()}건`],
      ],
      rows: [
        { label: '확정 좌석 용량', value: `${(operation?.allocations.confirmedCapacity ?? 0).toLocaleString()}석`, note: '확정 배차안 차량 정원 합계' },
        { label: '배정 승객', value: `${(operation?.allocations.confirmedPassengers ?? 0).toLocaleString()}명`, note: '확정 배차안 passengers 기준' },
        { label: '버스표 일치', value: `${(operation?.reservations.ticketed ?? 0).toLocaleString()}건`, note: 'confirmed_ticket이 발급된 실제 신청' },
      ],
    },
    {
      status:
        (operation?.allocations.confirmed ?? 0) === 0
          ? '확정 배차 필요'
          : (operation?.allocations.remainingSeats ?? 0) > 0
            ? '판매 가능'
            : '잔여 좌석 없음',
      metrics: [
        ['확정 좌석', `${(operation?.allocations.confirmedCapacity ?? 0).toLocaleString()}석`],
        ['배정 인원', `${(operation?.allocations.confirmedPassengers ?? 0).toLocaleString()}명`],
        ['잔여 좌석', `${(operation?.allocations.remainingSeats ?? 0).toLocaleString()}석`],
        ['발급 버스표', `${(operation?.reservations.ticketed ?? 0).toLocaleString()}건`],
      ],
      rows: [
        { label: '판매 전제', value: operation?.deadlineClosed ? '신청 마감 완료' : '신청 마감 필요', note: '마감 후 확정 배차가 있어야 판매 가능' },
        { label: '현재 판매 여력', value: `${(operation?.allocations.remainingSeats ?? 0).toLocaleString()}석`, note: '확정 정원에서 배정 승객을 뺀 값' },
        { label: '판매 검증', value: '원자적 좌석 배정', note: '좌석 중복과 초과 판매를 DB 함수에서 차단' },
      ],
    },
    {
      status: '기능 설계 필요',
      metrics: [
        ['발급 버스표', `${(operation?.reservations.ticketed ?? 0).toLocaleString()}건`],
        ['환불 입금', `${(operation?.payments.refunded ?? 0).toLocaleString()}건`],
        ['탑승·노쇼', '기록 기능 없음'],
        ['최종 보고서', '미구현'],
      ],
      rows: [
        { label: '현재 가능한 집계', value: '신청·취소·입금·환불·송금·버스표', note: '현재 DB에 저장되는 운영 자료' },
        { label: '추가로 필요한 자료', value: '실제 탑승·노쇼·버스 운행 결과', note: '행사 종료 기록 모델이 아직 없음' },
        { label: '판정', value: '완료 단계 아님', note: '탑승 기록과 최종 정산 기능 구현 후 실행 단계로 전환' },
      ],
    },
  ];

  const laterStagePreviewIndex = [0, 1, 3, 4, 2, 5][index - 3];
  return { ...common, ...laterStages[laterStagePreviewIndex] };
};

const buildStageResultPreview = (
  index: number,
  preview: SimulationPreview | null,
  stageRuns: SimulationStageRun[]
) => {
  const run = getLatestStageRun(index, stageRuns);
  const before = buildStagePreview(index, preview, stageRuns);

  if (index > 2) {
    return {
      ...before,
      label: `${index}단계 실제 운영 상태`,
    };
  }

  if (!run) {
    return {
      ...before,
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
  const summaryRows = Object.entries(summary).map(([key, value]) => ({
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
    status:
      index === 0 && run.status === 'completed'
        ? '초기화 완료'
        : run.status,
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
  const [runningStageIndex, setRunningStageIndex] = useState<number | null>(null);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [updatingSafety, setUpdatingSafety] = useState(false);
  const [previewMode, setPreviewMode] = useState<'before' | 'after'>('before');
  const referenceConfig = DEFAULT_SIMULATION_REFERENCE_CONFIG;

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
    const counts = preview?.campuses.map((campus) => campus.generalUserCount) ?? [];
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
  const paymentsStageUnlocked = (preview?.operation.reservations.total ?? 0) > 0;
  const activeReservationCount =
    (preview?.operation.reservations.requested ?? 0) +
    (preview?.operation.reservations.confirmed ?? 0);
  const allPaymentsCompleted =
    (preview?.operation.payments.total ?? 0) > 0 &&
    preview?.operation.payments.total === activeReservationCount &&
    preview?.operation.payments.verified === activeReservationCount;
  const allocationStageUnlocked = activeReservationCount > 0;
  const transfersStageUnlocked =
    allPaymentsCompleted && (preview?.operation.allocations.confirmed ?? 0) > 0;

  const handleRunStage = async (index: number, paymentMode?: 'random' | 'all') => {
    if (index > 7 || index === 5 || index === 6) return;

    if (index === 0) {
      const confirmation = window.prompt(
        '시뮬레이션용 시험 계정과 모든 운영 자료를 삭제합니다.\n모든 신청·입금·배차·요청·공지와 조직·캠퍼스·행선지·버스 옵션·운영 설정이 삭제됩니다.\n\n삭제 후에는 1단계를 실행해 서울지구 조직도와 기본 행선지, 운영 초기값을 자동 등록해야 합니다.\n계속하려면 "시뮬레이션 초기화"를 입력하세요.'
      );
      if (confirmation?.trim() !== '시뮬레이션 초기화') return;
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
        setRunMessage('0단계 시뮬레이션 정보 초기화가 완료되었습니다.');
      } else if (index === 1) {
        const run = await runSimulationStage('reference', { referenceConfig });
        setStageRuns((current) => [run, ...current]);
        setRunMessage('1단계 운영 초기값 설정을 완료했습니다.');
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
        setRunMessage('일반 회원과 모든 캠퍼스 관리자 계정 생성을 완료했습니다.');
      } else if (index <= 4) {
        const stage = index === 3 ? 'reservations' : 'payments';
        let offset = 0;
        let runId: string | undefined;
        let done = false;

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
          const total = Number(run.summary.total_accounts ?? 0);
          const processed = Number(run.summary.processed ?? offset);
          setRunMessage(
            `${index === 3 ? '개별 신청' : paymentMode === 'all' ? '전체 입금 완료 설정' : '랜덤 개별 입금 설정'} 중: ${processed.toLocaleString()} / ${total.toLocaleString()}`
          );
        }

        setStageRuns(await getSimulationStageRuns());
        setRunMessage(
          index === 3
            ? '3단계 개별 신청을 완료했습니다. 매 10번째 계정은 미신청자로 유지됩니다.'
            : paymentMode === 'all'
              ? '4단계 전체 입금 완료 설정을 완료했습니다.'
              : '4단계 랜덤 개별 입금 설정을 완료했습니다.'
        );
      } else if (index === 7) {
        const run = await runSimulationStage('transfers');
        setStageRuns((current) => [run, ...current]);
        setRunMessage('7단계 모두 송금 완료 처리를 마쳤습니다.');
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
    } else if (!window.confirm('시뮬레이션 실행을 즉시 비활성화할까요?')) {
      return;
    }

    setUpdatingSafety(true);
    setError(null);
    setRunMessage(null);
    try {
      await setSimulationEnabled(enabled);
      setPreview(await getSimulationPreview());
      setRunMessage(
        enabled
          ? '시뮬레이션 실행 잠금이 활성화되었습니다.'
          : '시뮬레이션 실행 잠금이 비활성화되었습니다.'
      );
    } catch (updateError) {
      console.error('Failed to update simulation safety lock:', updateError);
      setError(
        updateError instanceof Error
          ? updateError.message
          : '시뮬레이션 실행 잠금을 변경하지 못했습니다.'
      );
    } finally {
      setUpdatingSafety(false);
    }
  };

  return (
    <div className={styles.pageContainer}>
      <AdminHeader />
      <main className={styles.main}>
        <button type="button" className={styles.backButton} onClick={() => navigate('/admin/global')}>
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
          <div className={styles.sectionTitle}><Play size={21} /><div><h2>단계별 실행</h2><p>0~4단계와 7단계는 서버에서 실행하고, 5~6단계와 이후 운영 단계는 연결된 관리자 화면에서 진행합니다.</p></div></div>
          <div className={styles.stageList}>
            {simulationStages.map(([title, description, changes], index) => {
              const expanded = expandedStageIndex === index;
              const stageAction = stageActions[index];
              const stagePreview =
                previewMode === 'before'
                  ? buildStagePreview(index, preview, stageRuns, referenceConfig)
                  : buildStageResultPreview(index, preview, stageRuns);
              return <article key={title} className={expanded ? styles.stageExpanded : undefined}>
                <button
                  type="button"
                  className={styles.stageHeader}
                  onClick={() => {
                    setExpandedStageIndex(expanded ? -1 : index);
                    if (!expanded) setPreviewMode('before');
                  }}
                >
                  <span className={styles.stageNumber}>{index}</span><div><h3>{title}</h3><p>{description}</p></div>{expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                {expanded && (
                  <div className={styles.stageExpandedBody}>
                    <div className={styles.stageDetail}>
                      <div>
                        <strong>{index === 0 ? '초기화 처리 항목' : '자료 반영 항목'}</strong>
                        <ul>{changes.map((change) => <li key={change}>{change}</li>)}</ul>
                      </div>
                      {index !== 1 && index !== 4 && <button
                        type="button"
                        className={index === 0 ? styles.cleanupButton : undefined}
                        onClick={() =>
                          stageAction
                            ? navigate(stageAction.path)
                            : void handleRunStage(index)
                        }
                        disabled={
                          index <= 7
                            ? !preview?.safety.isSafeToExecute ||
                              (index === 2 && !accountsStageUnlocked) ||
                              (index === 3 && !reservationsStageUnlocked) ||
                              (index === 4 && !paymentsStageUnlocked) ||
                              (index === 5 && !allocationStageUnlocked) ||
                              (index === 6 && !transfersStageUnlocked) ||
                              (index === 7 && !transfersStageUnlocked) ||
                              runningStageIndex !== null
                            : !stageAction
                        }
                      >
                        <Play size={15} />
                        {runningStageIndex === index
                          ? '실행 중...'
                          : index === 0
                            ? '시뮬레이션 초기화'
                            : index === 2 && !accountsStageUnlocked
                              ? '기초 세팅 필요'
                              : index === 3 && !reservationsStageUnlocked
                                ? '계정 생성 필요'
                                : index === 4 && !paymentsStageUnlocked
                                  ? '개별 신청 필요'
                                  : index === 5 && !allocationStageUnlocked
                                    ? '활성 신청 필요'
                                  : (index === 6 || index === 7) && !transfersStageUnlocked
                                    ? '배차 확정 필요'
                                  : index === 3
                                    ? '개별 신청'
                                    : index === 7
                                        ? '모두 송금 완료'
                                      : index <= 2
                                        ? '이 단계 실행'
                                : stageAction?.label ?? '기능 설계 필요'}
                      </button>}
                      {index === 4 && <div className={styles.paymentActions}>
                        <button
                          type="button"
                          onClick={() => void handleRunStage(index, 'random')}
                          disabled={
                            !preview?.safety.isSafeToExecute ||
                            !paymentsStageUnlocked ||
                            runningStageIndex !== null
                          }
                        >
                          <Play size={15} />
                          {runningStageIndex === index ? '실행 중...' : '랜덤 입금 상태 설정'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRunStage(index, 'all')}
                          disabled={
                            !preview?.safety.isSafeToExecute ||
                            !paymentsStageUnlocked ||
                            runningStageIndex !== null
                          }
                        >
                          <Play size={15} />
                          {runningStageIndex === index ? '실행 중...' : '전체 입금 완료'}
                        </button>
                      </div>}
                    </div>

                    {index <= 7 && <div className={styles.previewTabs} role="tablist" aria-label={`${title} 미리보기 전환`}>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={previewMode === 'before'}
                        className={previewMode === 'before' ? styles.activePreviewTab : undefined}
                        onClick={() => setPreviewMode('before')}
                      >
                        실행 전 미리보기
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={previewMode === 'after'}
                        className={previewMode === 'after' ? styles.activePreviewTab : undefined}
                        onClick={() => setPreviewMode('after')}
                      >
                        실행 후 결과
                      </button>
                    </div>}

                    <div className={styles.inlinePreview}>
                      {index === 0 && previewMode === 'before' && (
                        <div className={styles.resultGuide}>
                          <div className={styles.resultGuideHeader}>
                            <strong>초기화 범위 안내</strong>
                            <span>시뮬레이션 실행 자료와 운영 초기값을 모두 삭제합니다.</span>
                          </div>
                          <div className={styles.resultGuideGrid}>
                            <article>
                              <strong>삭제되는 자료</strong>
                              <p>시뮬레이션용 시험 계정과 모든 신청·입금·배차·요청·공지, 조직·캠퍼스·행선지·버스 옵션·운영 설정을 삭제합니다.</p>
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
                          <span>{index > 2 ? '현재 실제 운영 상태' : previewMode === 'before' ? '실행 전 예상' : '실행 후 실제 결과'}</span>
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
                          </div>
                          <div className={styles.referenceActionBar}>
                            <div>
                              <strong>1단계 실행 요약</strong>
                              <span>구조 및 인원·행선지·송금 계좌·버스 옵션 및 요금 설정</span>
                              <small>실행 후 다음 사용자 생성 단계를 진행할 수 있습니다.</small>
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleRunStage(1)}
                              disabled={
                                !preview?.safety.isSafeToExecute ||
                                runningStageIndex !== null
                              }
                            >
                              <Play size={15} />
                              {runningStageIndex === 1 ? '1단계 실행 중...' : '1단계 실행'}
                            </button>
                          </div>
                        </div>
                      )}

                      {index === 2 && previewMode === 'before' && !accountsStageUnlocked && (
                        <div className={styles.setupRequiredGuide}>
                          <div className={styles.setupRequiredGuideHeader}>
                            <AlertTriangle size={19} />
                            <div>
                              <strong>사용자 및 캠퍼스 관리자 생성 전 기초 세팅이 필요합니다.</strong>
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
              <div><strong>{run.stage === 'cleanup' ? '0단계 시뮬레이션 정보 초기화' : run.stage === 'reference' ? '1단계 운영 초기값 설정' : run.stage === 'accounts' ? '2단계 사용자 및 캠퍼스 관리자 생성' : run.stage === 'reservations' ? '3단계 개별 신청' : run.stage === 'payments' ? '4단계 개별 입금' : run.stage === 'transfers' ? '7단계 모두 송금 완료' : run.stage}</strong><span>{new Date(run.started_at).toLocaleString()}</span></div>
              <span className={run.status === 'completed' ? styles.completedBadge : run.status === 'failed' ? styles.failedBadge : styles.runningBadge}>{run.status}</span>
            </article>) : <p className={styles.emptyHistory}>아직 실행 기록이 없습니다.</p>}
          </div>
        </section>

      </main>
    </div>
  );
};

export default AdminSimulationPage;

