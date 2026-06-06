import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  ChevronDown,
  ChevronUp,
  Database,
  DollarSign,
  Landmark,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import AdminHeader from './AdminHeader';
import {
  getAdminRole,
  getBusTicketPrice,
  getReservationDataResetStats,
  resetReservationData,
  updateBusTicketPrice,
  type ReservationDataResetOptions,
  type ReservationDataResetStats,
} from '../../lib/adminService';
import { supabase } from '../../lib/supabase';
import { getParticipationTargetsSetting } from '../../lib/participationTargetsService';
import {
  getDistrictTransferAccountNumber,
  updateDistrictTransferAccountNumber,
} from '../../lib/districtTransferAccountService';

import styles from './AdminSetupCheckPage.module.css';

interface CampusOptionRow {
  district: string | null;
  team: string | null;
  campus: string | null;
}

interface CampusAdminRoleRow {
  district: string | null;
  team: string | null;
  campus: string | null;
}

interface CampusSetupRow {
  key: string;
  district: string;
  team: string;
  campus: string;
  target: number;
  hasAdmin: boolean;
}

interface StationSetupRow {
  id: string;
  name: string;
  line: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  is_active: boolean;
}

interface NewStationDraft {
  name: string;
  line: string;
  address: string;
}

type SetupDetailId = 'organization' | 'campus-admins' | 'destinations';

const RESET_CONFIRM_TEXT = '신청정보 초기화';
const emptyNewStationDraft: NewStationDraft = {
  name: '',
  line: '',
  address: '',
};

const KAKAO_MAP_SDK_ID = 'kakao-map-sdk';

