import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Ticket,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import AdminHeader from './AdminHeader';
import {
  cancelCampusAdmin,
  getAdminRole,
  registerCampusAdmin,
} from '../../lib/adminService';
import { supabase } from '../../lib/supabase';
import { removeCancelledPassengerFromConfirmedWorkspace } from '../../lib/admin/allocationWorkspaceService';
import type {
  ConfirmedTicket,
  ReturnBusReservation,
  StationPreference,
} from '../../types/reservation';

import styles from './AdminPersonalTicketPage.module.css';

type PersonStatus =
  | ReturnBusReservation['status']
  | 'not_applied';
type ReservationStatusFilter =
  | 'all'
  | 'not_applied'
  | 'requested'
  | 'confirmed'
  | 'cancelled';
type TicketStatusFilter = 'all' | 'confirmed' | 'pending' | 'not_applied';
type PaymentStatus = 'pending' | 'completed' | 'refunded';

interface ReservationRow {
  id: string;
  user_id: string;
  name: string | null;
  phone: string | null;
  district: string | null;
  team: string | null;
  campus: string | null;
  station_preferences: StationPreference[] | null;
  status: ReturnBusReservation['status'] | null;
  confirmed_ticket: ConfirmedTicket | null;
  data: Partial<ReturnBusReservation> | null;
  created_at: string | null;
  updated_at: string | null;
}

interface ProfileRow {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  district: string | null;
  team: string | null;
  campus: string | null;
}

interface PaymentRow {
  reservation_id: string | null;
  status: PaymentStatus;
}

interface ReservationItem {
  id: string;
  dbId: string | null;
  userId: string;
  email: string | null;
  name: string;
  phone: string;
  district: string;
  team: string;
  campus: string;
  stationPreferences: StationPreference[];
  status: PersonStatus;
  paymentStatus: PaymentStatus | null;
  confirmedTicket?: ConfirmedTicket;
  requestedAt: string;
  updatedAt?: string;
  rawData: Partial<ReturnBusReservation> | null;
  hasReservation: boolean;
}

interface AdminRoleRow {
  id: string;
  user_id: string;
  role: 'global_admin' | 'campus_admin';
  district: string | null;
  team: string | null;
  campus: string | null;
}

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

const normalize = (value: string) => value.replace(/\s/g, '').toLowerCase();
const PAGE_SIZE = 25;
const SUPABASE_PAGE_SIZE = 1000;

type SupabasePageResult<T> = {
  data: T[] | null;
  error: unknown;
};

