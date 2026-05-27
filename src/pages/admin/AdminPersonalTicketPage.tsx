import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  RefreshCw,
  Save,
  Search,
  Ticket,
  Trash2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import Header from '../../components/Header';
import { getAdminRole } from '../../lib/adminService';
import { supabase } from '../../lib/supabase';
import type {
  ConfirmedTicket,
  ReturnBusReservation,
  StationPreference,
} from '../../types/reservation';

import styles from './AdminPersonalTicketPage.module.css';

type ReservationStatusFilter = 'all' | 'requested' | 'confirmed' | 'cancelled';
type TicketStatusFilter = 'all' | 'confirmed' | 'pending';

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

interface ReservationItem {
  id: string;
  dbId: string;
  userId: string;
  name: string;
  phone: string;
  district: string;
  team: string;
  campus: string;
  stationPreferences: StationPreference[];
  status: ReturnBusReservation['status'];
  confirmedTicket?: ConfirmedTicket;
  requestedAt: string;
  updatedAt?: string;
  rawData: Partial<ReturnBusReservation> | null;
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
    name: savedData.name ?? row.name ?? '',
    phone: savedData.phone ?? row.phone ?? '',
    district: savedData.district ?? row.district ?? '',
    team: savedData.team ?? row.team ?? '',
    campus: savedData.campus ?? row.campus ?? '',
    stationPreferences:
      savedData.stationPreferences ?? row.station_preferences ?? [],
    status: savedData.status ?? row.status ?? 'requested',
    confirmedTicket,
    requestedAt: savedData.requestedAt ?? row.created_at ?? '',
    updatedAt: savedData.updatedAt ?? row.updated_at ?? undefined,
    rawData: row.data,
  };
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedReservationId, setSelectedReservationId] = useState<
    string | null
  >(null);
  const [draft, setDraft] = useState<TicketDraft>(emptyDraft);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] =
    useState<ReservationStatusFilter>('all');
  const [ticketFilter, setTicketFilter] = useState<TicketStatusFilter>('all');
  const [campusFilter, setCampusFilter] = useState('all');

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

      const { data, error } = await supabase
        .from('reservations')
        .select(
          'id, user_id, name, phone, district, team, campus, station_preferences, status, confirmed_ticket, data, created_at, updated_at'
        )
        .order('created_at', { ascending: false });

      if (error) throw error;

      const nextReservations = ((data ?? []) as ReservationRow[]).map(
        toReservationItem
      );

      setReservations(nextReservations);

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
      (reservation) => reservation.status !== 'cancelled'
    );

    return {
      total: active.length,
      confirmed: active.filter((reservation) => reservation.confirmedTicket)
        .length,
      pending: active.filter((reservation) => !reservation.confirmedTicket)
        .length,
      cancelled: reservations.filter(
        (reservation) => reservation.status === 'cancelled'
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
        (ticketFilter === 'confirmed'
          ? Boolean(reservation.confirmedTicket)
          : !reservation.confirmedTicket);
      const matchesCampus =
        campusFilter === 'all' || reservation.campus === campusFilter;
      const searchTarget = normalize(
        [
          reservation.name,
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

  const selectReservation = (reservation: ReservationItem) => {
    setSelectedReservationId(reservation.id);
    setDraft(ticketToDraft(reservation.confirmedTicket, reservation));
  };

  const updateDraft = (key: keyof TicketDraft, value: string) => {
    setDraft((prev) => ({
      ...prev,
      [key]: value,
    }));
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

    const busNumber = draft.busNumber.trim();
    const departureTime = draft.departureTime.trim();
    const boardingPlace = draft.boardingPlace.trim();
    const dropoffStation =
      draft.dropoffStation.trim() || getFirstStationName(selectedReservation);

    if (!busNumber || !departureTime || !boardingPlace || !dropoffStation) {
      alert('버스번호, 출발 시간, 탑승 장소, 하차 장소를 입력해주세요.');
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
    if (!selectedReservation?.confirmedTicket) return;

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
        <Header />
        <main className={styles.main}>
          <p>로딩 중...</p>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      <Header />

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
            <h1>개인 버스표 관리</h1>
            <p>
              신청자별 버스번호, 좌석, 출발 시간, 탑승 장소를 입력해 개인
              버스표를 확정합니다. 저장하면 사용자 버스표 화면에도 바로
              반영됩니다.
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
            <span>전체 신청</span>
            <strong>{summary.total}</strong>
          </div>
          <div className={styles.summaryCard}>
            <span>버스표 확정</span>
            <strong>{summary.confirmed}</strong>
          </div>
          <div className={styles.summaryCard}>
            <span>미확정</span>
            <strong>{summary.pending}</strong>
          </div>
          <div className={styles.summaryCard}>
            <span>취소</span>
            <strong>{summary.cancelled}</strong>
          </div>
        </section>

        <section className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={18} />
            <input
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              placeholder="이름, 연락처, 캠퍼스, 버스번호 검색"
            />
          </div>

          <select
            value={ticketFilter}
            onChange={(event) =>
              setTicketFilter(event.target.value as TicketStatusFilter)
            }
          >
            <option value="all">전체 버스표</option>
            <option value="pending">미확정</option>
            <option value="confirmed">확정</option>
          </select>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as ReservationStatusFilter)
            }
          >
            <option value="all">전체 상태</option>
            <option value="requested">신청</option>
            <option value="confirmed">확정</option>
            <option value="cancelled">취소</option>
          </select>

          <select
            value={campusFilter}
            onChange={(event) => setCampusFilter(event.target.value)}
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
                    <th>희망 행선지</th>
                    <th>상태</th>
                    <th>버스표</th>
                    <th>버스/좌석</th>
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
                    filteredReservations.map((reservation) => (
                      <tr
                        key={reservation.id}
                        className={
                          reservation.id === selectedReservationId
                            ? styles.selectedRow
                            : ''
                        }
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
                        </td>
                        <td>
                          {reservation.team}
                          <br />
                          <span className={styles.muted}>
                            {reservation.campus}
                          </span>
                        </td>
                        <td>
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
                                : '신청'}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`${styles.ticketBadge} ${
                              reservation.confirmedTicket
                                ? styles.ticketConfirmed
                                : styles.ticketPending
                            }`}
                          >
                            {reservation.confirmedTicket ? '확정' : '미확정'}
                          </span>
                        </td>
                        <td>
                          {reservation.confirmedTicket ? (
                            <>
                              {reservation.confirmedTicket.busNumber}
                              <br />
                              <span className={styles.muted}>
                                {reservation.confirmedTicket.seatNumber ||
                                  '좌석 미지정'}
                              </span>
                            </>
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
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
                    <label>하차 장소</label>
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
                    disabled={saving || selectedReservation.status === 'cancelled'}
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
                    disabled={saving}
                  >
                    <Trash2 size={16} />
                    {selectedReservation.status === 'cancelled'
                      ? '취소 해제'
                      : '신청 취소'}
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
};

export default AdminPersonalTicketPage;