const normalizeEnvValue = (value: unknown) =>
  String(value ?? '')
    .trim()
    .replace(/^['"]|['"]$/g, '');

const getKakaoMapAppKey = () =>
  normalizeEnvValue(import.meta.env.VITE_KAKAO_JAVASCRIPT_KEY) ||
  normalizeEnvValue(import.meta.env.VITE_KAKAO_MAP_KEY);

const loadKakaoMapSdk = () =>
  new Promise<void>((resolve, reject) => {
    if (window.kakao?.maps) {
      window.kakao.maps.load(resolve);
      return;
    }

    const appKey = getKakaoMapAppKey();

    if (!appKey) {
      reject(new Error('카카오 지도 JavaScript 키가 설정되지 않았습니다.'));
      return;
    }

    const scriptSrc = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(
      appKey
    )}&libraries=services&autoload=false`;
    const existingScript = document.getElementById(
      KAKAO_MAP_SDK_ID
    ) as HTMLScriptElement | null;

    if (existingScript && existingScript.src !== scriptSrc) {
      existingScript.remove();
    }

    const currentScript = document.getElementById(
      KAKAO_MAP_SDK_ID
    ) as HTMLScriptElement | null;
    const script = currentScript ?? document.createElement('script');
    const timeoutId = window.setTimeout(() => {
      reject(new Error('카카오 지도 SDK를 불러오는 시간이 초과되었습니다.'));
    }, 10000);

    script.id = KAKAO_MAP_SDK_ID;
    script.src = scriptSrc;
    script.async = true;
    script.onload = () => {
      window.clearTimeout(timeoutId);

      if (!window.kakao?.maps) {
        reject(new Error('카카오 지도 SDK를 불러오지 못했습니다.'));
        return;
      }

      window.kakao.maps.load(resolve);
    };
    script.onerror = () => {
      window.clearTimeout(timeoutId);
      reject(new Error('카카오 지도 SDK를 불러오지 못했습니다.'));
    };

    if (!currentScript) {
      document.head.appendChild(script);
    }
  });

const geocodeStationAddress = async (address: string) => {
  await loadKakaoMapSdk();

  const services = window.kakao?.maps?.services;

  if (!services) {
    throw new Error('카카오 주소 검색 서비스를 사용할 수 없습니다.');
  }

  return new Promise<{ lat: number; lng: number }>((resolve, reject) => {
    const geocoder = new services.Geocoder();

    geocoder.addressSearch(address, (result, status) => {
      const firstResult = result[0];

      if (status !== services.Status.OK || !firstResult) {
        reject(new Error(`주소의 위치를 찾지 못했습니다: ${address}`));
        return;
      }

      const lat = Number(firstResult.y);
      const lng = Number(firstResult.x);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        reject(new Error(`주소의 좌표가 올바르지 않습니다: ${address}`));
        return;
      }

      resolve({ lat, lng });
    });
  });
};

const emptyResetStats: ReservationDataResetStats = {
  reservations: 0,
  payments: 0,
  campusTransfers: 0,
  busAllocations: 0,
  campusRequests: 0,
  campusRequestMessages: 0,
  stations: 0,
  busOptions: 0,
  appSettings: 0,
  homeAnnouncements: 0,
  campusAdminRoles: 0,
  organization: 0,
  userAccounts: 0,
};

const defaultResetOptions: ReservationDataResetOptions = {
  reservations: true,
  payments: true,
  campusTransfers: true,
  busAllocations: true,
  campusRequests: true,
  stations: false,
  busOptions: false,
  appSettings: false,
  homeAnnouncements: false,
  campusAdminRoles: false,
  organization: false,
  userAccounts: false,
};

const getCampusKey = (district: string, team: string, campus: string) =>
  `campus|${district}|${team}|${campus}`;

const normalizeCampusRows = (rows: CampusOptionRow[]) =>
  rows.map((row, index, array) => {
    const district = row.district?.trim() || '미등록 지구';
    const team = row.team?.trim() || '미등록 팀';
    const campus = row.campus?.trim() || '미등록 캠퍼스';
    const baseKey = getCampusKey(district, team, campus);
    const duplicateIndex = array
      .slice(0, index)
      .filter(
        (target) =>
          (target.district?.trim() || '미등록 지구') === district &&
          (target.team?.trim() || '미등록 팀') === team &&
          (target.campus?.trim() || '미등록 캠퍼스') === campus
      ).length;

    return {
      key: duplicateIndex > 0 ? `${baseKey}|${duplicateIndex}` : baseKey,
      baseKey,
      district,
      team,
      campus,
    };
  });

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;

  if (error && typeof error === 'object') {
    const errorRecord = error as Record<string, unknown>;

    return String(
      errorRecord.message ||
        errorRecord.details ||
        errorRecord.hint ||
        errorRecord.code ||
        JSON.stringify(errorRecord)
    );
  }

  return '알 수 없는 오류가 발생했습니다.';
};

const AdminSetupCheckPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [savingPrice, setSavingPrice] = useState(false);
  const [savingAccountNumber, setSavingAccountNumber] = useState(false);
  const [savingStationId, setSavingStationId] = useState<string | null>(null);
  const [addingStation, setAddingStation] = useState(false);
  const [deletingStationId, setDeletingStationId] = useState<string | null>(
    null
  );
  const [resettingData, setResettingData] = useState(false);
  const [campuses, setCampuses] = useState<CampusSetupRow[]>([]);
  const [stations, setStations] = useState<StationSetupRow[]>([]);
  const [busTicketPrice, setBusTicketPrice] = useState(0);
  const [busTicketPriceInput, setBusTicketPriceInput] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountNumberInput, setAccountNumberInput] = useState('');
  const [resetStats, setResetStats] =
    useState<ReservationDataResetStats>(emptyResetStats);
  const [resetOptions, setResetOptions] =
    useState<ReservationDataResetOptions>(defaultResetOptions);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stationError, setStationError] = useState<string | null>(null);
  const [activeDetailId, setActiveDetailId] = useState<SetupDetailId | null>(
    null
  );
  const [stationDraft, setStationDraft] = useState<StationSetupRow | null>(
    null
  );
  const [newStationDraft, setNewStationDraft] = useState<NewStationDraft>(
    emptyNewStationDraft
  );

  const summary = useMemo(() => {
    const districtCount = new Set(campuses.map((row) => row.district)).size;
    const teamCount = new Set(
      campuses.map((row) => `${row.district}|${row.team}`)
    ).size;
    const totalTarget = campuses.reduce((sum, row) => sum + row.target, 0);
    const missingTargetCount = campuses.filter((row) => row.target <= 0).length;
    const missingAdminCount = campuses.filter((row) => !row.hasAdmin).length;

    return {
      districtCount,
      teamCount,
      campusCount: campuses.length,
      totalTarget,
      missingTargetCount,
      missingAdminCount,
    };
  }, [campuses]);

  const missingTargetCampuses = useMemo(
    () => campuses.filter((row) => row.target <= 0),
    [campuses]
  );
  const missingAdminCampuses = useMemo(
    () => campuses.filter((row) => !row.hasAdmin),
    [campuses]
  );

  const setupItems = [
    {
      id: 'organization',
      icon: Building2,
      title: '서울지구 팀/캠퍼스 구조 및 인원',
      description:
        '캠퍼스 목록이 맞는지 확인하고, 캠퍼스별 예상 참여 인원을 입력합니다.',
      status:
        summary.campusCount > 0 && summary.missingTargetCount === 0
          ? '설정 완료'
          : `${summary.missingTargetCount.toLocaleString()}개 캠퍼스 인원 미입력`,
      actionLabel: '인원 현황 및 설정',
      actionPath: '/admin/participation-targets',
      isReady: summary.campusCount > 0 && summary.missingTargetCount === 0,
    },
    {
      id: 'campus-admins',
      icon: ShieldCheck,
      title: '캠퍼스 관리자 배정',
      description:
        '각 캠퍼스의 회계 팀장이 캠퍼스 관리자로 등록되어 있는지 확인합니다.',
      status:
        summary.campusCount > 0 && summary.missingAdminCount === 0
          ? '설정 완료'
          : `${summary.campusCount.toLocaleString()}개 중 ${summary.missingAdminCount.toLocaleString()}개 캠퍼스 관리자 미등록`,
      actionLabel: '관리자 현황 및 설정',
      actionPath: '/admin/users',
      isReady: summary.campusCount > 0 && summary.missingAdminCount === 0,
    },
    {
      id: 'bus-price',
      icon: DollarSign,
      title: '버스표 가격',
      description:
        '사용자 신청, 입금 집계, 캠퍼스 송금 계산에 적용할 1인 버스표 가격을 설정합니다.',
      status:
        busTicketPrice > 0
          ? `${busTicketPrice.toLocaleString()}원`
          : '가격 미설정',
      actionLabel: '가격 저장',
      actionPath: '',
      isReady: busTicketPrice > 0,
    },
    {
      id: 'district-transfer-account',
      icon: Landmark,
      title: '서울지구 송금 계좌',
      description:
        '캠퍼스 관리자가 버스표 금액을 송금할 서울지구 계좌번호를 설정합니다.',
      status: accountNumber || '계좌번호 미설정',
      actionLabel: '계좌번호 저장',
      actionPath: '',
      isReady: Boolean(accountNumber),
    },
    {
      id: 'destinations',
      icon: MapPin,
      title: '행선지',
      description:
        '신청자가 귀가 버스의 희망 도착지로 선택할 수 있는 행선지를 확인합니다.',
      status:
        stations.length > 0
          ? `${stations.length.toLocaleString()}개 등록`
          : '행선지 미등록',
      actionLabel: '행선지 확인 및 수정',
      actionPath: '',
      isReady: stations.length > 0,
    },
  ];
  const readySetupCount = setupItems.filter((item) => item.isReady).length;
  const nextSetupItem = setupItems.find((item) => !item.isReady) ?? null;
  const setupProgressPercent = Math.round(
    (readySetupCount / setupItems.length) * 100
  );
  const selectedResetRows =
    (resetOptions.reservations ? resetStats.reservations : 0) +
    (resetOptions.reservations || resetOptions.payments
      ? resetStats.payments
      : 0) +
    (resetOptions.campusTransfers ? resetStats.campusTransfers : 0) +
    (resetOptions.busAllocations ? resetStats.busAllocations : 0) +
    (resetOptions.campusRequests
      ? resetStats.campusRequests + resetStats.campusRequestMessages
      : 0) +
    (resetOptions.stations ? resetStats.stations : 0) +
    (resetOptions.busOptions ? resetStats.busOptions : 0) +
    (resetOptions.appSettings ? resetStats.appSettings : 0) +
    (resetOptions.homeAnnouncements ? resetStats.homeAnnouncements : 0) +
    (resetOptions.campusAdminRoles ? resetStats.campusAdminRoles : 0) +
    (resetOptions.organization ? resetStats.organization : 0) +
    (resetOptions.userAccounts ? resetStats.userAccounts : 0);
  const hasSelectedUserReset = resetOptions.userAccounts;
  const hasSelectedSetupReset =
    resetOptions.stations ||
    resetOptions.busOptions ||
    resetOptions.appSettings ||
    resetOptions.homeAnnouncements ||
    resetOptions.campusAdminRoles ||
    resetOptions.organization ||
    resetOptions.userAccounts;
  const resetTargets = [
    {
      id: 'reservations',
      stage: 'application',
      label: '신청',
      count: resetStats.reservations,
      detail:
        resetStats.payments > 0
          ? `연결된 입금 ${resetStats.payments.toLocaleString()}건도 함께 삭제`
          : '신청 데이터',
      disabled: resetOptions.organization || resetOptions.userAccounts,
    },
    {
      id: 'payments',
      stage: 'application',
      label: '입금',
      count: resetStats.payments,
      detail: resetOptions.reservations
        ? '신청 초기화에 포함됨'
        : '입금 확인/환불 상태',
      disabled: resetOptions.reservations,
    },
    {
      id: 'campusTransfers',
      stage: 'operation',
      label: '캠퍼스 송금',
      count: resetStats.campusTransfers,
      detail: '본부 송금 보고/확인 기록',
      disabled: resetOptions.organization || resetOptions.userAccounts,
    },
    {
      id: 'busAllocations',
      stage: 'operation',
      label: '배차 결과',
      count: resetStats.busAllocations,
      detail: '저장된 배차 추천안',
      disabled: resetOptions.organization || resetOptions.userAccounts,
    },
    {
      id: 'campusRequests',
      stage: 'operation',
      label: '캠퍼스 문의',
      count: resetStats.campusRequests + resetStats.campusRequestMessages,
      detail:
        resetStats.campusRequestMessages > 0
          ? `문의와 메시지 ${resetStats.campusRequestMessages.toLocaleString()}건`
          : '문의 게시판 기록',
      disabled: resetOptions.organization || resetOptions.userAccounts,
    },
    {
      id: 'stations',
      stage: 'reference',
      label: '행선지',
      count: resetStats.stations,
      detail: '신청 화면의 행선지 목록',
      danger: true,
    },
    {
      id: 'busOptions',
      stage: 'reference',
      label: '버스 옵션',
      count: resetStats.busOptions,
      detail: '배차에 사용하는 버스 종류와 비용',
      danger: true,
    },
    {
      id: 'appSettings',
      stage: 'reference',
      label: '앱 설정',
      count: resetStats.appSettings,
      detail: '표 가격과 신청 마감일을 기본값으로 복원',
      danger: true,
    },
    {
      id: 'homeAnnouncements',
      stage: 'reference',
      label: '홈 공지',
      count: resetStats.homeAnnouncements,
      detail: '홈 화면 공지 전체',
      danger: true,
    },
    {
      id: 'campusAdminRoles',
      stage: 'users',
      label: '캠퍼스 관리자',
      count: resetStats.campusAdminRoles,
      detail: '전체 관리자 권한은 유지',
      danger: true,
      disabled: resetOptions.organization || resetOptions.userAccounts,
    },
    {
      id: 'organization',
      stage: 'reference',
      label: '조직 구조',
      count: resetStats.organization,
      detail: '지구·팀·캠퍼스 및 연결된 운영 데이터',
      danger: true,
    },
    {
      id: 'userAccounts',
      stage: 'users',
      label: '유저 계정·데이터',
      count: resetStats.userAccounts,
      detail: '현재 로그인한 전체 관리자만 유지',
      danger: true,
    },
  ] satisfies Array<{
    id: keyof ReservationDataResetOptions;
    stage: 'reference' | 'users' | 'application' | 'operation';
    label: string;
    count: number;
    detail: string;
    disabled?: boolean;
    danger?: boolean;
  }>;
  const resetStages = [
    {
      id: 'reference',
      step: '1단계',
      title: '기준정보 준비',
      description: '조직과 신청·배차에 필요한 기본 설정',
    },
    {
      id: 'users',
      step: '2단계',
      title: '사용자·권한 구성',
      description: '시뮬레이션 계정과 캠퍼스 관리자 권한',
    },
    {
      id: 'application',
      step: '3단계',
      title: '신청·입금 생성',
      description: '예약 신청과 연결된 입금 상태',
    },
    {
      id: 'operation',
      step: '4단계',
      title: '마감 후 운영',
      description: '송금, 문의, 배차 등 운영 결과',
    },
  ] as const;

  const loadSetup = async () => {
    setLoading(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        navigate('/admin/login');
        return;
      }

      const adminRole = await getAdminRole(session.user.id);

      if (!adminRole || adminRole.role !== 'global_admin') {
        alert('전체 관리자만 접근할 수 있습니다.');
        navigate('/');
        return;
      }

      const [
        campusResult,
        adminRoleResult,
        stationResult,
        ticketPrice,
        reservationDataStats,
        participationSetting,
        districtTransferAccountNumber,
      ] = await Promise.all([
        supabase
          .from('campus_options')
          .select('district, team, campus')
          .order('district', { ascending: true })
          .order('team', { ascending: true })
          .order('campus', { ascending: true }),
        supabase
          .from('admin_roles')
          .select('district, team, campus')
          .eq('role', 'campus_admin'),
        supabase
          .from('stations')
          .select('id, name, line, address, lat, lng, is_active')
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true }),
        getBusTicketPrice(),
        getReservationDataResetStats(),
        getParticipationTargetsSetting(),
        getDistrictTransferAccountNumber(),
      ]);

      if (campusResult.error) throw campusResult.error;
      if (adminRoleResult.error) throw adminRoleResult.error;
      if (stationResult.error) throw stationResult.error;

      const targets = participationSetting.targets;
      const adminKeys = new Set(
        ((adminRoleResult.data ?? []) as CampusAdminRoleRow[]).map((role) =>
          getCampusKey(role.district ?? '', role.team ?? '', role.campus ?? '')
        )
      );
      const savedCampusRows = participationSetting.rows;
      const sourceCampusRows =
        savedCampusRows && savedCampusRows.length > 0
          ? savedCampusRows
          : ((campusResult.data ?? []) as CampusOptionRow[]);
      const rows = normalizeCampusRows(sourceCampusRows).map((item) => ({
        key: item.key,
        district: item.district,
        team: item.team,
        campus: item.campus,
        target: Number(targets[item.key] ?? targets[item.baseKey] ?? 0),
        hasAdmin: adminKeys.has(item.baseKey),
      }));

      setCampuses(rows);
      setStations((stationResult.data ?? []) as StationSetupRow[]);
      setBusTicketPrice(ticketPrice);
      setBusTicketPriceInput(String(ticketPrice));
      setAccountNumber(districtTransferAccountNumber);
      setAccountNumberInput(districtTransferAccountNumber);
      setResetStats(reservationDataStats);
    } catch (loadError) {
      console.error('Failed to load setup check page:', loadError);
      setError(`설정 정보를 불러오지 못했습니다: ${getErrorMessage(loadError)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial page load is an external Supabase synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSetup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSetupDetail = (id: SetupDetailId) => {
    setStationDraft(null);
    setActiveDetailId((current) => (current === id ? null : id));
  };

  const startStationEdit = (station: StationSetupRow) => {
    setStationDraft({ ...station });
    setMessage(null);
    setError(null);
    setStationError(null);
  };

  const updateStationDraft = (
    field: 'name' | 'line' | 'address',
    value: string
  ) => {
    setStationError(null);
    setStationDraft((current) =>
      current ? { ...current, [field]: value } : current
    );
  };

  const handleSaveStation = async () => {
    if (!stationDraft) return;

    const name = stationDraft.name.trim();

    if (!name) {
      setStationError('행선지 이름을 입력해주세요.');
      return;
    }

    setSavingStationId(stationDraft.id);
    setMessage(null);
    setError(null);
    setStationError(null);

    try {
      const address = stationDraft.address?.trim() || null;
      const coordinates = address
        ? await geocodeStationAddress(address)
        : { lat: null, lng: null };
      const { data, error: updateError } = await supabase
        .from('stations')
        .update({
          name,
          line: stationDraft.line?.trim() || null,
          address,
          ...coordinates,
        })
        .eq('id', stationDraft.id)
        .select('id, name, line, address, lat, lng, is_active')
        .single();

      if (updateError) throw updateError;

      setStations((current) =>
        current.map((station) =>
          station.id === stationDraft.id
            ? (data as StationSetupRow)
            : station
        )
      );
      setStationDraft(null);
      setStationError(null);
      setMessage(`행선지 "${name}" 정보를 저장했습니다.`);
    } catch (saveError) {
      console.error('Failed to save station:', saveError);
      setStationError(
        `행선지 저장 중 오류가 발생했습니다: ${getErrorMessage(saveError)}`
      );
    } finally {
      setSavingStationId(null);
    }
  };

  const handleAddStation = async () => {
    const name = newStationDraft.name.trim();

    if (!name) {
      setStationError('추가할 행선지 이름을 입력해주세요.');
      return;
    }

    setAddingStation(true);
    setMessage(null);
    setError(null);
    setStationError(null);

    try {
      const address = newStationDraft.address.trim() || null;
      const coordinates = address
        ? await geocodeStationAddress(address)
        : { lat: null, lng: null };
      const { data, error: insertError } = await supabase
        .from('stations')
        .insert({
          name,
          line: newStationDraft.line.trim() || null,
          address,
          ...coordinates,
          is_active: true,
        })
        .select('id, name, line, address, lat, lng, is_active')
        .single();

      if (insertError) throw insertError;

      setStations((current) => [data as StationSetupRow, ...current]);
      setNewStationDraft(emptyNewStationDraft);
      setStationError(null);
      setMessage(`행선지 "${name}"을 추가했습니다.`);
    } catch (addError) {
      console.error('Failed to add station:', addError);
      setStationError(
        `행선지 추가 중 오류가 발생했습니다: ${getErrorMessage(addError)}`
      );
    } finally {
      setAddingStation(false);
    }
  };

  const handleDeleteStation = async (station: StationSetupRow) => {
    const confirmed = window.confirm(
      `"${station.name}" 행선지를 삭제하시겠습니까?\n삭제 후에는 신청 화면의 행선지 목록에서 제거됩니다.`
    );

    if (!confirmed) return;

    setDeletingStationId(station.id);
    setMessage(null);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from('stations')
        .delete()
        .eq('id', station.id);

      if (deleteError) throw deleteError;

      setStations((current) =>
        current.filter((item) => item.id !== station.id)
      );
      if (stationDraft?.id === station.id) setStationDraft(null);
      setMessage(`행선지 "${station.name}"을 삭제했습니다.`);
    } catch (deleteError) {
      console.error('Failed to delete station:', deleteError);
      setError(
        `행선지 삭제 중 오류가 발생했습니다: ${getErrorMessage(deleteError)}`
      );
    } finally {
      setDeletingStationId(null);
    }
  };

  const toggleResetOption = (id: keyof ReservationDataResetOptions) => {
    setResetOptions((prev) => {
      if (id === 'payments' && prev.reservations) return prev;
      if (
        (prev.organization || prev.userAccounts) &&
        [
          'reservations',
          'payments',
          'campusTransfers',
          'busAllocations',
          'campusRequests',
          'campusAdminRoles',
        ].includes(id)
      ) {
        return prev;
      }

      const next = {
        ...prev,
        [id]: !prev[id],
      };

      if (id === 'reservations' && next.reservations) {
        next.payments = true;
      }

      if (id === 'organization' && next.organization) {
        next.reservations = true;
        next.payments = true;
        next.campusTransfers = true;
        next.busAllocations = true;
        next.campusRequests = true;
        next.campusAdminRoles = true;
      }

      if (id === 'userAccounts' && next.userAccounts) {
        next.reservations = true;
        next.payments = true;
        next.campusTransfers = true;
        next.busAllocations = true;
        next.campusRequests = true;
        next.campusAdminRoles = true;
      }

      return next;
    });
  };

  const handleSaveBusTicketPrice = async () => {
    const nextPrice = Number(busTicketPriceInput);

    if (Number.isNaN(nextPrice) || nextPrice < 0) {
      setError('버스표 가격은 0 이상의 숫자로 입력해주세요.');
      return;
    }

    setSavingPrice(true);
    setMessage(null);
    setError(null);

    try {
      const savedPrice = await updateBusTicketPrice(nextPrice);

      setBusTicketPrice(savedPrice);
      setBusTicketPriceInput(String(savedPrice));
      setMessage(
        `버스표 가격을 ${savedPrice.toLocaleString()}원으로 저장했습니다.`
      );
    } catch (saveError) {
      console.error('Failed to save bus ticket price:', saveError);
      setError(
        `버스표 가격 저장 중 오류가 발생했습니다: ${getErrorMessage(saveError)}`
      );
    } finally {
      setSavingPrice(false);
    }
  };

  const handleSaveAccountNumber = async () => {
    const nextAccountNumber = accountNumberInput.trim();

    if (!nextAccountNumber) {
      setError('서울지구 송금 계좌번호를 입력해주세요.');
      return;
    }

    setSavingAccountNumber(true);
    setMessage(null);
    setError(null);

    try {
      const savedAccountNumber =
        await updateDistrictTransferAccountNumber(nextAccountNumber);

      setAccountNumber(savedAccountNumber);
      setAccountNumberInput(savedAccountNumber);
      setMessage('서울지구 송금 계좌번호를 저장했습니다.');
    } catch (saveError) {
      console.error('Failed to save district transfer account number:', saveError);
      setError(
        `서울지구 송금 계좌번호 저장 중 오류가 발생했습니다: ${getErrorMessage(saveError)}`
      );
    } finally {
      setSavingAccountNumber(false);
    }
  };

  const handleResetReservationData = async () => {
    const confirmText = hasSelectedUserReset
      ? '유저 데이터 전체 삭제'
      : hasSelectedSetupReset
        ? '전체 설정 초기화'
        : RESET_CONFIRM_TEXT;
    const confirmedText = window.prompt(
      `선택한 데이터를 삭제합니다.\n현재 화면 기준 ${selectedResetRows.toLocaleString()}건으로 표시됩니다.\n${
        hasSelectedUserReset
          ? '현재 로그인한 전체 관리자 계정과 프로필만 유지됩니다.'
          : '인증 계정, 프로필, 전체 관리자 권한은 유지됩니다.'
      }${
        hasSelectedUserReset
          ? '\n\n경고: 다른 모든 인증 계정과 연결 데이터가 영구 삭제됩니다.'
          : hasSelectedSetupReset
            ? '\n\n주의: 설정 데이터가 포함되어 신청 및 관리 기능에 즉시 영향을 줍니다.'
            : ''
      }\n\n계속하려면 "${confirmText}"를 입력해주세요.`
    );

    if (confirmedText !== confirmText) {
      setError(
        `초기화를 취소했습니다. 정확히 "${confirmText}"를 입력해야 합니다.`
      );
      setMessage(null);
      return;
    }

    setResettingData(true);
    setMessage(null);
    setError(null);

    try {
      const deletedStats = await resetReservationData(resetOptions);
      const deletedTotal = Object.values(deletedStats).reduce(
        (sum, count) => sum + count,
        0
      );

      await loadSetup();
      setMessage(
        `선택한 데이터 ${deletedTotal.toLocaleString()}건을 초기화했습니다.`
      );
    } catch (resetError) {
      console.error('Failed to reset reservation data:', resetError);
      setError(
        `신청정보 초기화 중 오류가 발생했습니다: ${getErrorMessage(resetError)}`
      );
    } finally {
      setResettingData(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.pageContainer}>
        <AdminHeader />
        <main className={styles.main}>
          <p className={styles.loadingText}>설정 정보를 불러오는 중...</p>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      <AdminHeader />

      <main className={styles.main}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate('/admin/global')}
        >
          <ArrowLeft size={16} />
          전체 관리자 대시보드
        </button>

        <section className={styles.header}>
          <div>
            <span className={styles.eyebrow}>Step 0</span>
            <h1>설정 확인</h1>
            <p>
              신청을 받기 전에 서울지구 조직 구조, 캠퍼스 관리자 권한, 버스표
              가격, 행선지를 먼저 확인합니다.
            </p>
          </div>

          <button
            type="button"
            className={styles.refreshButton}
            onClick={() => void loadSetup()}
          >
            <RefreshCw size={16} />
            새로고침
          </button>
        </section>

        <section className={styles.readinessPanel}>
          <div className={styles.readinessMain}>
            <span>초기 설정 준비율</span>
            <strong>{setupProgressPercent}%</strong>
            <div
              className={styles.progressTrack}
              role="progressbar"
              aria-label="초기 설정 준비율"
              aria-valuemin={0}
              aria-valuemax={setupItems.length}
              aria-valuenow={readySetupCount}
            >
              <div style={{ width: `${setupProgressPercent}%` }} />
            </div>
            <p>
              필수 설정 {setupItems.length}개 중 {readySetupCount}개가
              준비되었습니다.
            </p>
          </div>

          <div
            className={`${styles.readinessNextAction} ${
              nextSetupItem ? '' : styles.readinessComplete
            }`}
          >
            <div>
              <span>{nextSetupItem ? '다음으로 해결할 설정' : '설정 완료'}</span>
              <strong>
                {nextSetupItem
                  ? nextSetupItem.title
                  : '신청을 받을 준비가 되었습니다'}
              </strong>
              <p>
                {nextSetupItem
                  ? nextSetupItem.status
                  : '모든 필수 설정이 시스템 기준을 충족합니다.'}
              </p>
            </div>

            {nextSetupItem && (
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => {
                  if (
                    nextSetupItem.id === 'organization' ||
                    nextSetupItem.id === 'campus-admins' ||
                    nextSetupItem.id === 'destinations'
                  ) {
                    toggleSetupDetail(nextSetupItem.id);
                  } else {
                    document
                      .getElementById(`setup-${nextSetupItem.id}`)
                      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }}
              >
                {nextSetupItem.actionLabel}
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        </section>

        {(message || error) && (
          <p className={message ? styles.successMessage : styles.errorMessage}>
            {message || error}
          </p>
        )}

        <section className={styles.summaryGrid}>
          <div>
            <span>지구 / 팀 / 캠퍼스 / 예상 참여 인원</span>
            <strong>
              {summary.districtCount} / {summary.teamCount} /{' '}
              {summary.campusCount} / {summary.totalTarget.toLocaleString()}명
            </strong>
          </div>

          <div>
            <span>현재 버스표 가격</span>
            <strong>{busTicketPrice.toLocaleString()}원</strong>
          </div>

          <div>
            <span>서울지구 송금 계좌</span>
            <strong>{accountNumber || '미설정'}</strong>
          </div>

          <div>
            <span>등록 행선지</span>
            <strong>{stations.length.toLocaleString()}개</strong>
          </div>
        </section>

        <section className={styles.setupGrid}>
          {setupItems.map((item) => {
            const Icon = item.icon;

            return (
              <article
                key={item.id}
                id={`setup-${item.id}`}
                className={`${styles.setupCard} ${
                  item.isReady ? styles.setupCardReady : ''
                }`}
              >
                <div className={styles.cardTopRow}>
                  <div className={styles.iconBox}>
                    <Icon size={22} />
                  </div>
                </div>

                <div className={styles.cardBody}>
                  <h2>{item.title}</h2>
                  <p>{item.description}</p>
                  <span
                    className={
                      item.isReady ? styles.readyBadge : styles.warningBadge
                    }
                  >
                    {item.status}
                  </span>
                </div>

                {item.id === 'bus-price' ? (
                  <div className={styles.priceEditor}>
                    <label>
                      <span>1인 버스표 가격</span>
                      <input
                        type="number"
                        min={0}
                        value={busTicketPriceInput}
                        onChange={(event) =>
                          setBusTicketPriceInput(event.target.value)
                        }
                        placeholder="예: 20000"
                      />
                    </label>

                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => void handleSaveBusTicketPrice()}
                      disabled={savingPrice}
                    >
                      {savingPrice ? '저장 중...' : item.actionLabel}
                    </button>
                  </div>
                ) : item.id === 'district-transfer-account' ? (
                  <div className={styles.priceEditor}>
                    <label>
                      <span>서울지구 계좌번호</span>
                      <input
                        type="text"
                        value={accountNumberInput}
                        onChange={(event) =>
                          setAccountNumberInput(event.target.value)
                        }
                        placeholder="예: 국민 123456-01-123456"
                      />
                    </label>

                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => void handleSaveAccountNumber()}
                      disabled={savingAccountNumber}
                    >
                      {savingAccountNumber ? '저장 중...' : item.actionLabel}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => {
                      if (
                        item.id === 'organization' ||
                        item.id === 'campus-admins' ||
                        item.id === 'destinations'
                      ) {
                        toggleSetupDetail(item.id);
                      } else {
                        navigate(item.actionPath);
                      }
                    }}
                  >
                    {item.actionLabel}
                    {activeDetailId === item.id ? (
                      <ChevronUp size={16} />
                    ) : (
                      <ChevronDown size={16} />
                    )}
                  </button>
                )}
              </article>
            );
          })}
        </section>

        {activeDetailId === 'organization' && (
          <section className={styles.detailPanel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>
                  {missingTargetCampuses.length > 0
                    ? '인원을 먼저 입력할 캠퍼스'
                    : '캠퍼스별 인원 현황'}
                </h2>
                <p>
                  {missingTargetCampuses.length > 0
                    ? '예상 참여 인원이 비어 있는 캠퍼스를 보여줍니다.'
                    : '모든 캠퍼스의 예상 참여 인원이 입력되었습니다.'}
                </p>
              </div>
              <div className={styles.panelActions}>
                <span className={styles.panelCount}>
                  {(missingTargetCampuses.length > 0
                    ? missingTargetCampuses
                    : campuses
                  ).length.toLocaleString()}
                  개 표시
                </span>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => navigate('/admin/participation-targets')}
                >
                  구조 및 인원 설정
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>

            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>지구</th>
                    <th>팀</th>
                    <th>캠퍼스</th>
                    <th>인원</th>
                  </tr>
                </thead>
                <tbody>
                  {(missingTargetCampuses.length > 0
                    ? missingTargetCampuses
                    : campuses
                  ).map((row) => (
                    <tr key={row.key}>
                      <td>{row.district}</td>
                      <td>{row.team}</td>
                      <td>{row.campus}</td>
                      <td>{row.target > 0 ? `${row.target}명` : '미입력'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeDetailId === 'campus-admins' && (
          <section className={styles.detailPanel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>
                  {missingAdminCampuses.length > 0
                    ? '관리자를 먼저 배정할 캠퍼스'
                    : '캠퍼스별 관리자 현황'}
                </h2>
                <p>
                  {missingAdminCampuses.length > 0
                    ? '관리자가 등록되지 않은 캠퍼스를 보여줍니다.'
                    : '모든 캠퍼스에 관리자가 등록되었습니다.'}
                </p>
              </div>
              <div className={styles.panelActions}>
                <span className={styles.panelCount}>
                  {(missingAdminCampuses.length > 0
                    ? missingAdminCampuses
                    : campuses
                  ).length.toLocaleString()}
                  개 표시
                </span>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => navigate('/admin/users')}
                >
                  관리자 권한 설정
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>

            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>지구</th>
                    <th>팀</th>
                    <th>캠퍼스</th>
                    <th>관리자</th>
                  </tr>
                </thead>
                <tbody>
                  {(missingAdminCampuses.length > 0
                    ? missingAdminCampuses
                    : campuses
                  ).map((row) => (
                    <tr key={row.key}>
                      <td>{row.district}</td>
                      <td>{row.team}</td>
                      <td>{row.campus}</td>
                      <td>
                        <span
                          className={
                            row.hasAdmin
                              ? styles.readyBadge
                              : styles.warningBadge
                          }
                        >
                          {row.hasAdmin ? '등록됨' : '미등록'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeDetailId === 'destinations' && (
          <section className={styles.detailPanel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>행선지 확인 현황</h2>
                <p>
                  등록한 행선지는 사용자 신청 화면의 희망 도착지 선택 목록에
                  표시됩니다.
                </p>
              </div>
              <span className={styles.panelCount}>
                총 {stations.length.toLocaleString()}개
              </span>
            </div>

            <div className={styles.stationAddForm}>
              <input
                value={newStationDraft.name}
                onChange={(event) =>
                  {
                    setStationError(null);
                    setNewStationDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }));
                  }
                }
                placeholder="행선지 이름"
                aria-label="추가할 행선지 이름"
              />
              <input
                value={newStationDraft.line}
                onChange={(event) =>
                  {
                    setStationError(null);
                    setNewStationDraft((current) => ({
                      ...current,
                      line: event.target.value,
                    }));
                  }
                }
                placeholder="노선"
                aria-label="추가할 행선지 노선"
              />
              <input
                value={newStationDraft.address}
                onChange={(event) =>
                  {
                    setStationError(null);
                    setNewStationDraft((current) => ({
                      ...current,
                      address: event.target.value,
                    }));
                  }
                }
                placeholder="주소"
                aria-label="추가할 행선지 주소"
              />
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => void handleAddStation()}
                disabled={addingStation}
              >
                <Plus size={16} />
                {addingStation ? '추가 중...' : '행선지 추가'}
              </button>
            </div>

            {stationError && (
              <p className={styles.stationErrorMessage} role="alert">
                {stationError}
              </p>
            )}

            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>행선지</th>
                    <th>노선</th>
                    <th>주소</th>
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {stations.length > 0 ? (
                    stations.map((station) => {
                      const isEditing = stationDraft?.id === station.id;

                      return (
                        <tr key={station.id}>
                          <td>
                            {isEditing ? (
                              <input
                                className={styles.tableInput}
                                value={stationDraft.name}
                                onChange={(event) =>
                                  updateStationDraft('name', event.target.value)
                                }
                                aria-label={`${station.name} 행선지 이름`}
                              />
                            ) : (
                              station.name
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <input
                                className={styles.tableInput}
                                value={stationDraft.line ?? ''}
                                onChange={(event) =>
                                  updateStationDraft('line', event.target.value)
                                }
                                aria-label={`${station.name} 노선`}
                              />
                            ) : (
                              station.line || '-'
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <input
                                className={`${styles.tableInput} ${styles.addressInput}`}
                                value={stationDraft.address ?? ''}
                                onChange={(event) =>
                                  updateStationDraft(
                                    'address',
                                    event.target.value
                                  )
                                }
                                aria-label={`${station.name} 주소`}
                              />
                            ) : (
                              station.address || '-'
                            )}
                          </td>
                          <td>
                            <div className={styles.rowActions}>
                              {isEditing ? (
                                <>
                                  <button
                                    type="button"
                                    className={styles.rowSaveButton}
                                    onClick={() => void handleSaveStation()}
                                    disabled={savingStationId === station.id}
                                  >
                                    <Save size={14} />
                                    {savingStationId === station.id
                                      ? '저장 중'
                                      : '저장'}
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.rowCancelButton}
                                    onClick={() => setStationDraft(null)}
                                    disabled={savingStationId === station.id}
                                  >
                                    <X size={14} />
                                    취소
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className={styles.rowEditButton}
                                    onClick={() => startStationEdit(station)}
                                  >
                                    <Pencil size={14} />
                                    수정
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.rowDeleteButton}
                                    onClick={() =>
                                      void handleDeleteStation(station)
                                    }
                                    disabled={deletingStationId === station.id}
                                  >
                                    <Trash2 size={14} />
                                    {deletingStationId === station.id
                                      ? '삭제 중'
                                      : '삭제'}
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={4} className={styles.emptyTableCell}>
                        등록된 행선지가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className={styles.resetPanel}>
          <div className={styles.resetPanelHeader}>
            <div className={styles.resetIconBox}>
              <Database size={22} />
            </div>
            <div>
              <h2>DB 정보 초기화</h2>
              <p>
                운영 데이터뿐 아니라 행선지, 버스 옵션, 앱 설정, 공지,
                캠퍼스 관리자 권한, 조직 구조, 유저 계정을 선택적으로
                초기화합니다. 현재 로그인한 전체 관리자 계정은 보호됩니다.
              </p>
            </div>
          </div>

          <div className={styles.resetStageList}>
            {resetStages.map((stage) => {
              const stageTargets = resetTargets.filter(
                (target) => target.stage === stage.id
              );

              return (
                <section key={stage.id} className={styles.resetStage}>
                  <div className={styles.resetStageHeader}>
                    <span>{stage.step}</span>
                    <div>
                      <h3>{stage.title}</h3>
                      <p>{stage.description}</p>
                    </div>
                  </div>

                  <div className={styles.resetStatsGrid}>
                    {stageTargets.map((target) => (
                      <label
                        key={target.id}
                        className={`${styles.resetTargetCard} ${
                          resetOptions[target.id]
                            ? styles.resetTargetCardActive
                            : ''
                        } ${
                          target.disabled ? styles.resetTargetCardDisabled : ''
                        } ${target.danger ? styles.resetTargetCardDanger : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={resetOptions[target.id]}
                          disabled={target.disabled}
                          onChange={() => toggleResetOption(target.id)}
                        />
                        <span>{target.label}</span>
                        <strong>{target.count.toLocaleString()}건</strong>
                        <small>{target.detail}</small>
                      </label>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          <div className={styles.resetPanelFooter}>
            <p>
              선택한 {selectedResetRows.toLocaleString()}건은 삭제 후 되돌릴
              수 없습니다. 유저 데이터 삭제 시 현재 로그인한 전체 관리자
              계정만 보호됩니다. Supabase에
              `sql/setup/60_reset_reservation_data.sql`을 먼저 적용해야 합니다.
            </p>
            <button
              type="button"
              className={styles.dangerButton}
              onClick={() => void handleResetReservationData()}
              disabled={resettingData}
            >
              <Trash2 size={16} />
              {resettingData ? '초기화 중...' : '선택 정보 초기화'}
            </button>
          </div>
        </section>

      </main>
    </div>
  );
};

export default AdminSetupCheckPage;