const fetchAllRows = async <T,>(
  fetchPage: (
    from: number,
    to: number
  ) => PromiseLike<SupabasePageResult<T>>
): Promise<T[]> => {
  const rows: T[] = [];

  while (true) {
    const from = rows.length;
    const { data, error } = await fetchPage(
      from,
      from + SUPABASE_PAGE_SIZE - 1
    );

    if (error) throw error;

    const pageRows = data ?? [];
    rows.push(...pageRows);

    if (pageRows.length < SUPABASE_PAGE_SIZE) {
      return rows;
    }
  }
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

const toReservationItem = (row: ReservationRow): ReservationItem => {
  const savedData = row.data ?? {};
  const confirmedTicket =
    savedData.confirmedTicket ?? row.confirmed_ticket ?? undefined;

  return {
    id: savedData.id ?? row.id,
    dbId: row.id,
    userId: row.user_id,
    email: null,
    name: savedData.name ?? row.name ?? '',
    phone: savedData.phone ?? row.phone ?? '',
    district: savedData.district ?? row.district ?? '',
    team: savedData.team ?? row.team ?? '',
    campus: savedData.campus ?? row.campus ?? '',
    stationPreferences:
      savedData.stationPreferences ?? row.station_preferences ?? [],
    status: savedData.status ?? row.status ?? 'requested',
    paymentStatus: null,
    confirmedTicket,
    requestedAt: savedData.requestedAt ?? row.created_at ?? '',
    updatedAt: savedData.updatedAt ?? row.updated_at ?? undefined,
    rawData: row.data,
    hasReservation: true,
  };
};

const toNotAppliedItem = (profile: ProfileRow): ReservationItem => ({
  id: `profile-${profile.id}`,
  dbId: null,
  userId: profile.id,
  email: profile.email,
  name: profile.name ?? '',
  phone: profile.phone ?? '',
  district: profile.district ?? '',
  team: profile.team ?? '',
  campus: profile.campus ?? '',
  stationPreferences: [],
  status: 'not_applied',
  paymentStatus: null,
  confirmedTicket: undefined,
  requestedAt: '',
  updatedAt: undefined,
  rawData: null,
  hasReservation: false,
});

const mergeProfilesWithReservations = (
  profiles: ProfileRow[],
  reservationRows: ReservationRow[],
  paymentRows: PaymentRow[]
) => {
  const paymentByReservationId = new Map(
    paymentRows
      .filter((payment) => payment.reservation_id)
      .map((payment) => [payment.reservation_id as string, payment.status])
  );
  const reservationItems = reservationRows.map((row) => ({
    ...toReservationItem(row),
    paymentStatus: paymentByReservationId.get(row.id) ?? null,
  }));
  const reservationByUserId = new Map(
    reservationItems.map((reservation) => [reservation.userId, reservation])
  );

  const mergedItems = profiles.map((profile) => {
    const reservation = reservationByUserId.get(profile.id);

    if (!reservation) {
      return toNotAppliedItem(profile);
    }

    return {
      ...reservation,
      email: profile.email,
      name: reservation.name || profile.name || '',
      phone: reservation.phone || profile.phone || '',
      district: reservation.district || profile.district || '',
      team: reservation.team || profile.team || '',
      campus: reservation.campus || profile.campus || '',
    };
  });

  const profileIds = new Set(profiles.map((profile) => profile.id));
  const orphanReservations = reservationItems.filter(
    (reservation) => !profileIds.has(reservation.userId)
  );

  return [...mergedItems, ...orphanReservations].sort((a, b) => {
    const campusOrder = a.campus.localeCompare(b.campus, 'ko');
    if (campusOrder !== 0) return campusOrder;

    const teamOrder = a.team.localeCompare(b.team, 'ko');
    if (teamOrder !== 0) return teamOrder;

    return a.name.localeCompare(b.name, 'ko');
  });
};

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
  const [reservations, setReservations] = useState<ReservationItem[]>([]);
  const [adminRoles, setAdminRoles] = useState<AdminRoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [isRolePanelOpen, setIsRolePanelOpen] = useState(false);
  const [isTicketPanelOpen, setIsTicketPanelOpen] = useState(true);
  const [selectedReservationId, setSelectedReservationId] = useState<
    string | null
  >(null);
  const [draft, setDraft] = useState<TicketDraft>(emptyDraft);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] =
    useState<ReservationStatusFilter>('all');
  const [ticketFilter, setTicketFilter] = useState<TicketStatusFilter>('all');
  const [campusFilter, setCampusFilter] = useState('all');
  const [page, setPage] = useState(1);

  const loadReservations = async () => {
    setLoading(true);

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

      const [reservationData, profileData, adminRoleData, paymentData] =
        await Promise.all([
          fetchAllRows<ReservationRow>((from, to) =>
            supabase
              .from('reservations')
              .select(
                'id, user_id, name, phone, district, team, campus, station_preferences, status, confirmed_ticket, data, created_at, updated_at'
              )
              .order('created_at', { ascending: false })
              .order('id', { ascending: true })
              .range(from, to)
          ),
          fetchAllRows<ProfileRow>((from, to) =>
            supabase
              .from('profiles')
              .select('id, email, name, phone, district, team, campus')
              .order('district', { ascending: true, nullsFirst: false })
              .order('team', { ascending: true, nullsFirst: false })
              .order('campus', { ascending: true, nullsFirst: false })
              .order('name', { ascending: true, nullsFirst: false })
              .order('id', { ascending: true })
              .range(from, to)
          ),
          fetchAllRows<AdminRoleRow>((from, to) =>
            supabase
              .from('admin_roles')
              .select('id, user_id, role, district, team, campus')
              .order('id', { ascending: true })
              .range(from, to)
          ),
          fetchAllRows<PaymentRow>((from, to) =>
            supabase
              .from('payments')
              .select('reservation_id, status')
              .order('reservation_id', {
                ascending: true,
                nullsFirst: false,
              })
              .range(from, to)
          ),
        ]);

      const nextReservations = mergeProfilesWithReservations(
        profileData,
        reservationData,
        paymentData
      );

      setReservations(nextReservations);
      setAdminRoles(adminRoleData);

      if (!selectedReservationId && nextReservations[0]) {
        setSelectedReservationId(nextReservations[0].id);
        setDraft(
          ticketToDraft(
            nextReservations[0].confirmedTicket,
            nextReservations[0]
          )
        );
      }
    } catch (error) {
      console.error('개인 버스표 목록 조회 실패:', error);
      alert('개인 버스표 목록을 불러올 수 없습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial page load is an external Supabase synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadReservations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedReservation = useMemo(
    () =>
      reservations.find(
        (reservation) => reservation.id === selectedReservationId
      ) ?? null,
    [reservations, selectedReservationId]
  );

  const selectedAdminRole = useMemo(() => {
    if (!selectedReservation) return null;

    return (
      adminRoles.find((role) => role.user_id === selectedReservation.userId) ??
      null
    );
  }, [adminRoles, selectedReservation]);

  const renderAdminRoleBadge = (reservation: ReservationItem) => {
    const adminRole =
      adminRoles.find((role) => role.user_id === reservation.userId) ?? null;

    if (adminRole?.role === 'global_admin') {
      return (
        <span className={`${styles.adminBadge} ${styles.adminGlobal}`}>
          전체 관리자
        </span>
      );
    }

    if (adminRole?.role === 'campus_admin') {
      return (
        <span className={`${styles.adminBadge} ${styles.adminCampus}`}>
          캠퍼스 관리자
        </span>
      );
    }

    return <span className={styles.adminBadge}>일반</span>;
  };

  const campuses = useMemo(() => {
    return Array.from(
      new Set(
        reservations
          .map((reservation) => reservation.campus)
          .filter((campus) => campus.trim())
      )
    ).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [reservations]);

  const summary = useMemo(() => {
    const active = reservations.filter(
      (reservation) =>
        reservation.status !== 'cancelled' &&
        reservation.status !== 'not_applied'
    );

    return {
      total: reservations.length,
      applied: reservations.filter(
        (reservation) => reservation.status !== 'not_applied'
      ).length,
      confirmed: active.filter((reservation) => reservation.confirmedTicket)
        .length,
      pending: active.filter((reservation) => !reservation.confirmedTicket)
        .length,
      cancelled: reservations.filter(
        (reservation) => reservation.status === 'cancelled'
      ).length,
      notApplied: reservations.filter(
        (reservation) => reservation.status === 'not_applied'
      ).length,
    };
  }, [reservations]);

  const filteredReservations = useMemo(() => {
    const keyword = normalize(searchKeyword);

    return reservations.filter((reservation) => {
      const matchesStatus =
        statusFilter === 'all' || reservation.status === statusFilter;
      const matchesTicket =
        ticketFilter === 'all' ||
        (ticketFilter === 'not_applied'
          ? reservation.status === 'not_applied'
          : ticketFilter === 'confirmed'
            ? Boolean(reservation.confirmedTicket)
            : reservation.hasReservation &&
              reservation.status !== 'cancelled' &&
              !reservation.confirmedTicket);
      const matchesCampus =
        campusFilter === 'all' || reservation.campus === campusFilter;
      const searchTarget = normalize(
        [
          reservation.name,
          reservation.email,
          reservation.phone,
          reservation.district,
          reservation.team,
          reservation.campus,
          reservation.stationPreferences
            .map((preference) => preference.station.name)
            .join(' '),
          reservation.confirmedTicket?.busNumber,
          reservation.confirmedTicket?.seatNumber,
        ]
          .filter(Boolean)
          .join(' ')
      );

      return (
        matchesStatus &&
        matchesTicket &&
        matchesCampus &&
        (!keyword || searchTarget.includes(keyword))
      );
    });
  }, [campusFilter, reservations, searchKeyword, statusFilter, ticketFilter]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredReservations.length / PAGE_SIZE)
  );
  const effectivePage = Math.min(page, totalPages);
  const pagedReservations = filteredReservations.slice(
    (effectivePage - 1) * PAGE_SIZE,
    effectivePage * PAGE_SIZE
  );

  const selectReservation = (reservation: ReservationItem) => {
    setSelectedReservationId(reservation.id);
    setDraft(ticketToDraft(reservation.confirmedTicket, reservation));
    setIsRolePanelOpen(false);
    setIsTicketPanelOpen(true);
  };

  const updateDraft = (key: keyof TicketDraft, value: string) => {
    setDraft((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const reloadAdminRoles = async () => {
    const { data, error } = await supabase
      .from('admin_roles')
      .select('id, user_id, role, district, team, campus');

    if (error) throw error;

    setAdminRoles((data ?? []) as AdminRoleRow[]);
  };

  const handleAssignSelectedCampusAdmin = async () => {
    if (!selectedReservation) return;

    if (selectedAdminRole?.role === 'global_admin') {
      alert('전체 관리자는 캠퍼스 관리자로 변경할 수 없습니다.');
      return;
    }

    if (
      !selectedReservation.district ||
      !selectedReservation.team ||
      !selectedReservation.campus
    ) {
      alert('지구, 팀, 캠퍼스 정보가 있어야 캠퍼스 관리자 권한을 부여할 수 있습니다.');
      return;
    }

    const ok = window.confirm(
      `${selectedReservation.name}님을 ${selectedReservation.campus} 캠퍼스 관리자로 등록할까요?`
    );

    if (!ok) return;

    setSavingRole(true);

    try {
      await registerCampusAdmin({
        userId: selectedReservation.userId,
        district: selectedReservation.district,
        team: selectedReservation.team,
        campus: selectedReservation.campus,
      });
      await reloadAdminRoles();
      alert('캠퍼스 관리자 권한을 등록했습니다.');
    } catch (error) {
      console.error('Failed to assign campus admin role:', error);
      alert(`캠퍼스 관리자 권한 등록 중 오류가 발생했습니다: ${getErrorMessage(error)}`);
    } finally {
      setSavingRole(false);
    }
  };

  const handleCancelSelectedCampusAdmin = async () => {
    if (!selectedAdminRole || selectedAdminRole.role !== 'campus_admin') return;

    const ok = window.confirm('선택한 사용자의 캠퍼스 관리자 권한을 취소할까요?');

    if (!ok) return;

    setSavingRole(true);

    try {
      await cancelCampusAdmin(selectedAdminRole.id);
      await reloadAdminRoles();
      alert('캠퍼스 관리자 권한을 취소했습니다.');
    } catch (error) {
      console.error('Failed to cancel campus admin role:', error);
      alert(`캠퍼스 관리자 권한 취소 중 오류가 발생했습니다: ${getErrorMessage(error)}`);
    } finally {
      setSavingRole(false);
    }
  };

  const buildReservationData = (
    reservation: ReservationItem,
    status: ReturnBusReservation['status'],
    confirmedTicket?: ConfirmedTicket
  ): ReturnBusReservation => {
    const updatedAt = new Date().toISOString();

    return {
      id: reservation.id,
      name: reservation.name,
      phone: reservation.phone,
      district: reservation.district,
      team: reservation.team,
      campus: reservation.campus,
      stationPreferences: reservation.stationPreferences,
      status,
      confirmedTicket,
      requestedAt: reservation.requestedAt || updatedAt,
      updatedAt,
    };
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

    if (!busNumber || !departureTime || !boardingPlace || !dropoffStation) {
      alert('버스번호, 출발 시간, 탑승 장소, 도착역을 입력해주세요.');
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

    const seatNumber = draft.seatNumber.trim();
    const managerNote = draft.managerNote.trim();

    if (seatNumber) {
      confirmedTicket.seatNumber = seatNumber;
    }

    if (managerNote) {
      confirmedTicket.managerNote = managerNote;
    }

    const nextData = buildReservationData(
      selectedReservation,
      'confirmed',
      confirmedTicket
    );
    const cleanConfirmedTicket = removeUndefinedValues(confirmedTicket);
    const cleanNextData = removeUndefinedValues(nextData);

    setSaving(true);

    try {
      const { error } = await supabase
        .from('reservations')
        .update({
          name: cleanNextData.name,
          phone: cleanNextData.phone,
          district: cleanNextData.district,
          team: cleanNextData.team,
          campus: cleanNextData.campus,
          station_preferences: cleanNextData.stationPreferences,
          status: 'confirmed',
          confirmed_ticket: cleanConfirmedTicket,
          data: cleanNextData,
          updated_at: cleanNextData.updatedAt,
        })
        .eq('id', selectedReservation.dbId);

      if (error) throw error;

      setReservations((prev) =>
        prev.map((reservation) =>
          reservation.id === selectedReservation.id
            ? {
                ...reservation,
                status: 'confirmed',
                confirmedTicket: cleanConfirmedTicket,
                updatedAt: cleanNextData.updatedAt,
                rawData: cleanNextData,
              }
            : reservation
        )
      );

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

    const nextData = buildReservationData(selectedReservation, 'requested');
    const cleanNextData = removeUndefinedValues(nextData);

    setSaving(true);

    try {
      const { error } = await supabase
        .from('reservations')
        .update({
          name: cleanNextData.name,
          phone: cleanNextData.phone,
          district: cleanNextData.district,
          team: cleanNextData.team,
          campus: cleanNextData.campus,
          station_preferences: cleanNextData.stationPreferences,
          status: 'requested',
          confirmed_ticket: null,
          data: cleanNextData,
          updated_at: cleanNextData.updatedAt,
        })
        .eq('id', selectedReservation.dbId);

      if (error) throw error;

      setReservations((prev) =>
        prev.map((reservation) =>
          reservation.id === selectedReservation.id
            ? {
                ...reservation,
                status: 'requested',
                confirmedTicket: undefined,
                updatedAt: cleanNextData.updatedAt,
                rawData: cleanNextData,
              }
            : reservation
        )
      );
      setDraft(ticketToDraft(undefined, selectedReservation));

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
    const nextData = buildReservationData(selectedReservation, nextStatus);
    const cleanNextData = removeUndefinedValues(nextData);

    setSaving(true);

    try {
      const { error } = await supabase
        .from('reservations')
        .update({
          name: cleanNextData.name,
          phone: cleanNextData.phone,
          district: cleanNextData.district,
          team: cleanNextData.team,
          campus: cleanNextData.campus,
          station_preferences: cleanNextData.stationPreferences,
          status: nextStatus,
          confirmed_ticket: null,
          data: cleanNextData,
          updated_at: cleanNextData.updatedAt,
        })
        .eq('id', selectedReservation.dbId);

      if (error) throw error;

      if (willCancel) {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) throw new Error('로그인이 필요합니다.');
        await removeCancelledPassengerFromConfirmedWorkspace(
          selectedReservation.dbId,
          session.user.id
        );
      }

      setReservations((prev) =>
        prev.map((reservation) =>
          reservation.id === selectedReservation.id
            ? {
                ...reservation,
                status: nextStatus,
                confirmedTicket: undefined,
                updatedAt: cleanNextData.updatedAt,
                rawData: cleanNextData,
              }
            : reservation
        )
      );
      setDraft(
        willCancel ? emptyDraft : ticketToDraft(undefined, selectedReservation)
      );

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

  if (loading) {
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

      <main className={styles.main}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate('/admin/global')}
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

          <button
            type="button"
            className={styles.refreshButton}
            onClick={() => void loadReservations()}
          >
            <RefreshCw size={16} />
            새로고침
          </button>
        </section>

        <section className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <div>
              <span>확정인원</span>
              <strong>{summary.confirmed.toLocaleString()}</strong>
            </div>
            <div>
              <span>신청인원</span>
              <strong>{summary.applied.toLocaleString()}</strong>
            </div>
            <div>
              <span>전체 인원</span>
              <strong>{summary.total.toLocaleString()}</strong>
            </div>
          </div>
        </section>

        <section className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={18} />
            <input
              value={searchKeyword}
              onChange={(event) => {
                setSearchKeyword(event.target.value);
                setPage(1);
              }}
              placeholder="이름, 연락처, 캠퍼스, 버스번호 검색"
            />
          </div>

          <select
            value={ticketFilter}
            onChange={(event) => {
              setTicketFilter(event.target.value as TicketStatusFilter);
              setPage(1);
            }}
          >
            <option value="all">전체 버스표</option>
            <option value="pending">미확정</option>
            <option value="confirmed">확정</option>
            <option value="not_applied">미신청</option>
          </select>

          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as ReservationStatusFilter);
              setPage(1);
            }}
          >
            <option value="all">전체 상태</option>
            <option value="requested">신청</option>
            <option value="confirmed">확정</option>
            <option value="cancelled">취소</option>
            <option value="not_applied">미신청</option>
          </select>

          <select
            value={campusFilter}
            onChange={(event) => {
              setCampusFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">전체 캠퍼스</option>
            {campuses.map((campus) => (
              <option key={campus} value={campus}>
                {campus}
              </option>
            ))}
          </select>
        </section>

        <div className={styles.layout}>
          <section className={styles.tablePanel}>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>신청자</th>
                    <th>소속</th>
                    <th>희망 도착역</th>
                    <th>신청여부</th>
                    <th>입금 여부</th>
                    <th>버스표 확정여부</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredReservations.length === 0 ? (
                    <tr>
                      <td className={styles.emptyCell} colSpan={6}>
                        조건에 맞는 신청자가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    pagedReservations.map((reservation) => {
                      const isCampusAdmin = adminRoles.some(
                        (role) =>
                          role.user_id === reservation.userId &&
                          role.role === 'campus_admin'
                      );

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
                          {renderAdminRoleBadge(reservation)}
                        </td>
                        <td>
                          {reservation.team}
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
            {filteredReservations.length > PAGE_SIZE && (
              <div className={styles.pagination}>
                <span>
                  {(effectivePage - 1) * PAGE_SIZE + 1}-
                  {Math.min(
                    effectivePage * PAGE_SIZE,
                    filteredReservations.length
                  )}{' '}
                  / {filteredReservations.length.toLocaleString()}명
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
                      {selectedReservation.team} / {selectedReservation.campus}
                    </p>
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
                        {selectedAdminRole?.role === 'global_admin'
                          ? '전체 관리자'
                          : selectedAdminRole?.role === 'campus_admin'
                            ? '캠퍼스 관리자'
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
                      {selectedAdminRole?.role === 'campus_admin' && (
                        <p className={styles.roleScope}>
                          {selectedAdminRole.district || '-'} /{' '}
                          {selectedAdminRole.team || '-'} /{' '}
                          {selectedAdminRole.campus || '-'}
                        </p>
                      )}

                      <div className={styles.actionRow}>
                        <button
                          type="button"
                          className={styles.campusAdminButton}
                          onClick={handleAssignSelectedCampusAdmin}
                          disabled={
                            savingRole ||
                            selectedAdminRole?.role === 'global_admin'
                          }
                        >
                          <ShieldCheck size={16} />
                          캠퍼스 관리자 등록
                        </button>

                        <button
                          type="button"
                          className={styles.campusAdminCancelButton}
                          onClick={handleCancelSelectedCampusAdmin}
                          disabled={
                            savingRole ||
                            selectedAdminRole?.role !== 'campus_admin'
                          }
                        >
                          <Trash2 size={16} />
                          권한 취소
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
                    <label>버스번호</label>
                    <input
                      value={draft.busNumber}
                      onChange={(event) =>
                        updateDraft('busNumber', event.target.value)
                      }
                      placeholder="예: 00역 - 1호차"
                    />
                  </div>

                  <div className={styles.field}>
                    <label>좌석번호</label>
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
                    <label>도착역</label>
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

                <div className={styles.actionRow}>
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
                          이 인원은 아직 버스 신청을 하지 않아 희망 도착역과
                          버스표 정보를 입력할 수 없습니다. 관리자 권한 관리는
                          위 영역에서 계속 처리할 수 있습니다.
                        </p>
                      </div>
                    )
                  )}
                </section>
              </>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
};

export default AdminPersonalTicketPage;
