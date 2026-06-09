import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Bus,
  CalendarClock,
  CheckCircle2,
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
  UserCog,
  X,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import AdminHeader from './AdminHeader';
import {
  addBusOption,
  deleteBusOption,
  getBusOptions,
  getBusTicketPrice,
  getReservationDataResetStats,
  resetReservationData,
  updateBusOption,
  updateBusTicketPrice,
} from '../../lib/adminService';
import { supabase } from '../../lib/supabase';
import { getParticipationTargetsSetting } from '../../lib/participationTargetsService';
import {
  getDistrictTransferAccountNumber,
  updateDistrictTransferAccountNumber,
} from '../../lib/districtTransferAccountService';
import {
  getAllCampusPaymentAccounts,
  updateCampusPaymentAccount,
  type CampusPaymentAccount,
} from '../../lib/campusPaymentAccountService';
import {
  formatReservationDeadline,
  getReservationDeadline,
} from '../../lib/reservationDeadlineService';
import { geocodeKakaoAddress } from '../../utils/kakaoMapSdk';
import {
  RESET_CONFIRM_TEXT,
  countSelectedResetRows,
  defaultResetOptions,
  emptyBusOptionDraft,
  emptyNewCampusDraft,
  emptyNewStationDraft,
  emptyResetStats,
  getCampusKey,
  getErrorMessage,
  getSetupDetailFromSearch,
  hasSelectedSetupReset,
  normalizeCampusRows,
  parseBusOptionDraft,
  summarizeBusOptions,
  summarizeCampusSetup,
  type BusOptionDraft,
  type BusOptionRow,
  type CampusAdminRoleRow,
  type CampusOptionRow,
  type CampusSetupRow,
  type NewCampusDraft,
  type NewStationDraft,
  type ReservationDataResetOptions,
  type ReservationDataResetStats,
  type SetupDetailId,
  type StationSetupRow,
} from './adminSetupModel';

import styles from './AdminSetupCheckPage.module.css';

const AdminSetupCheckPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [savingPrice, setSavingPrice] = useState(false);
  const [savingAccountNumber, setSavingAccountNumber] = useState(false);
  const [savingCampusAccountId, setSavingCampusAccountId] = useState<
    string | null
  >(null);
  const [savingStationId, setSavingStationId] = useState<string | null>(null);
  const [savingBusOptionId, setSavingBusOptionId] = useState<string | null>(
    null
  );
  const [addingStation, setAddingStation] = useState(false);
  const [addingCampus, setAddingCampus] = useState(false);
  const [addingBusOption, setAddingBusOption] = useState(false);
  const [deletingStationId, setDeletingStationId] = useState<string | null>(
    null
  );
  const [deletingBusOptionId, setDeletingBusOptionId] = useState<string | null>(
    null
  );
  const [resettingData, setResettingData] = useState(false);
  const [showResetPanel, setShowResetPanel] = useState(
    () => location.hash === '#data-reset'
  );
  const [showCompletedSettings, setShowCompletedSettings] = useState(false);
  const [campuses, setCampuses] = useState<CampusSetupRow[]>([]);
  const [campusPaymentAccounts, setCampusPaymentAccounts] = useState<
    Record<string, CampusPaymentAccount>
  >({});
  const [savedCampusPaymentAccountIds, setSavedCampusPaymentAccountIds] =
    useState<Set<string>>(new Set());
  const [stations, setStations] = useState<StationSetupRow[]>([]);
  const [busOptions, setBusOptions] = useState<BusOptionRow[]>([]);
  const [busTicketPrice, setBusTicketPrice] = useState(0);
  const [busTicketPriceInput, setBusTicketPriceInput] = useState('');
  const [boardingManagerCount, setBoardingManagerCount] = useState(0);
  const [deadlineAt, setDeadlineAt] = useState<string | null>(null);
  const [accountNumber, setAccountNumber] = useState('');
  const [accountNumberInput, setAccountNumberInput] = useState('');
  const [resetStats, setResetStats] =
    useState<ReservationDataResetStats>(emptyResetStats);
  const [resetOptions, setResetOptions] =
    useState<ReservationDataResetOptions>(defaultResetOptions);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stationError, setStationError] = useState<string | null>(null);
  const [campusError, setCampusError] = useState<string | null>(null);
  const [activeDetailId, setActiveDetailId] = useState<SetupDetailId | null>(
    () => getSetupDetailFromSearch(location.search)
  );
  const [detailPortalTarget, setDetailPortalTarget] =
    useState<HTMLElement | null>(null);
  const [stationDraft, setStationDraft] = useState<StationSetupRow | null>(
    null
  );
  const [busOptionDraft, setBusOptionDraft] = useState<{
    id: string;
    values: BusOptionDraft;
  } | null>(null);
  const [newStationDraft, setNewStationDraft] = useState<NewStationDraft>(
    emptyNewStationDraft
  );
  const [newCampusDraft, setNewCampusDraft] = useState<NewCampusDraft>(
    emptyNewCampusDraft
  );
  const [newBusOptionDraft, setNewBusOptionDraft] = useState<BusOptionDraft>(
    emptyBusOptionDraft
  );

  const summary = useMemo(
    () => summarizeCampusSetup(campuses, savedCampusPaymentAccountIds),
    [campuses, savedCampusPaymentAccountIds]
  );

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
      actionPath: '/admin/settings/participation-targets',
      isReady: summary.campusCount > 0 && summary.missingTargetCount === 0,
    },
    {
      id: 'campus-payment-accounts',
      icon: Landmark,
      title: '캠퍼스별 회계 순장님 입금 계좌',
      description:
        '신청자가 버스표 금액을 입금할 캠퍼스별 은행, 계좌번호, 예금주를 설정합니다.',
      status:
        summary.campusCount > 0 && summary.missingPaymentAccountCount === 0
          ? '설정 완료'
          : `${summary.missingPaymentAccountCount.toLocaleString()}개 캠퍼스 계좌 미설정`,
      actionLabel: '입금 계좌 설정',
      actionPath: '',
      isReady:
        summary.campusCount > 0 && summary.missingPaymentAccountCount === 0,
    },
    {
      id: 'campus-admins',
      icon: ShieldCheck,
      title: '캠퍼스 회계 순장님 배정',
      description:
        '각 캠퍼스의 회계 팀장이 캠퍼스 회계 순장님으로 등록되어 있는지 확인합니다.',
      status:
        summary.campusCount > 0 && summary.missingAdminCount === 0
          ? '설정 완료'
          : `${summary.campusCount.toLocaleString()}개 중 ${summary.missingAdminCount.toLocaleString()}개 캠퍼스 회계 순장님 미등록`,
      actionLabel: '관리자 현황 및 설정',
      actionPath: '/admin/access/campus-admins',
      isReady: summary.campusCount > 0 && summary.missingAdminCount === 0,
    },
    {
      id: 'boarding-managers',
      icon: UserCog,
      title: '탑승 관리 간사님 관리',
      description:
        '탑승 확인을 담당할 탑승 관리 간사님 권한과 담당 호차를 지정합니다.',
      status:
        boardingManagerCount > 0
          ? `${boardingManagerCount.toLocaleString()}명 지정`
          : '탑승 관리 간사님 미지정',
      actionLabel: '탑승 관리 간사님 관리',
      actionPath: '/admin/access/boarding-managers',
      isReady: boardingManagerCount > 0,
    },
    {
      id: 'destinations',
      icon: MapPin,
      title: '행선지',
      description:
        '신청자가 귀가 버스의 희망 행선지로 선택할 수 있는 행선지를 확인합니다.',
      status:
        stations.length > 0
          ? `${stations.length.toLocaleString()}개 등록`
          : '행선지 미등록',
      actionLabel: '행선지 확인 및 수정',
      actionPath: '',
      isReady: stations.length > 0,
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
      id: 'bus-options',
      icon: Bus,
      title: '버스 옵션',
      description:
        '배차 계산에 사용할 버스의 좌석 수, 예상 가격, 사용 가능 대수를 설정합니다.',
      status:
        busOptions.length > 0
          ? `${busOptions.length.toLocaleString()}개 등록`
          : '버스 옵션 미등록',
      actionLabel: '버스 옵션 확인 및 수정',
      actionPath: '',
      isReady: busOptions.length > 0,
    },
    {
      id: 'district-transfer-account',
      icon: Landmark,
      title: '서울지구 송금 계좌',
      description:
        '캠퍼스 회계 순장님이 버스표 금액을 송금할 서울지구 계좌 번호를 설정합니다.',
      status: accountNumber || '계좌 번호 미설정',
      actionLabel: '계좌 번호 저장',
      actionPath: '',
      isReady: Boolean(accountNumber),
    },
    {
      id: 'reservation-deadline',
      icon: CalendarClock,
      title: '신청 마감 일시',
      description:
        '신청과 수정이 종료되는 날짜와 시간을 설정합니다. 비우면 마감 제한이 해제됩니다.',
      status: deadlineAt ? '신청 마감 일시 설정됨' : '신청 마감 일시 미설정',
      actionLabel: '신청 마감 일시 저장',
      actionPath: '/admin/settings/reservation-deadline',
      isReady: Boolean(deadlineAt),
    },
  ];
  const readySetupCount = setupItems.filter((item) => item.isReady).length;
  const pendingSetupItems = setupItems.filter((item) => !item.isReady);
  const completedSetupItems = setupItems.filter((item) => item.isReady);
  const busOptionSummary = useMemo(
    () => summarizeBusOptions(busOptions),
    [busOptions]
  );
  const setupProgressPercent = Math.round(
    (readySetupCount / setupItems.length) * 100
  );
  const selectedResetRows = countSelectedResetRows(resetStats, resetOptions);
  const hasSelectedUserReset = resetOptions.userAccounts;
  const includesSetupReset = hasSelectedSetupReset(resetOptions);
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
      detail: '버스표 가격과 신청 마감 일시를 기본값으로 복원',
      danger: true,
    },
    {
      id: 'homeAnnouncements',
      stage: 'reference',
      label: '홈 화면 공지',
      count: resetStats.homeAnnouncements,
      detail: '홈 화면 공지 전체',
      danger: true,
    },
    {
      id: 'campusAdminRoles',
      stage: 'users',
      label: '캠퍼스 회계 순장님',
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
      label: '사용자 계정·데이터',
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
      description: '시뮬레이션 계정과 캠퍼스 회계 순장님 권한',
    },
    {
      id: 'application',
      step: '3단계',
      title: '신청·입금 생성',
      description: '신청과 연결된 입금 상태',
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
      const [
        campusResult,
        adminRoleResult,
        boardingManagerRoleResult,
        stationResult,
        ticketPrice,
        reservationDataStats,
        participationSetting,
        districtTransferAccountNumber,
        savedBusOptions,
        reservationDeadline,
        savedCampusPaymentAccounts,
      ] = await Promise.all([
        supabase
          .from('campus_options')
          .select('campus_id, district, team, campus')
          .order('district', { ascending: true })
          .order('team', { ascending: true })
          .order('campus', { ascending: true }),
        supabase
          .from('admin_roles')
          .select('district, team, campus')
          .eq('role', 'campus_admin'),
        supabase
          .from('admin_roles')
          .select('id')
          .eq('role', 'boarding_manager'),
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
        getBusOptions(),
        getReservationDeadline(),
        getAllCampusPaymentAccounts(),
      ]);

      if (campusResult.error) throw campusResult.error;
      if (adminRoleResult.error) throw adminRoleResult.error;
      if (boardingManagerRoleResult.error) throw boardingManagerRoleResult.error;
      if (stationResult.error) throw stationResult.error;

      const targets = participationSetting.targets;
      const adminKeys = new Set(
        ((adminRoleResult.data ?? []) as CampusAdminRoleRow[]).map((role) =>
          getCampusKey(role.district ?? '', role.team ?? '', role.campus ?? '')
        )
      );
      const sourceCampusRows = (campusResult.data ?? []) as CampusOptionRow[];
      const rows = normalizeCampusRows(sourceCampusRows).map((item) => ({
        key: item.key,
        campusId: item.campusId,
        district: item.district,
        team: item.team,
        campus: item.campus,
        target: Number(targets[item.key] ?? targets[item.baseKey] ?? 0),
        hasAdmin: adminKeys.has(item.baseKey),
      }));

      setCampuses(rows);
      setCampusPaymentAccounts(
        Object.fromEntries(
          savedCampusPaymentAccounts.map((account) => [
            account.campusId,
            account,
          ])
        )
      );
      setSavedCampusPaymentAccountIds(
        new Set(savedCampusPaymentAccounts.map((account) => account.campusId))
      );
      setStations((stationResult.data ?? []) as StationSetupRow[]);
      setBusOptions(savedBusOptions as BusOptionRow[]);
      setBusTicketPrice(ticketPrice);
      setBusTicketPriceInput(String(ticketPrice));
      setBoardingManagerCount(boardingManagerRoleResult.data?.length ?? 0);
      setDeadlineAt(reservationDeadline.deadlineAt);
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
  }, []);

  useEffect(() => {
    if (!activeDetailId || loading) return;

    window.setTimeout(() => {
      document
        .getElementById(`detail-${activeDetailId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }, [activeDetailId, detailPortalTarget, loading]);

  useEffect(() => {
    if (loading || location.hash !== '#data-reset') return;

    window.setTimeout(() => {
      document
        .getElementById('data-reset')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }, [loading, location.hash]);

  const toggleSetupDetail = (id: SetupDetailId) => {
    setStationDraft(null);
    setBusOptionDraft(null);
    setDetailPortalTarget(null);
    setActiveDetailId((current) => (current === id ? null : id));
  };

  const updateCampusAccountDraft = (
    campusId: string,
    field: 'bankName' | 'accountNumber' | 'accountHolder',
    value: string
  ) => {
    setCampusError(null);
    setCampusPaymentAccounts((current) => ({
      ...current,
      [campusId]: {
        campusId,
        bankName: current[campusId]?.bankName ?? '',
        accountNumber: current[campusId]?.accountNumber ?? '',
        accountHolder: current[campusId]?.accountHolder ?? '',
        [field]: value,
      },
    }));
  };

  const handleSaveCampusPaymentAccount = async (campus: CampusSetupRow) => {
    const account = campusPaymentAccounts[campus.campusId];

    if (
      !account?.bankName.trim() ||
      !account.accountNumber.trim() ||
      !account.accountHolder.trim()
    ) {
      setCampusError(
        `${campus.campus}의 은행, 계좌번호, 예금주를 모두 입력해주세요.`
      );
      return;
    }

    setSavingCampusAccountId(campus.campusId);
    setCampusError(null);
    setMessage(null);
    setError(null);

    try {
      const saved = await updateCampusPaymentAccount(account);
      setCampusPaymentAccounts((current) => ({
        ...current,
        [saved.campusId]: saved,
      }));
      setSavedCampusPaymentAccountIds((current) => {
        const next = new Set(current);
        next.add(saved.campusId);
        return next;
      });
      setMessage(`${campus.campus} 사용자 입금 계좌를 저장했습니다.`);
    } catch (saveError) {
      setCampusError(
        `${campus.campus} 입금 계좌를 저장하지 못했습니다: ${getErrorMessage(
          saveError
        )}`
      );
    } finally {
      setSavingCampusAccountId(null);
    }
  };

  const startStationEdit = (station: StationSetupRow) => {
    setStationDraft({ ...station });
    setMessage(null);
    setError(null);
    setStationError(null);
  };

  const handleAddCampus = async () => {
    const districtName = newCampusDraft.district.trim();
    const teamName = newCampusDraft.team.trim();
    const campusName = newCampusDraft.campus.trim();

    if (!districtName || !teamName || !campusName) {
      setCampusError('지구, 팀, 캠퍼스 이름을 모두 입력해주세요.');
      return;
    }

    setAddingCampus(true);
    setMessage(null);
    setError(null);
    setCampusError(null);

    try {
      const { error: campusError } = await supabase.rpc(
        'create_campus_scope_as_global_admin',
        { p_district: districtName, p_team: teamName, p_campus: campusName }
      );
      if (campusError) throw campusError;

      /*const campusLookup = await supabase
        .from('campuses')
        .select('id')
        .eq('team_id', teamId)
        .eq('name', campusName)
        .maybeSingle();
      if (campusLookup.error) throw campusLookup.error;
      if (campusLookup.data) {
        setCampusError('같은 지구와 팀에 이미 등록된 캠퍼스입니다.');
        return;
      }

      const campusInsert = await supabase
        .from('campuses')
        .insert({ team_id: teamId, name: campusName, is_active: true });
      if (campusInsert.error) throw campusInsert.error;*/

      setNewCampusDraft(emptyNewCampusDraft);
      setMessage(
        `${districtName} / ${teamName} / ${campusName} 캠퍼스를 등록했습니다.`
      );
      await loadSetup();
      setActiveDetailId('organization');
    } catch (addError) {
      console.error('Failed to add campus:', addError);
      setCampusError(
        `캠퍼스 등록 중 오류가 발생했습니다: ${getErrorMessage(addError)}`
      );
    } finally {
      setAddingCampus(false);
    }
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
        ? await geocodeKakaoAddress(address)
        : { lat: null, lng: null };
      const { data, error: updateError } = await supabase.rpc(
        'upsert_station_as_global_admin',
        {
          p_id: stationDraft.id,
          p_name: name,
          p_line: stationDraft.line?.trim() || null,
          p_address: address,
          p_lat: coordinates.lat,
          p_lng: coordinates.lng,
        }
      );

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
        ? await geocodeKakaoAddress(address)
        : { lat: null, lng: null };
      const { data, error: insertError } = await supabase.rpc(
        'upsert_station_as_global_admin',
        {
          p_id: null,
          p_name: name,
          p_line: newStationDraft.line.trim() || null,
          p_address: address,
          p_lat: coordinates.lat,
          p_lng: coordinates.lng,
        }
      );

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
      const { error: deleteError } = await supabase.rpc(
        'delete_station_as_global_admin',
        { p_id: station.id }
      );

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

  const handleAddBusOption = async () => {
    if (busOptions.length > 0) {
      setError('버스 옵션은 하나만 등록할 수 있습니다. 기존 옵션을 수정해주세요.');
      return;
    }

    setAddingBusOption(true);
    setMessage(null);
    setError(null);

    try {
      const values = parseBusOptionDraft(newBusOptionDraft);

      await addBusOption(
        values.capacity,
        values.estimatedPrice,
        values.notes ?? undefined,
        values.maxCount
      );

      setBusOptions((await getBusOptions()) as BusOptionRow[]);
      setNewBusOptionDraft(emptyBusOptionDraft);
      setMessage('버스 옵션을 추가했습니다.');
    } catch (addError) {
      console.error('Failed to add bus option:', addError);
      setError(`버스 옵션 추가에 실패했습니다: ${getErrorMessage(addError)}`);
    } finally {
      setAddingBusOption(false);
    }
  };

  const startBusOptionEdit = (option: BusOptionRow) => {
    setBusOptionDraft({
      id: option.id,
      values: {
        capacity: String(option.capacity),
        estimatedPrice: String(option.estimated_price),
        maxCount: String(option.max_count ?? 999),
        notes: option.notes ?? '',
      },
    });
    setMessage(null);
    setError(null);
  };

  const updateBusOptionDraft = (
    field: keyof BusOptionDraft,
    value: string
  ) => {
    setError(null);
    setBusOptionDraft((current) =>
      current
        ? { ...current, values: { ...current.values, [field]: value } }
        : current
    );
  };

  const handleSaveBusOption = async () => {
    if (!busOptionDraft) return;

    setSavingBusOptionId(busOptionDraft.id);
    setMessage(null);
    setError(null);

    try {
      const values = parseBusOptionDraft(busOptionDraft.values);
      await updateBusOption(
        busOptionDraft.id,
        values.capacity,
        values.estimatedPrice,
        values.notes,
        values.maxCount
      );

      setBusOptions((await getBusOptions()) as BusOptionRow[]);
      setBusOptionDraft(null);
      setMessage('버스 옵션을 수정했습니다.');
    } catch (saveError) {
      console.error('Failed to save bus option:', saveError);
      setError(`버스 옵션 수정에 실패했습니다: ${getErrorMessage(saveError)}`);
    } finally {
      setSavingBusOptionId(null);
    }
  };

  const handleDeleteBusOption = async (option: BusOptionRow) => {
    if (!window.confirm(`${option.capacity}인승 버스 옵션을 삭제할까요?`)) {
      return;
    }

    setDeletingBusOptionId(option.id);
    setMessage(null);
    setError(null);

    try {
      await deleteBusOption(option.id);
      setBusOptions((current) =>
        current.filter((item) => item.id !== option.id)
      );
      if (busOptionDraft?.id === option.id) setBusOptionDraft(null);
      setMessage('버스 옵션을 삭제했습니다.');
    } catch (deleteError) {
      console.error('Failed to delete bus option:', deleteError);
      setError(`버스 옵션 삭제에 실패했습니다: ${getErrorMessage(deleteError)}`);
    } finally {
      setDeletingBusOptionId(null);
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
      setError('서울지구 송금 계좌 번호를 입력해주세요.');
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
      setMessage('서울지구 송금 계좌 번호를 저장했습니다.');
    } catch (saveError) {
      console.error('Failed to save district transfer account number:', saveError);
      setError(
        `서울지구 송금 계좌 번호 저장 중 오류가 발생했습니다: ${getErrorMessage(saveError)}`
      );
    } finally {
      setSavingAccountNumber(false);
    }
  };

  const handleResetReservationData = async () => {
    const confirmText = hasSelectedUserReset
      ? '사용자 데이터 전체 삭제'
      : includesSetupReset
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
          : includesSetupReset
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

  const renderSetupItem = (
    item: (typeof setupItems)[number],
    index: number,
    emphasize = false
  ) => {
    const Icon = item.icon;
    const detailId: SetupDetailId | null =
      item.id === 'organization'
        ? 'organization'
        : item.id === 'campus-payment-accounts'
          ? 'campus-payment-accounts'
          : item.id === 'campus-admins'
            ? 'campus-admins'
            : item.id === 'destinations'
              ? 'destinations'
              : item.id === 'bus-options'
                ? 'bus-options'
                : null;
    const hasDetailPanel = detailId !== null;

    return (
      <div key={item.id} className={styles.setupItemGroup}>
        <article
          id={`setup-${item.id}`}
          className={`${styles.setupRow} ${
            item.isReady ? styles.setupRowReady : styles.setupRowPending
          } ${emphasize ? styles.setupRowPriority : ''} ${
            activeDetailId === item.id ? styles.setupRowActive : ''
          }`}
        >
          <div className={styles.setupIdentity}>
            <span className={styles.setupNumber}>
              {String(index + 1).padStart(2, '0')}
            </span>
            <div className={styles.iconBox}>
              <Icon size={20} />
            </div>
            <div className={styles.setupCopy}>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </div>
          </div>

          <div className={styles.setupStatus}>
            <span>현재 상태</span>
            <div>
              <span
                className={item.isReady ? styles.readyBadge : styles.warningBadge}
              >
                {item.status}
              </span>
            </div>
          </div>

          <div className={styles.setupControl}>
            {item.id === 'bus-price' ? (
              <div className={styles.inlineEditor}>
                <input
                  type="number"
                  min={0}
                  value={busTicketPriceInput}
                  onChange={(event) => setBusTicketPriceInput(event.target.value)}
                  placeholder="예: 20000"
                  aria-label="1인 버스표 가격"
                />
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => void handleSaveBusTicketPrice()}
                  disabled={savingPrice}
                >
                  {savingPrice ? '저장 중...' : busTicketPrice > 0 ? '수정' : '설정하기'}
                </button>
              </div>
            ) : item.id === 'district-transfer-account' ? (
              <div className={styles.inlineEditor}>
                <input
                  type="text"
                  value={accountNumberInput}
                  onChange={(event) => setAccountNumberInput(event.target.value)}
                  placeholder="예: 국민 123456-01-123456"
                  aria-label="서울지구 계좌 번호"
                />
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => void handleSaveAccountNumber()}
                  disabled={savingAccountNumber}
                >
                  {savingAccountNumber ? '저장 중...' : accountNumber ? '수정' : '설정하기'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={`${styles.detailToggleButton} ${
                  !item.isReady ? styles.priorityActionButton : ''
                }`}
                onClick={() => {
                  if (hasDetailPanel) {
                    toggleSetupDetail(detailId);
                  } else {
                    navigate(item.actionPath);
                  }
                }}
                aria-label={
                  hasDetailPanel
                    ? `${item.title} ${
                        activeDetailId === item.id
                          ? '접기'
                          : item.isReady
                            ? '펼치기'
                            : '설정하기'
                      }`
                    : `${item.title} ${item.actionLabel}`
                }
                aria-expanded={
                  hasDetailPanel ? activeDetailId === item.id : undefined
                }
              >
                <span>
                  {hasDetailPanel
                    ? activeDetailId === item.id
                      ? '접기'
                      : item.isReady
                        ? '펼치기'
                        : '설정하기'
                    : item.actionLabel}
                </span>
                {hasDetailPanel ? (
                  activeDetailId === item.id ? (
                    <ChevronUp size={16} />
                  ) : (
                    <ChevronDown size={16} />
                  )
                ) : (
                  <ArrowRight size={16} />
                )}
              </button>
            )}
          </div>
        </article>
        <div
          id={`detail-slot-${item.id}`}
          ref={activeDetailId === item.id ? setDetailPortalTarget : undefined}
        />
      </div>
    );
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
          onClick={() => navigate('/admin/dashboard')}
        >
          <ArrowLeft size={16} />
          전체 관리자 대시보드
        </button>

        <section className={styles.header}>
          <div>
            <span className={styles.eyebrow}>Step 0</span>
            <h1>운영 설정·초기화</h1>
            <p>
              신청을 받기 전에 조직 구조, 관리자 권한, 탑승 관리 간사님, 요금, 송금
              계좌, 행선지, 버스 옵션과 신청 마감 일시를 설정합니다.
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
            <span>초기 설정 완료 항목</span>
            <strong>
              {readySetupCount}
              <small> / {setupItems.length}개</small>
            </strong>
            <div
              className={styles.progressTrack}
              role="progressbar"
              aria-label="초기 설정 완료 항목"
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
        </section>

        {(message || error) && (
          <p className={message ? styles.successMessage : styles.errorMessage}>
            {message || error}
          </p>
        )}

        <div className={styles.sectionHeading}>
          <div>
            <span>지금 필요한 작업</span>
            <h2>미완료 필수 설정</h2>
            <p>운영을 시작하기 전에 아래 항목을 먼저 완료해주세요.</p>
          </div>
          <strong>
            {pendingSetupItems.length}개 남음
          </strong>
        </div>

        <section className={styles.setupList}>
          {pendingSetupItems.length > 0 ? (
            pendingSetupItems.map((item, index) =>
              renderSetupItem(item, index, true)
            )
          ) : (
            <div className={styles.allReadyState}>
              <CheckCircle2 size={22} />
              <div>
                <strong>모든 필수 설정이 완료되었습니다.</strong>
                <p>완료된 설정은 아래에서 펼쳐 확인하거나 수정할 수 있습니다.</p>
              </div>
            </div>
          )}
        </section>

        <section className={styles.completedSettings}>
          <button
            type="button"
            className={styles.completedSettingsToggle}
            onClick={() => setShowCompletedSettings((current) => !current)}
            aria-expanded={showCompletedSettings}
          >
            <span>
              <CheckCircle2 size={17} />
              완료된 설정 보기
              <strong>{completedSetupItems.length}개</strong>
            </span>
            {showCompletedSettings ? (
              <ChevronUp size={17} />
            ) : (
              <ChevronDown size={17} />
            )}
          </button>

          {showCompletedSettings && (
            <div className={styles.completedSettingsList}>
              {completedSetupItems.map((item, index) =>
                renderSetupItem(item, pendingSetupItems.length + index)
              )}
            </div>
          )}
        </section>

        {detailPortalTarget &&
          createPortal(
            <>
        {activeDetailId === 'organization' && (
          <section
            id="detail-organization"
            className={styles.detailPanel}
          >
            <div className={styles.panelHeader}>
              <div>
                <h2>실제 조직 및 캠퍼스 등록</h2>
                <p>
                  지구와 팀이 없으면 함께 생성하고, 실제 운영에 사용할 캠퍼스를
                  조직 구조에 등록합니다.
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
                  onClick={() => navigate('/admin/settings/participation-targets')}
                >
                  구조 및 인원 설정
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>

            <div className={styles.campusAddPanel}>
              <div className={styles.busOptionAddHeading}>
                <div>
                  <strong>새 캠퍼스 등록</strong>
                  <span>없는 지구와 팀은 등록 과정에서 함께 생성됩니다.</span>
                </div>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => void handleAddCampus()}
                  disabled={addingCampus}
                >
                  <Plus size={16} />
                  {addingCampus ? '등록 중...' : '캠퍼스 등록'}
                </button>
              </div>

              <div className={styles.campusAddForm}>
                <label>
                  <span>지구</span>
                  <input
                    value={newCampusDraft.district}
                    onChange={(event) => {
                      setCampusError(null);
                      setNewCampusDraft((current) => ({
                        ...current,
                        district: event.target.value,
                      }));
                    }}
                    placeholder="예: 서울지구"
                  />
                </label>
                <label>
                  <span>팀</span>
                  <input
                    value={newCampusDraft.team}
                    onChange={(event) => {
                      setCampusError(null);
                      setNewCampusDraft((current) => ({
                        ...current,
                        team: event.target.value,
                      }));
                    }}
                    placeholder="예: 동팀"
                  />
                </label>
                <label>
                  <span>캠퍼스</span>
                  <input
                    value={newCampusDraft.campus}
                    onChange={(event) => {
                      setCampusError(null);
                      setNewCampusDraft((current) => ({
                        ...current,
                        campus: event.target.value,
                      }));
                    }}
                    placeholder="예: 서울대학교"
                  />
                </label>
              </div>
            </div>

            {campusError && (
              <p className={styles.stationErrorMessage} role="alert">
                {campusError}
              </p>
            )}

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

        {activeDetailId === 'campus-payment-accounts' && (
          <section
            id="detail-campus-payment-accounts"
            className={styles.detailPanel}
          >
            <div className={styles.panelHeader}>
              <div>
                <h2>캠퍼스별 회계 순장님 입금 계좌</h2>
                <p>
                  신청자가 선택한 캠퍼스에 맞는 계좌가 신청 확인 화면에
                  표시됩니다.
                </p>
              </div>
              <span className={styles.panelCount}>
                미설정 {summary.missingPaymentAccountCount.toLocaleString()}개
              </span>
            </div>

            {campusError && (
              <p className={styles.stationErrorMessage} role="alert">
                {campusError}
              </p>
            )}

            <div className={styles.tableWrap}>
              <table className={styles.paymentAccountTable}>
                <thead>
                  <tr>
                    <th>캠퍼스</th>
                    <th>은행</th>
                    <th>계좌번호</th>
                    <th>예금주</th>
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {campuses.map((campus) => {
                    const account = campusPaymentAccounts[campus.campusId];
                    const isSaving = savingCampusAccountId === campus.campusId;

                    return (
                      <tr key={campus.key}>
                        <td>
                          <strong>{campus.campus}</strong>
                          <small className={styles.tableSubText}>
                            {campus.district} / {campus.team}
                          </small>
                        </td>
                        <td>
                          <input
                            className={styles.accountTableInput}
                            value={account?.bankName ?? ''}
                            onChange={(event) =>
                              updateCampusAccountDraft(
                                campus.campusId,
                                'bankName',
                                event.target.value
                              )
                            }
                            placeholder="예: 국민은행"
                            aria-label={`${campus.campus} 은행`}
                          />
                        </td>
                        <td>
                          <input
                            className={styles.accountNumberInput}
                            value={account?.accountNumber ?? ''}
                            onChange={(event) =>
                              updateCampusAccountDraft(
                                campus.campusId,
                                'accountNumber',
                                event.target.value
                              )
                            }
                            placeholder="계좌번호"
                            aria-label={`${campus.campus} 계좌번호`}
                          />
                        </td>
                        <td>
                          <input
                            className={styles.accountTableInput}
                            value={account?.accountHolder ?? ''}
                            onChange={(event) =>
                              updateCampusAccountDraft(
                                campus.campusId,
                                'accountHolder',
                                event.target.value
                              )
                            }
                            placeholder="예금주"
                            aria-label={`${campus.campus} 예금주`}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className={styles.rowSaveButton}
                            onClick={() =>
                              void handleSaveCampusPaymentAccount(campus)
                            }
                            disabled={isSaving}
                          >
                            <Save size={14} />
                            {isSaving ? '저장 중' : '저장'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeDetailId === 'campus-admins' && (
          <section
            id="detail-campus-admins"
            className={styles.detailPanel}
          >
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
                  onClick={() => navigate('/admin/access/campus-admins')}
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
          <section
            id="detail-destinations"
            className={styles.detailPanel}
          >
            <div className={styles.panelHeader}>
              <div>
                <h2>행선지 확인 현황</h2>
                <p>
                  등록한 행선지는 사용자 신청 화면의 희망 행선지 선택 목록에
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

        {activeDetailId === 'bus-options' && (
          <section
            id="detail-bus-options"
            className={styles.detailPanel}
          >
            <div className={styles.panelHeader}>
              <div>
                <h2>버스 옵션 관리</h2>
                <p>
                  최저비용 배차 계산에 사용할 단일 버스의 운영 조건을
                  관리합니다.
                </p>
              </div>
              <span className={styles.panelCount}>
                {busOptions.length > 0 ? '설정 완료' : '미설정'}
              </span>
            </div>

            {busOptions.length === 0 ? (
              <div className={styles.busOptionAddPanel}>
                <div className={styles.busOptionAddHeading}>
                  <div>
                    <strong>버스 옵션 설정</strong>
                    <span>배차 계산에 사용할 차량 한 종류를 입력해주세요.</span>
                  </div>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => void handleAddBusOption()}
                    disabled={addingBusOption}
                  >
                    <Plus size={16} />
                    {addingBusOption ? '설정 중...' : '옵션 설정'}
                  </button>
                </div>

                <div className={styles.busOptionAddForm}>
                  <label>
                    <span>좌석 수</span>
                    <input
                      type="number"
                      min={1}
                      value={newBusOptionDraft.capacity}
                      onChange={(event) =>
                        setNewBusOptionDraft((current) => ({
                          ...current,
                          capacity: event.target.value,
                        }))
                      }
                      placeholder="예: 45"
                    />
                  </label>
                  <label>
                    <span>예상 가격</span>
                    <input
                      type="number"
                      min={0}
                      value={newBusOptionDraft.estimatedPrice}
                      onChange={(event) =>
                        setNewBusOptionDraft((current) => ({
                          ...current,
                          estimatedPrice: event.target.value,
                        }))
                      }
                      placeholder="예: 920000"
                    />
                  </label>
                  <label>
                    <span>사용 가능 대수</span>
                    <input
                      type="number"
                      min={1}
                      value={newBusOptionDraft.maxCount}
                      onChange={(event) =>
                        setNewBusOptionDraft((current) => ({
                          ...current,
                          maxCount: event.target.value,
                        }))
                      }
                      placeholder="예: 10"
                    />
                  </label>
                  <label>
                    <span>메모</span>
                    <input
                      value={newBusOptionDraft.notes}
                      onChange={(event) =>
                        setNewBusOptionDraft((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                      placeholder="선택 입력"
                    />
                  </label>
                </div>
              </div>
            ) : null}

            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>좌석 수</th>
                    <th>예상 가격</th>
                    <th>사용 가능 대수</th>
                    <th>메모</th>
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {busOptions.length > 0 ? (
                    busOptions.map((option) => {
                      const isEditing = busOptionDraft?.id === option.id;

                      return (
                        <tr key={option.id}>
                          <td>
                            {isEditing ? (
                              <input
                                className={styles.optionTableInput}
                                type="number"
                                min={1}
                                value={busOptionDraft.values.capacity}
                                onChange={(event) =>
                                  updateBusOptionDraft(
                                    'capacity',
                                    event.target.value
                                  )
                                }
                                aria-label={`${option.capacity}인승 좌석 수`}
                              />
                            ) : (
                              `${option.capacity.toLocaleString()}명`
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <input
                                className={styles.optionTableInput}
                                type="number"
                                min={0}
                                value={busOptionDraft.values.estimatedPrice}
                                onChange={(event) =>
                                  updateBusOptionDraft(
                                    'estimatedPrice',
                                    event.target.value
                                  )
                                }
                                aria-label={`${option.capacity}인승 예상 가격`}
                              />
                            ) : (
                              `${option.estimated_price.toLocaleString()}원`
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <input
                                className={styles.optionTableInput}
                                type="number"
                                min={1}
                                value={busOptionDraft.values.maxCount}
                                onChange={(event) =>
                                  updateBusOptionDraft(
                                    'maxCount',
                                    event.target.value
                                  )
                                }
                                aria-label={`${option.capacity}인승 사용 가능 대수`}
                              />
                            ) : (
                              `${(option.max_count ?? 999).toLocaleString()}대`
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <input
                                className={`${styles.tableInput} ${styles.addressInput}`}
                                value={busOptionDraft.values.notes}
                                onChange={(event) =>
                                  updateBusOptionDraft(
                                    'notes',
                                    event.target.value
                                  )
                                }
                                aria-label={`${option.capacity}인승 메모`}
                              />
                            ) : (
                              option.notes || '-'
                            )}
                          </td>
                          <td>
                            <div className={styles.rowActions}>
                              {isEditing ? (
                                <>
                                  <button
                                    type="button"
                                    className={styles.rowSaveButton}
                                    onClick={() => void handleSaveBusOption()}
                                    disabled={
                                      savingBusOptionId === option.id
                                    }
                                  >
                                    <Save size={14} />
                                    {savingBusOptionId === option.id
                                      ? '저장 중'
                                      : '저장'}
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.rowCancelButton}
                                    onClick={() => setBusOptionDraft(null)}
                                    disabled={
                                      savingBusOptionId === option.id
                                    }
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
                                    onClick={() => startBusOptionEdit(option)}
                                  >
                                    <Pencil size={14} />
                                    수정
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.rowDeleteButton}
                                    onClick={() =>
                                      void handleDeleteBusOption(option)
                                    }
                                    disabled={
                                      deletingBusOptionId === option.id
                                    }
                                  >
                                    <Trash2 size={14} />
                                    {deletingBusOptionId === option.id
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
                      <td colSpan={5} className={styles.emptyTableCell}>
                        등록된 버스 옵션이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
            </>,
            detailPortalTarget
          )}

        <section className={styles.compactSummarySection}>
          <div className={styles.compactSummaryHeader}>
            <div>
              <span>현재 설정 요약</span>
              <h2>저장된 운영 정보</h2>
            </div>
            <strong>{readySetupCount} / {setupItems.length} 완료</strong>
          </div>

          <div className={styles.summaryGrid}>
            <div>
              <span>조직 · 예상 참여 인원</span>
              <strong>
                지구 {summary.districtCount} · 팀 {summary.teamCount} · 캠퍼스{' '}
                {summary.campusCount} · {summary.totalTarget.toLocaleString()}명
              </strong>
            </div>

            <div>
              <span>버스표 가격</span>
              <strong>{busTicketPrice.toLocaleString()}원</strong>
            </div>

            <div>
              <span>송금 계좌</span>
              <strong>{accountNumber || '미설정'}</strong>
            </div>

            <div>
              <span>행선지</span>
              <strong>{stations.length.toLocaleString()}개 등록</strong>
            </div>

            <div className={styles.busOptionSummary}>
              <span>버스 옵션</span>
              <strong>{busOptionSummary.headline}</strong>
              <small>{busOptionSummary.detail}</small>
            </div>

            <div>
              <span>신청 마감</span>
              <strong>{formatReservationDeadline(deadlineAt)}</strong>
            </div>

            <div>
              <span>탑승 관리 간사님</span>
              <strong>{boardingManagerCount.toLocaleString()}명 지정</strong>
            </div>
          </div>
        </section>

        <div className={styles.dangerZoneHeading}>
          <div>
            <span>위험 구역</span>
            <h2>신청정보 및 운영 데이터 초기화</h2>
            <p>일반 설정 작업과 분리된 관리자용 데이터 삭제 도구입니다.</p>
          </div>
          <strong>삭제 후 복구 불가</strong>
        </div>

        <section
          id="data-reset"
          className={`${styles.resetPanel} ${
            showResetPanel ? styles.resetPanelOpen : ''
          }`}
        >
          <div className={styles.resetPanelHeader}>
            <div className={styles.resetIconBox}>
              <Database size={22} />
            </div>
            <div>
              <h2>DB 정보 초기화</h2>
              <p>
                운영 데이터뿐 아니라 행선지, 버스 옵션, 앱 설정, 공지,
                캠퍼스 회계 순장님 권한, 조직 구조, 사용자 계정을 선택적으로
                초기화합니다. 현재 로그인한 전체 관리자 계정은 보호됩니다.
              </p>
            </div>
            <button
              type="button"
              className={styles.resetToggleButton}
              onClick={() => setShowResetPanel((current) => !current)}
              aria-expanded={showResetPanel}
            >
              {showResetPanel ? '초기화 도구 닫기' : '초기화 도구 열기'}
              {showResetPanel ? (
                <ChevronUp size={16} />
              ) : (
                <ChevronDown size={16} />
              )}
            </button>
          </div>

          {showResetPanel && (
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
          )}

          {showResetPanel && (
            <div className={styles.resetPanelFooter}>
            <p>
              선택한 {selectedResetRows.toLocaleString()}건은 삭제 후 되돌릴
              수 없습니다. 사용자 데이터 삭제 시 현재 로그인한 전체 관리자
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
          )}
        </section>

      </main>
    </div>
  );
};

export default AdminSetupCheckPage;
