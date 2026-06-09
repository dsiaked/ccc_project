import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Ticket,
  Trash2,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  X,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useAdminAuth } from '../../components/AdminAuthProvider';
import AdminHeader from './AdminHeader';
import AdminCreateUserModal from './AdminCreateUserModal';
import {
  cancelCampusAdmin,
  deleteUserAccountForAdmin,
  getCampusesByTeam,
  getDistrictsForAdmin,
  getTeamsByDistrict,
  registerCampusAdmin,
  updatePersonalTicketAsAdmin,
  type SelectOption,
} from '../../lib/adminService';
import {
  getCampusAdminRoleForScope,
  getPersonalTicketPage,
  type PersonalTicketAdminRole,
  type PersonalTicketItem,
  type PersonalTicketSummary,
} from '../../lib/admin/personalTicketService';
import type {
  ConfirmedTicket,
  ReturnBusReservation,
  StationPreference,
} from '../../types/reservation';

import styles from './AdminPersonalTicketPage.module.css';

type ReservationStatusFilter =
  | 'not_applied'
  | 'requested'
  | 'confirmed'
  | 'cancelled';
type TicketStatusFilter = 'all' | 'confirmed' | 'pending' | 'not_applied';
type AdminRoleFilter = 'general' | 'campus_admin' | 'global_admin';

type ReservationItem = PersonalTicketItem;
type AdminRoleRow = PersonalTicketAdminRole;

interface TicketDraft {
  busNumber: string;
  seatNumber: string;
  departureTime: string;
  boardingPlace: string;
  dropoffStation: string;
  managerNote: string;
}

const emptyDraft: TicketDraft = {
  busNumber: '',
  seatNumber: '',
  departureTime: '',
  boardingPlace: '',
  dropoffStation: '',
  managerNote: '',
};

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

const removeUndefinedValues = <T,>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

const PAGE_SIZE = 25;
const reservationStatusOptions: Array<{
  value: ReservationStatusFilter;
  label: string;
}> = [
  { value: 'requested', label: '신청 접수' },
  { value: 'confirmed', label: '배차 확정' },
  { value: 'cancelled', label: '신청 취소' },
  { value: 'not_applied', label: '미신청' },
];
const adminRoleOptions: Array<{ value: AdminRoleFilter; label: string }> = [
  { value: 'general', label: '일반 사용자' },
  { value: 'campus_admin', label: '캠퍼스 회계 순장님' },
  { value: 'global_admin', label: '전체 관리자' },
];
const emptySummary: PersonalTicketSummary = {
  total: 0,
  applied: 0,
  confirmed: 0,
  pending: 0,
  paid: 0,
  cancelled: 0,
  notApplied: 0,
};

const getFirstStationName = (reservation: ReservationItem) =>
  reservation.stationPreferences.find((preference) => preference.rank === 1)
    ?.station?.name || '';

const getStationNameByRank = (
  reservation: ReservationItem,
  rank: StationPreference['rank']
) =>
  reservation.stationPreferences.find((preference) => preference.rank === rank)
    ?.station?.name || '';

const toggleFilterValue = <T extends string>(values: T[], value: T) =>
  values.includes(value)
    ? values.filter((current) => current !== value)
    : [...values, value];

const ticketToDraft = (
  ticket?: ConfirmedTicket,
  reservation?: ReservationItem
): TicketDraft => {
  const firstStationName = reservation ? getFirstStationName(reservation) : '';

  return {
    busNumber:
      ticket?.busNumber ?? (firstStationName ? `${firstStationName} - 1호차` : ''),
    seatNumber: ticket?.seatNumber ?? '',
    departureTime: ticket?.departureTime ?? '',
    boardingPlace: ticket?.boardingPlace ?? '',
    dropoffStation: ticket?.dropoffStation ?? firstStationName,
    managerNote: ticket?.managerNote ?? '',
  };
};

const AdminPersonalTicketPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useAdminAuth();
  const [reservations, setReservations] = useState<ReservationItem[]>([]);
  const [totalReservations, setTotalReservations] = useState(0);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [summary, setSummary] = useState<PersonalTicketSummary>(emptySummary);
  const [districtOptions, setDistrictOptions] = useState<Array<{ name: string }>>(
    []
  );
  const [campusOptions, setCampusOptions] = useState<Array<{ name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [isDeletePanelOpen, setIsDeletePanelOpen] = useState(false);
  const [isRolePanelOpen, setIsRolePanelOpen] = useState(false);
  const [isTicketPanelOpen, setIsTicketPanelOpen] = useState(true);
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);
  const [selectedReservationId, setSelectedReservationId] = useState<
    string | null
  >(null);
  const [draft, setDraft] = useState<TicketDraft>(emptyDraft);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilters, setStatusFilters] = useState<ReservationStatusFilter[]>(
    []
  );
  const [ticketFilter, setTicketFilter] = useState<TicketStatusFilter>('all');
  const [adminRoleFilters, setAdminRoleFilters] = useState<AdminRoleFilter[]>([]);
  const [districtFilter, setDistrictFilter] = useState(
    () => searchParams.get('district') || 'all'
  );
  const [campusFilter, setCampusFilter] = useState(
    () => searchParams.get('campus') || 'all'
  );
  const [page, setPage] = useState(1);
  const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = useState(false);
  const [roleDistricts, setRoleDistricts] = useState<SelectOption[]>([]);
  const [roleTeams, setRoleTeams] = useState<SelectOption[]>([]);
  const [roleCampuses, setRoleCampuses] = useState<SelectOption[]>([]);
  const [roleDistrictId, setRoleDistrictId] = useState('');
  const [roleDistrictName, setRoleDistrictName] = useState('');
  const [roleTeamId, setRoleTeamId] = useState('');
  const [roleTeamName, setRoleTeamName] = useState('');
  const [roleCampusId, setRoleCampusId] = useState('');
  const [roleCampusName, setRoleCampusName] = useState('');
  const deferredSearchKeyword = useDeferredValue(searchKeyword);
  const loadRequestId = useRef(0);
  const selectedReservationIdRef = useRef<string | null>(null);
  const roleDistrictsLoadedRef = useRef(false);

  const loadReservations = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    setLoading(true);

    try {
      const [result, districts] = await Promise.all([
        getPersonalTicketPage({
          page,
          pageSize: PAGE_SIZE,
          search: deferredSearchKeyword,
          status: statusFilters,
          ticket: ticketFilter,
          adminRole: adminRoleFilters,
          district: districtFilter,
          campus: campusFilter,
        }),
        !roleDistrictsLoadedRef.current
          ? getDistrictsForAdmin()
          : Promise.resolve(null),
      ]);

      if (requestId !== loadRequestId.current) return;

      const lastPage = Math.max(1, Math.ceil(result.filteredTotal / PAGE_SIZE));
      if (page > lastPage) {
        setPage(lastPage);
        return;
      }

      setReservations(result.items);
      setTotalReservations(result.total);
      setFilteredTotal(result.filteredTotal);
      setSummary(result.summary);
      setDistrictOptions(result.districts);
      setCampusOptions(result.campuses);
      if (districts) {
        roleDistrictsLoadedRef.current = true;
        setRoleDistricts(districts);
      }

      const selected =
        result.items.find(
          (reservation) => reservation.id === selectedReservationIdRef.current
        ) ??
        result.items[0] ??
        null;
      selectedReservationIdRef.current = selected?.id ?? null;
      setSelectedReservationId(selected?.id ?? null);
      setDraft(
        selected ? ticketToDraft(selected.confirmedTicket, selected) : emptyDraft
      );
    } catch (error) {
      console.error('개인 버스표 목록 조회 실패:', error);
      alert('개인 버스표 목록을 불러올 수 없습니다.');
    } finally {
      if (requestId === loadRequestId.current) {
        setHasCompletedInitialLoad(true);
        setLoading(false);
      }
    }
  }, [
    adminRoleFilters,
    campusFilter,
    deferredSearchKeyword,
    districtFilter,
    page,
    statusFilters,
    ticketFilter,
  ]);

  useEffect(() => {
    // Synchronize the current server-backed page whenever its filters change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadReservations();
  }, [loadReservations]);

  const selectedReservation = useMemo(
    () =>
      reservations.find(
        (reservation) => reservation.id === selectedReservationId
      ) ?? null,
    [reservations, selectedReservationId]
  );

  const selectedAdminRoles = useMemo(() => {
    if (!selectedReservation) return [];

    return selectedReservation.adminRoles;
  }, [selectedReservation]);
  const selectedGlobalAdminRole =
    selectedAdminRoles.find((role) => role.role === 'global_admin') ?? null;
  const selectedCampusAdminRoles = selectedAdminRoles.filter(
    (role) => role.role === 'campus_admin'
  );

  const renderAdminRoleBadge = (reservation: ReservationItem) => {
    const userAdminRoles = reservation.adminRoles;
    const globalAdminRole =
      userAdminRoles.find((role) => role.role === 'global_admin') ?? null;
    const campusAdminRoleCount = userAdminRoles.filter(
      (role) => role.role === 'campus_admin'
    ).length;

    if (globalAdminRole) {
      return (
        <span className={`${styles.adminBadge} ${styles.adminGlobal}`}>
          전체 관리자
        </span>
      );
    }

    if (campusAdminRoleCount > 0) {
      return (
        <span className={`${styles.adminBadge} ${styles.adminCampus}`}>
          {campusAdminRoleCount > 1
            ? `캠퍼스 회계 순장님 ${campusAdminRoleCount}개`
            : '캠퍼스 회계 순장님'}
        </span>
      );
    }

    return <span className={styles.adminBadge}>일반</span>;
  };

  const campuses = campusOptions.map((campus) => campus.name);
  const districts = districtOptions.map((district) => district.name);

  const hasActiveFilters =
    Boolean(searchKeyword.trim()) ||
    ticketFilter !== 'all' ||
    statusFilters.length > 0 ||
    adminRoleFilters.length > 0 ||
    districtFilter !== 'all' ||
    campusFilter !== 'all';
  const advancedFilterCount = statusFilters.length + adminRoleFilters.length;

  const resetFilters = () => {
    setSearchKeyword('');
    setTicketFilter('all');
    setStatusFilters([]);
    setAdminRoleFilters([]);
    setDistrictFilter('all');
    setCampusFilter('all');
    setSearchParams({});
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));
  const effectivePage = Math.min(page, totalPages);
  const pagedReservations = reservations;

  const selectReservation = (reservation: ReservationItem) => {
    selectedReservationIdRef.current = reservation.id;
    setSelectedReservationId(reservation.id);
    setDraft(ticketToDraft(reservation.confirmedTicket, reservation));
    setIsDeletePanelOpen(false);
    setIsRolePanelOpen(false);
    setIsTicketPanelOpen(true);
    setRoleDistrictId('');
    setRoleDistrictName('');
    setRoleTeamId('');
    setRoleTeamName('');
    setRoleCampusId('');
    setRoleCampusName('');
    setRoleTeams([]);
    setRoleCampuses([]);
  };

  const selectCampus = (campus: string) => {
    setCampusFilter(campus);
    setPage(1);

    const next = new URLSearchParams(searchParams);
    if (campus === 'all') {
      next.delete('campus');
    } else {
      next.set('campus', campus);
    }
    setSearchParams(next, { replace: true });

    const firstReservation = reservations.find(
      (reservation) => reservation.campus === campus
    );

    if (firstReservation) {
      selectReservation(firstReservation);
    }
  };

  const selectDistrict = (district: string) => {
    setDistrictFilter(district);
    setPage(1);

    const next = new URLSearchParams(searchParams);
    if (district === 'all') {
      next.delete('district');
    } else {
      next.set('district', district);
    }
    setSearchParams(next, { replace: true });
  };

  const updateDraft = (key: keyof TicketDraft, value: string) => {
    setDraft((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleRoleDistrictChange = async (districtId: string) => {
    const district = roleDistricts.find((item) => item.id === districtId);

    setRoleDistrictId(districtId);
    setRoleDistrictName(district?.name ?? '');
    setRoleTeamId('');
    setRoleTeamName('');
    setRoleCampusId('');
    setRoleCampusName('');
    setRoleCampuses([]);
    setRoleTeams(districtId ? await getTeamsByDistrict(districtId) : []);
  };

  const handleRoleTeamChange = async (teamId: string) => {
    const team = roleTeams.find((item) => item.id === teamId);

    setRoleTeamId(teamId);
    setRoleTeamName(team?.name ?? '');
    setRoleCampusId('');
    setRoleCampusName('');
    setRoleCampuses(teamId ? await getCampusesByTeam(teamId) : []);
  };

  const handleRoleCampusChange = (campusId: string) => {
    const campus = roleCampuses.find((item) => item.id === campusId);

    setRoleCampusId(campusId);
    setRoleCampusName(campus?.name ?? '');
  };

  const isSelectedRoleScopeAlreadyManaged = selectedCampusAdminRoles.some(
    (role) =>
      role.district === roleDistrictName &&
      role.team === roleTeamName &&
      role.campus === roleCampusName
  );
  const handleAssignSelectedCampusAdmin = async () => {
    if (!selectedReservation) return;

    if (selectedGlobalAdminRole) {
      alert('전체 관리자는 캠퍼스 회계 순장님으로 변경할 수 없습니다.');
      return;
    }

    if (!roleDistrictName || !roleTeamName || !roleCampusName) {
      alert('관리할 지구, 팀, 캠퍼스를 선택해주세요.');
      return;
    }

    let selectedRoleScopeCurrentAdmin: AdminRoleRow | null;

    try {
      selectedRoleScopeCurrentAdmin = await getCampusAdminRoleForScope({
        district: roleDistrictName,
        team: roleTeamName,
        campus: roleCampusName,
        excludeUserId: selectedReservation.userId,
      });
    } catch (error) {
      console.error('Failed to inspect campus admin role:', error);
      alert(`기존 캠퍼스 회계 순장님 확인 중 오류가 발생했습니다: ${getErrorMessage(error)}`);
      return;
    }

    const ok = window.confirm(
      selectedRoleScopeCurrentAdmin
        ? `${roleCampusName} 캠퍼스에는 이미 다른 관리자가 등록되어 있습니다.\n기존 관리자를 교체하고 ${selectedReservation.name}님을 등록할까요?`
        : `${selectedReservation.name}님을 ${roleCampusName} 캠퍼스 회계 순장님으로 등록할까요?`
    );

    if (!ok) return;

    setSavingRole(true);

    try {
      await registerCampusAdmin({
        userId: selectedReservation.userId,
        district: roleDistrictName,
        team: roleTeamName,
        campus: roleCampusName,
      });
      await loadReservations();
      alert(`${roleCampusName} 캠퍼스 회계 순장님 권한을 등록했습니다.`);
    } catch (error) {
      console.error('Failed to assign campus admin role:', error);
      alert(`캠퍼스 회계 순장님 권한 등록 중 오류가 발생했습니다: ${getErrorMessage(error)}`);
    } finally {
      setSavingRole(false);
    }
  };

  const handleCancelSelectedCampusAdmin = async (adminRole: AdminRoleRow) => {
    if (adminRole.role !== 'campus_admin') return;

    const ok = window.confirm(
      `${adminRole.campus || '선택한 캠퍼스'} 관리자 권한을 취소할까요?`
    );

    if (!ok) return;

    setSavingRole(true);

    try {
      await cancelCampusAdmin(adminRole.id);
      await loadReservations();
      alert('캠퍼스 회계 순장님 권한을 취소했습니다.');
    } catch (error) {
      console.error('Failed to cancel campus admin role:', error);
      alert(`캠퍼스 회계 순장님 권한 취소 중 오류가 발생했습니다: ${getErrorMessage(error)}`);
    } finally {
      setSavingRole(false);
    }
  };

  const handleSaveTicket = async () => {
    if (!selectedReservation) return;

    if (!selectedReservation.hasReservation || !selectedReservation.dbId) {
      alert('버스 신청을 하지 않은 인원은 버스표를 확정할 수 없습니다.');
      return;
    }

    const busNumber = draft.busNumber.trim();
    const departureTime = draft.departureTime.trim();
    const boardingPlace = draft.boardingPlace.trim();
    const dropoffStation =
      draft.dropoffStation.trim() || getFirstStationName(selectedReservation);
    const seatNumber = draft.seatNumber.trim();

    if (!busNumber || !seatNumber) {
      alert('확정 배차안의 호차와 좌석 번호를 입력해주세요.');
      return;
    }

    const confirmedTicket: ConfirmedTicket = {
      busNumber,
      departureTime,
      boardingPlace,
      dropoffStation,
      confirmedAt: selectedReservation.confirmedTicket?.confirmedAt
        ? selectedReservation.confirmedTicket.confirmedAt
        : new Date().toISOString(),
    };

    const managerNote = draft.managerNote.trim();

    confirmedTicket.seatNumber = seatNumber;

    if (managerNote) {
      confirmedTicket.managerNote = managerNote;
    }

    const cleanConfirmedTicket = removeUndefinedValues(confirmedTicket);

    setSaving(true);

    try {
      const saved = await updatePersonalTicketAsAdmin(
        selectedReservation.dbId,
        'confirmed',
        cleanConfirmedTicket
      );
      const savedTicket = saved.confirmed_ticket as ConfirmedTicket;
      const savedData = saved.data as ReturnBusReservation;

      setReservations((prev) =>
        prev.map((reservation) =>
          reservation.id === selectedReservation.id
            ? {
                ...reservation,
                status: saved.status,
                confirmedTicket: savedTicket,
                updatedAt: saved.updated_at,
                rawData: savedData,
              }
            : reservation
        )
      );
      await loadReservations();

      alert('개인 버스표를 저장했습니다.');
    } catch (error) {
      console.error('개인 버스표 저장 실패:', error);
      alert(`개인 버스표 저장 중 오류가 발생했습니다: ${getErrorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleClearTicket = async () => {
    if (
      !selectedReservation?.hasReservation ||
      !selectedReservation.dbId ||
      !selectedReservation.confirmedTicket
    ) {
      return;
    }

    const ok = window.confirm('이 신청자의 확정 버스표를 취소할까요?');

    if (!ok) return;

    setSaving(true);

    try {
      const saved = await updatePersonalTicketAsAdmin(
        selectedReservation.dbId,
        'requested'
      );

      setReservations((prev) =>
        prev.map((reservation) =>
          reservation.id === selectedReservation.id
            ? {
                ...reservation,
                status: saved.status,
                confirmedTicket: undefined,
                updatedAt: saved.updated_at,
                rawData: saved.data,
              }
            : reservation
        )
      );
      setDraft(ticketToDraft(undefined, selectedReservation));
      await loadReservations();

      alert('확정 버스표를 취소했습니다.');
    } catch (error) {
      console.error('개인 버스표 취소 실패:', error);
      alert(`개인 버스표 취소 중 오류가 발생했습니다: ${getErrorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleReservationCancelled = async () => {
    if (!selectedReservation) return;

    if (!selectedReservation.hasReservation || !selectedReservation.dbId) {
      alert('버스 신청을 하지 않은 인원은 신청 취소 처리할 수 없습니다.');
      return;
    }

    const willCancel = selectedReservation.status !== 'cancelled';
    const ok = window.confirm(
      willCancel
        ? '이 신청자를 취소 처리할까요? 확정된 버스표도 함께 삭제됩니다.'
        : '이 신청자의 취소 상태를 해제하고 신청 상태로 되돌릴까요?'
    );

    if (!ok) return;

    const nextStatus = willCancel ? 'cancelled' : 'requested';
    setSaving(true);

    try {
      const saved = await updatePersonalTicketAsAdmin(
        selectedReservation.dbId,
        nextStatus
      );

      setReservations((prev) =>
        prev.map((reservation) =>
          reservation.id === selectedReservation.id
            ? {
                ...reservation,
                status: saved.status,
                confirmedTicket: undefined,
                updatedAt: saved.updated_at,
                rawData: saved.data,
              }
            : reservation
        )
      );
      setDraft(
        willCancel ? emptyDraft : ticketToDraft(undefined, selectedReservation)
      );
      await loadReservations();

      alert(willCancel ? '신청자를 취소 처리했습니다.' : '취소 상태를 해제했습니다.');
    } catch (error) {
      console.error('신청자 취소 상태 변경 실패:', error);
      alert(
        `신청자 취소 상태 변경 중 오류가 발생했습니다: ${getErrorMessage(error)}`
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSelectedUser = async () => {
    if (!selectedReservation) return;

    if (selectedGlobalAdminRole) {
      alert('전체 관리자 계정은 이 화면에서 삭제할 수 없습니다.');
      return;
    }

    const confirmationLabel =
      selectedReservation.name ||
      selectedReservation.email ||
      selectedReservation.userId;
    const ok = window.confirm(
      `${confirmationLabel} 사용자를 삭제할까요?\n\n로그인 계정, 신청 내역, 결제 정보, 캠퍼스 회계 순장님 권한이 함께 삭제되며 복구할 수 없습니다.`
    );

    if (!ok) return;

    const typedLabel = window.prompt(
      `삭제를 확인하려면 아래 내용을 정확히 입력해주세요.\n${confirmationLabel}`
    );

    if (typedLabel !== confirmationLabel) {
      alert('확인 내용이 일치하지 않아 삭제를 취소했습니다.');
      return;
    }

    setDeletingUser(true);

    try {
      if (!session) throw new Error('로그인이 필요합니다.');
      if (session.user.id === selectedReservation.userId) {
        throw new Error('현재 로그인한 계정은 삭제할 수 없습니다.');
      }

      const deleted = await deleteUserAccountForAdmin(
        selectedReservation.userId
      );

      if (!deleted) {
        throw new Error('삭제할 사용자 계정을 찾을 수 없습니다.');
      }

      await loadReservations();
      alert(`${confirmationLabel} 사용자를 삭제했습니다.`);
    } catch (error) {
      console.error('Failed to delete user account:', error);
      alert(`사용자 삭제 중 오류가 발생했습니다: ${getErrorMessage(error)}`);
    } finally {
      setDeletingUser(false);
    }
  };

  if (loading && !hasCompletedInitialLoad) {
    return (
      <div className={styles.pageContainer}>
        <AdminHeader />
        <main className={styles.main}>
          <p>로딩 중...</p>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      <AdminHeader />

      <main className={styles.main} aria-busy={loading}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate('/admin/dashboard')}
        >
          <ArrowLeft size={18} />
          전체 관리자 화면
        </button>

        <section className={styles.header}>
          <div>
            <h1>개별 사용자 관리</h1>
            <p>
              사용자별 관리자 권한과 개인 버스표를 한 화면에서 확인하고
              수정합니다. 신청자를 선택하면 권한 등록과 버스표 확정을 이어서
              처리할 수 있습니다.
            </p>
          </div>

          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.boardingManagerButton}
              onClick={() => navigate('/admin/access/boarding-managers')}
            >
              <ShieldCheck size={16} />
              선탑자 권한 관리
            </button>
            <button
              type="button"
              className={styles.addUserButton}
              onClick={() => setIsCreateUserOpen(true)}
            >
              <UserPlus size={16} />
              사용자 추가
            </button>
            <button
              type="button"
              className={styles.refreshButton}
              onClick={() => void loadReservations()}
            >
              <RefreshCw size={16} />
              새로고침
            </button>
          </div>
        </section>

        <section className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <div>
              <span>확정인원</span>
              <strong>{summary.confirmed.toLocaleString()}</strong>
            </div>
            <div>
              <span>신청 인원</span>
              <strong>{summary.applied.toLocaleString()}</strong>
            </div>
            <div>
              <span>입금 완료 인원</span>
              <strong>{summary.paid.toLocaleString()}</strong>
            </div>
            <div>
              <span>전체 인원</span>
              <strong>{summary.total.toLocaleString()}</strong>
            </div>
          </div>
        </section>

        <section className={styles.toolbar}>
          <div className={styles.toolbarPrimary}>
            <div className={styles.searchBox}>
              <Search size={18} />
              <input
                value={searchKeyword}
                onChange={(event) => {
                  setSearchKeyword(event.target.value);
                  setPage(1);
                }}
                placeholder="이름, 연락처, 캠퍼스, 호차 검색"
              />
            </div>

            <select
              className={ticketFilter !== 'all' ? styles.activeFilter : undefined}
              value={ticketFilter}
              aria-label="버스표 확정 여부"
              onChange={(event) => {
                setTicketFilter(event.target.value as TicketStatusFilter);
                setPage(1);
              }}
            >
              <option value="all">버스표 확정 여부 · 전체</option>
              <option value="pending">버스표 미확정</option>
              <option value="confirmed">버스표 확정 완료</option>
              <option value="not_applied">버스 미신청</option>
            </select>

            <select
              className={districtFilter !== 'all' ? styles.activeFilter : undefined}
              value={districtFilter}
              aria-label="지구"
              onChange={(event) => selectDistrict(event.target.value)}
            >
              <option value="all">지구 · 전체</option>
              <option value="outside_seoul">서울지구 외 · 전체</option>
              {districts.map((district) => (
                <option key={district} value={district}>
                  {district}
                </option>
              ))}
            </select>

            <select
              className={campusFilter !== 'all' ? styles.activeFilter : undefined}
              value={campusFilter}
              aria-label="캠퍼스"
              onChange={(event) => selectCampus(event.target.value)}
            >
              <option value="all">캠퍼스 · 전체</option>
              {campuses.map((campus) => (
                <option key={campus} value={campus}>
                  {campus}
                </option>
              ))}
            </select>

            <button
              type="button"
              className={`${styles.filterToggle} ${
                advancedFilterCount > 0 ? styles.filterToggleActive : ''
              }`}
              onClick={() => setIsAdvancedFiltersOpen((previous) => !previous)}
              aria-expanded={isAdvancedFiltersOpen}
              aria-controls="personal-ticket-advanced-filters"
            >
              <SlidersHorizontal size={16} />
              상세 필터
              {advancedFilterCount > 0 && (
                <span>{advancedFilterCount}</span>
              )}
              {isAdvancedFiltersOpen ? (
                <ChevronUp size={15} />
              ) : (
                <ChevronDown size={15} />
              )}
            </button>
          </div>

          {isAdvancedFiltersOpen && (
            <div
              id="personal-ticket-advanced-filters"
              className={styles.advancedFilters}
            >
              <fieldset className={styles.filterGroup}>
                <legend>신청 상태</legend>
                <div className={styles.checkboxOptions}>
                  <label
                    className={`${styles.checkboxOption} ${
                      statusFilters.length === 0
                        ? styles.checkboxOptionActive
                        : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={statusFilters.length === 0}
                      onChange={() => {
                        setStatusFilters([]);
                        setPage(1);
                      }}
                    />
                    <span>전체</span>
                  </label>
                  {reservationStatusOptions.map((option) => {
                    const checked = statusFilters.includes(option.value);

                    return (
                      <label
                        key={option.value}
                        className={`${styles.checkboxOption} ${
                          checked ? styles.checkboxOptionActive : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setStatusFilters((current) =>
                              toggleFilterValue(current, option.value)
                            );
                            setPage(1);
                          }}
                        />
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset className={styles.filterGroup}>
                <legend>관리자 권한</legend>
                <div className={styles.checkboxOptions}>
                  <label
                    className={`${styles.checkboxOption} ${
                      adminRoleFilters.length === 0
                        ? styles.checkboxOptionActive
                        : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={adminRoleFilters.length === 0}
                      onChange={() => {
                        setAdminRoleFilters([]);
                        setPage(1);
                      }}
                    />
                    <span>전체</span>
                  </label>
                  {adminRoleOptions.map((option) => {
                    const checked = adminRoleFilters.includes(option.value);

                    return (
                      <label
                        key={option.value}
                        className={`${styles.checkboxOption} ${
                          checked ? styles.checkboxOptionActive : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setAdminRoleFilters((current) =>
                              toggleFilterValue(current, option.value)
                            );
                            setPage(1);
                          }}
                        />
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </div>
          )}

          {hasActiveFilters && (
            <div className={styles.filterChips} aria-label="적용된 필터">
              {searchKeyword.trim() && (
                <button type="button" onClick={() => {
                  setSearchKeyword('');
                  setPage(1);
                }}>
                  검색: {searchKeyword.trim()} <X size={13} />
                </button>
              )}
              {ticketFilter !== 'all' && (
                <button type="button" onClick={() => {
                  setTicketFilter('all');
                  setPage(1);
                }}>
                  버스표: {ticketFilter === 'confirmed' ? '확정 완료' : ticketFilter === 'pending' ? '미확정' : '미신청'} <X size={13} />
                </button>
              )}
              {statusFilters.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => {
                    setStatusFilters((current) =>
                      current.filter((value) => value !== status)
                    );
                    setPage(1);
                  }}
                >
                  신청:{' '}
                  {reservationStatusOptions.find(
                    (option) => option.value === status
                  )?.label || status}{' '}
                  <X size={13} />
                </button>
              ))}
              {adminRoleFilters.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => {
                    setAdminRoleFilters((current) =>
                      current.filter((value) => value !== role)
                    );
                    setPage(1);
                  }}
                >
                  권한:{' '}
                  {adminRoleOptions.find((option) => option.value === role)
                    ?.label || role}{' '}
                  <X size={13} />
                </button>
              ))}
              {campusFilter !== 'all' && (
                <button type="button" onClick={() => selectCampus('all')}>
                  캠퍼스: {campusFilter} <X size={13} />
                </button>
              )}
              {districtFilter !== 'all' && (
                <button type="button" onClick={() => selectDistrict('all')}>
                  지구:{' '}
                  {districtFilter === 'outside_seoul'
                    ? '서울지구 외'
                    : districtFilter}{' '}
                  <X size={13} />
                </button>
              )}
            </div>
          )}

          <div className={styles.filterSummary}>
            <span>
              {loading ? (
                '필터 적용 중...'
              ) : (
                <>
                  전체 {totalReservations.toLocaleString()}명 중{' '}
                  <strong>{filteredTotal.toLocaleString()}명</strong>
                </>
              )}
            </span>
            <button
              type="button"
              onClick={resetFilters}
              disabled={!hasActiveFilters}
            >
              <RotateCcw size={14} />
              필터 초기화
            </button>
          </div>
        </section>

        <div className={styles.layout}>
          <section className={styles.tablePanel}>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>신청자</th>
                    <th>소속</th>
                    <th>희망 행선지</th>
                    <th>신청 여부</th>
                    <th>입금 상태</th>
                    <th>버스표 확정 여부</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredTotal === 0 ? (
                    <tr>
                      <td className={styles.emptyCell} colSpan={6}>
                        조건에 맞는 신청자가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    pagedReservations.map((reservation) => {
                      const isCampusAdmin = reservation.adminRoles.some(
                        (role) =>
                          role.user_id === reservation.userId &&
                          role.role === 'campus_admin'
                      );
                      const isExternal =
                        reservation.rawData?.affiliationType === 'external';

                      return (
                        <tr
                        key={reservation.id}
                        className={[
                          reservation.id === selectedReservationId
                            ? styles.selectedRow
                            : '',
                          isCampusAdmin ? styles.campusAdminRow : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => selectReservation(reservation)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            selectReservation(reservation);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label={`${reservation.name} 버스표 관리 선택`}
                      >
                        <td className={styles.personCell}>
                          <strong>{reservation.name}</strong>
                          <span>{reservation.phone || '-'}</span>
                          {isExternal && (
                            <span className={styles.adminBadge}>타지구 참가자</span>
                          )}
                          {renderAdminRoleBadge(reservation)}
                        </td>
                        <td>
                          {isExternal ? reservation.district : reservation.team}
                          <br />
                          <span className={styles.muted}>
                            {reservation.campus}
                          </span>
                        </td>
                        <td>
                          {reservation.hasReservation ? (
                            <div className={styles.preferenceCell}>
                              <span>
                                1지망{' '}
                                <strong>
                                  {getStationNameByRank(reservation, 1) || '-'}
                                </strong>
                              </span>
                              <span>
                                2지망{' '}
                                <strong>
                                  {getStationNameByRank(reservation, 2) || '-'}
                                </strong>
                              </span>
                            </div>
                          ) : (
                            <span className={styles.emptyValue}>-</span>
                          )}
                        </td>
                        <td>
                          <span
                            className={`${styles.statusBadge} ${
                              styles[`status_${reservation.status}`]
                            }`}
                          >
                            {reservation.status === 'confirmed'
                              ? '확정'
                              : reservation.status === 'cancelled'
                                ? '취소'
                                : reservation.status === 'not_applied'
                                  ? '미신청'
                                  : '신청'}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`${styles.paymentBadge} ${
                              !reservation.hasReservation
                                ? styles.paymentNotApplied
                                : reservation.paymentStatus === 'completed'
                                  ? styles.paymentCompleted
                                  : reservation.paymentStatus === 'refunded'
                                    ? styles.paymentRefunded
                                    : styles.paymentPending
                            }`}
                          >
                            {!reservation.hasReservation
                              ? '-'
                              : reservation.paymentStatus === 'completed'
                                ? '입금 완료'
                                : reservation.paymentStatus === 'refunded'
                                  ? '환불'
                                  : '미입금'}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`${styles.ticketBadge} ${
                              reservation.confirmedTicket
                                ? styles.ticketConfirmed
                                : !reservation.hasReservation
                                  ? styles.ticketNotApplied
                                  : styles.ticketPending
                            }`}
                          >
                            {reservation.confirmedTicket
                              ? '확정'
                              : reservation.hasReservation
                                ? '미확정'
                                : '-'}
                          </span>
                        </td>
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {filteredTotal > PAGE_SIZE && (
              <div className={styles.pagination}>
                <span>
                  {(effectivePage - 1) * PAGE_SIZE + 1}-
                  {Math.min(
                    effectivePage * PAGE_SIZE,
                    filteredTotal
                  )}{' '}
                  / {filteredTotal.toLocaleString()}명
                </span>
                <div>
                  <button
                    type="button"
                    onClick={() => setPage(effectivePage - 1)}
                    disabled={effectivePage === 1}
                    aria-label="이전 페이지"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <strong>
                    {effectivePage} / {totalPages}
                  </strong>
                  <button
                    type="button"
                    onClick={() => setPage(effectivePage + 1)}
                    disabled={effectivePage === totalPages}
                    aria-label="다음 페이지"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </section>

          <aside className={styles.editorPanel}>
            {!selectedReservation ? (
              <div className={styles.editorEmpty}>
                신청자를 선택하면 버스표를 입력할 수 있습니다.
              </div>
            ) : (
              <>
                <div className={styles.editorHeader}>
                  <div>
                    <h2>{selectedReservation.name}</h2>
                    <p>
                      {selectedReservation.rawData?.affiliationType === 'external'
                        ? `${selectedReservation.district} / ${selectedReservation.campus}`
                        : `${selectedReservation.team} / ${selectedReservation.campus}`}
                    </p>
                    {selectedReservation.rawData?.affiliationType ===
                      'external' && (
                      <p>
                        담당 간사{' '}
                        {selectedReservation.rawData.coordinatorName || '-'} ·{' '}
                        {selectedReservation.rawData.coordinatorPhone || '-'}
                      </p>
                    )}
                  </div>
                  {selectedReservation.confirmedTicket ? (
                    <CheckCircle2 size={24} color="#16a34a" />
                  ) : (
                    <Ticket size={24} color="#667085" />
                  )}
                </div>

                <section className={styles.rolePanel}>
                  <button
                    type="button"
                    className={styles.roleHeader}
                    onClick={() => setIsRolePanelOpen((prev) => !prev)}
                    aria-expanded={isRolePanelOpen}
                  >
                    <div>
                      <span>관리자 권한</span>
                      <strong>
                        {selectedGlobalAdminRole
                          ? '전체 관리자'
                          : selectedCampusAdminRoles.length > 0
                            ? selectedCampusAdminRoles.length > 1
                              ? `캠퍼스 회계 순장님 ${selectedCampusAdminRoles.length}개`
                              : '캠퍼스 회계 순장님'
                          : '일반 사용자'}
                      </strong>
                    </div>
                    <span className={styles.roleToggleIcon}>
                      <ShieldCheck size={18} />
                      {isRolePanelOpen ? (
                        <ChevronUp size={18} />
                      ) : (
                        <ChevronDown size={18} />
                      )}
                    </span>
                  </button>

                  {isRolePanelOpen && (
                    <>
                      {selectedCampusAdminRoles.length > 0 && (
                        <div className={styles.roleScopeList}>
                          {selectedCampusAdminRoles.map((role) => (
                            <div key={role.id} className={styles.roleScopeItem}>
                              <span>
                                {role.district || '-'} / {role.team || '-'} /{' '}
                                {role.campus || '-'}
                              </span>
                              <button
                                type="button"
                                className={styles.scopeCancelButton}
                                onClick={() =>
                                  void handleCancelSelectedCampusAdmin(role)
                                }
                                disabled={savingRole}
                              >
                                <Trash2 size={14} />
                                권한 취소
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {!selectedGlobalAdminRole && (
                        <div className={styles.roleScopeSelector}>
                          <strong>추가로 관리할 캠퍼스 선택</strong>
                          <div className={styles.roleScopeSelectorGrid}>
                            <label>
                              <span>지구</span>
                              <select
                                value={roleDistrictId}
                                onChange={(event) =>
                                  void handleRoleDistrictChange(
                                    event.target.value
                                  )
                                }
                                disabled={savingRole}
                              >
                                <option value="">지구 선택</option>
                                {roleDistricts.map((district) => (
                                  <option key={district.id} value={district.id}>
                                    {district.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              <span>팀</span>
                              <select
                                value={roleTeamId}
                                onChange={(event) =>
                                  void handleRoleTeamChange(event.target.value)
                                }
                                disabled={savingRole || !roleDistrictId}
                              >
                                <option value="">팀 선택</option>
                                {roleTeams.map((team) => (
                                  <option key={team.id} value={team.id}>
                                    {team.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              <span>캠퍼스</span>
                              <select
                                value={roleCampusId}
                                onChange={(event) =>
                                  handleRoleCampusChange(event.target.value)
                                }
                                disabled={savingRole || !roleTeamId}
                              >
                                <option value="">캠퍼스 선택</option>
                                {roleCampuses.map((campus) => (
                                  <option key={campus.id} value={campus.id}>
                                    {campus.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          {isSelectedRoleScopeAlreadyManaged && (
                            <span className={styles.roleScopeNotice}>
                              이미 이 캠퍼스를 관리하고 있습니다.
                            </span>
                          )}
                        </div>
                      )}

                      <div className={styles.actionRow}>
                        <button
                          type="button"
                          className={styles.campusAdminButton}
                          onClick={handleAssignSelectedCampusAdmin}
                          disabled={
                            savingRole ||
                            Boolean(selectedGlobalAdminRole) ||
                            !roleCampusName ||
                            isSelectedRoleScopeAlreadyManaged
                          }
                        >
                          <ShieldCheck size={16} />
                          선택한 캠퍼스 회계 순장님 등록
                        </button>

                      </div>
                    </>
                  )}
                </section>

                <section className={styles.ticketPanel}>
                  <button
                    type="button"
                    className={styles.ticketHeader}
                    onClick={() => setIsTicketPanelOpen((prev) => !prev)}
                    aria-expanded={isTicketPanelOpen}
                  >
                    <div>
                      <span>개인 버스표</span>
                      <strong>
                        {selectedReservation.confirmedTicket
                          ? '버스표 확정됨'
                          : selectedReservation.status === 'cancelled'
                            ? '신청 취소됨'
                            : '버스표 미확정'}
                      </strong>
                    </div>
                    <span className={styles.roleToggleIcon}>
                      <Ticket size={18} />
                      {isTicketPanelOpen ? (
                        <ChevronUp size={18} />
                      ) : (
                        <ChevronDown size={18} />
                      )}
                    </span>
                  </button>

                  {isTicketPanelOpen && (
                    selectedReservation.hasReservation ? (
                      <>
                <div className={styles.formGrid}>
                  <div className={styles.field}>
                    <label>호차</label>
                    <input
                      value={draft.busNumber}
                      onChange={(event) =>
                        updateDraft('busNumber', event.target.value)
                      }
                      placeholder="예: 00역 - 1호차"
                    />
                  </div>

                  <div className={styles.field}>
                    <label>좌석 번호</label>
                    <input
                      value={draft.seatNumber}
                      onChange={(event) =>
                        updateDraft('seatNumber', event.target.value)
                      }
                      placeholder="예: 12A"
                    />
                  </div>

                  <div className={styles.field}>
                    <label>출발 시간</label>
                    <input
                      value={draft.departureTime}
                      onChange={(event) =>
                        updateDraft('departureTime', event.target.value)
                      }
                      placeholder="예: 2026. 7. 1. 14:00"
                    />
                  </div>

                  <div className={styles.field}>
                    <label>탑승 장소</label>
                    <input
                      value={draft.boardingPlace}
                      onChange={(event) =>
                        updateDraft('boardingPlace', event.target.value)
                      }
                      placeholder="예: 사랑의교회 앞"
                    />
                  </div>

                  <div className={styles.field}>
                    <label>행선지</label>
                    <input
                      value={draft.dropoffStation}
                      onChange={(event) =>
                        updateDraft('dropoffStation', event.target.value)
                      }
                      placeholder={
                        getFirstStationName(selectedReservation) ||
                        '예: 서울역'
                      }
                    />
                  </div>

                  <div className={styles.field}>
                    <label>관리자 메모</label>
                    <textarea
                      value={draft.managerNote}
                      onChange={(event) =>
                        updateDraft('managerNote', event.target.value)
                      }
                      placeholder="사용자 버스표에 함께 표시할 안내사항"
                    />
                  </div>
                </div>

                <div className={`${styles.actionRow} ${styles.ticketActionRow}`}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={handleSaveTicket}
                    disabled={
                      saving ||
                      !selectedReservation.hasReservation ||
                      selectedReservation.status === 'cancelled'
                    }
                  >
                    <Save size={16} />
                    저장
                  </button>

                  <button
                    type="button"
                    className={styles.dangerButton}
                    onClick={handleClearTicket}
                    disabled={
                      saving ||
                      !selectedReservation.hasReservation ||
                      !selectedReservation.confirmedTicket ||
                      selectedReservation.status === 'cancelled'
                    }
                  >
                    <Trash2 size={16} />
                    확정 취소
                  </button>

                  <button
                    type="button"
                    className={
                      selectedReservation.status === 'cancelled'
                        ? styles.secondaryButton
                        : styles.dangerButton
                    }
                    onClick={handleToggleReservationCancelled}
                    disabled={saving || !selectedReservation.hasReservation}
                  >
                    <Trash2 size={16} />
                    {selectedReservation.status === 'cancelled'
                      ? '취소 해제'
                      : '신청 취소'}
                  </button>
                </div>
                      </>
                    ) : (
                      <div className={styles.notAppliedNotice}>
                        <strong>버스 신청 내역이 없습니다.</strong>
                        <p>
                          이 인원은 아직 버스 신청을 하지 않아 희망 행선지와
                          버스표 정보를 입력할 수 없습니다. 관리자 권한 관리는
                          위 영역에서 계속 처리할 수 있습니다.
                        </p>
                      </div>
                    )
                  )}
                </section>

                <section className={styles.deleteUserPanel}>
                  <button
                    type="button"
                    className={styles.deleteUserHeader}
                    onClick={() => setIsDeletePanelOpen((prev) => !prev)}
                    aria-expanded={isDeletePanelOpen}
                  >
                    <span>
                      <Trash2 size={15} />
                      위험 작업
                    </span>
                    {isDeletePanelOpen ? (
                      <ChevronUp size={16} />
                    ) : (
                      <ChevronDown size={16} />
                    )}
                  </button>

                  {isDeletePanelOpen && (
                    <div className={styles.deleteUserContent}>
                      <div>
                        <strong>사용자 계정 삭제</strong>
                        <p>
                          로그인 계정과 신청, 결제, 관리자 권한을 영구
                          삭제합니다. 삭제 후에는 복구할 수 없습니다.
                        </p>
                      </div>
                      <button
                        type="button"
                        className={styles.deleteUserButton}
                        onClick={() => void handleDeleteSelectedUser()}
                        disabled={
                          deletingUser || Boolean(selectedGlobalAdminRole)
                        }
                        title={
                          selectedGlobalAdminRole
                            ? '전체 관리자 계정은 삭제할 수 없습니다.'
                            : undefined
                        }
                      >
                        <Trash2 size={16} />
                        {deletingUser ? '삭제 중...' : '사용자 영구 삭제'}
                      </button>
                    </div>
                  )}
                </section>
              </>
            )}
          </aside>
        </div>
      </main>

      {isCreateUserOpen && (
        <AdminCreateUserModal
          districts={roleDistricts}
          onClose={() => setIsCreateUserOpen(false)}
          onCreated={loadReservations}
        />
      )}
    </div>
  );
};

export default AdminPersonalTicketPage;
