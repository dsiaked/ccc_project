import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Edit2, X, Check } from 'lucide-react';
import Header from '../../components/Header';
import { supabase } from '../../lib/supabase';
import { getAdminRole } from '../../lib/adminService';
import type { ReturnBusReservation } from '../../types/reservation';
import styles from './AdminTicketPage.module.css';

interface ReservationWithUser extends ReturnBusReservation {
  userId: string;
}

const AdminTicketPage = () => {
  const navigate = useNavigate();
  const [reservations, setReservations] = useState<ReservationWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [editForm, setEditForm] = useState({
    busNumber: '',
    seatNumber: '',
    departureTime: '',
    boardingPlace: '',
    dropoffStation: '',
    dropoffDetail: '',
    managerNote: '',
  });

  useEffect(() => {
    const checkAdminAndLoadReservations = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          navigate('/login');
          return;
        }

        const adminRole = await getAdminRole(session.user.id);

        if (!adminRole || adminRole.role !== 'global_admin') {
          alert('전체 관리자만 접근할 수 있습니다.');
          navigate('/');
          return;
        }

        setIsAdmin(true);

        const { data, error } = await supabase
          .from('reservations')
          .select(
            'id, user_id, name, phone, team, campus, station_preferences, status, confirmed_ticket, data, created_at, updated_at'
          )
          .order('created_at', { ascending: false });

        if (error) {
          throw error;
        }

        const formattedReservations: ReservationWithUser[] = (data || []).map(
          (item: any) => {
            const savedData = (item.data || {}) as Partial<ReturnBusReservation>;

            return {
              id: savedData.id || item.id,
              name: savedData.name || item.name || '',
              phone: savedData.phone || item.phone || '',
              district: savedData.district || '서울지구',
              team: savedData.team || item.team || '',
              campus: savedData.campus || item.campus || '',
              stationPreferences:
                savedData.stationPreferences || item.station_preferences || [],
              status: savedData.status || item.status || 'requested',
              confirmedTicket:
                savedData.confirmedTicket || item.confirmed_ticket || undefined,
              requestedAt:
                savedData.requestedAt || item.created_at || new Date().toISOString(),
              updatedAt: savedData.updatedAt || item.updated_at || undefined,
              userId: item.user_id,
            } as ReservationWithUser;
          }
        );

        setReservations(formattedReservations);
      } catch (error) {
        console.error('Failed to load reservations:', error);
        alert('예약 정보를 로드할 수 없습니다.');
      } finally {
        setLoading(false);
      }
    };

    checkAdminAndLoadReservations();
  }, [navigate]);

  const handleEditClick = (reservation: ReservationWithUser) => {
    setEditingId(reservation.id);
    setEditForm({
      busNumber: reservation.confirmedTicket?.busNumber || '',
      seatNumber: reservation.confirmedTicket?.seatNumber || '',
      departureTime: reservation.confirmedTicket?.departureTime || '',
      boardingPlace: reservation.confirmedTicket?.boardingPlace || '',
      dropoffStation: reservation.confirmedTicket?.dropoffStation || '',
      dropoffDetail: reservation.confirmedTicket?.dropoffDetail || '',
      managerNote: reservation.confirmedTicket?.managerNote || '',
    });
  };

  const handleSave = async (reservation: ReservationWithUser) => {
    try {
      const updatedReservation: ReturnBusReservation = {
        ...reservation,
        status: 'confirmed',
        confirmedTicket: {
          ...editForm,
          confirmedAt: new Date().toISOString(),
        },
      };

      const { error } = await supabase
        .from('reservations')
        .update({
          status: 'confirmed',
          confirmed_ticket: updatedReservation.confirmedTicket,
          data: updatedReservation,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', reservation.userId);

      if (error) throw error;

      setReservations(
        reservations.map((res) =>
          res.id === reservation.id
            ? { ...updatedReservation, userId: reservation.userId }
            : res
        )
      );

      setEditingId(null);
      alert('버스표가 확정되었습니다.');
    } catch (error) {
      console.error('Failed to save ticket:', error);
      alert('저장에 실패했습니다.');
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditForm({
      busNumber: '',
      seatNumber: '',
      departureTime: '',
      boardingPlace: '',
      dropoffStation: '',
      dropoffDetail: '',
      managerNote: '',
    });
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

  if (!isAdmin) {
    return (
      <div className={styles.pageContainer}>
        <Header />
        <main className={styles.main}>
          <p>관리자만 접근할 수 있습니다.</p>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      <Header />

      <main className={styles.main}>
        <div className={styles.header}>
          <h1>버스표 관리</h1>
          <p>전체 {reservations.length}명의 예약</p>
        </div>

        <div className={styles.statsBar}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>확정됨</span>
            <span className={styles.statValue}>
              {reservations.filter((r) => r.status === 'confirmed').length}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>대기중</span>
            <span className={styles.statValue}>
              {reservations.filter((r) => r.status === 'requested').length}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>취소됨</span>
            <span className={styles.statValue}>
              {reservations.filter((r) => r.status === 'cancelled').length}
            </span>
          </div>
        </div>

        <div className={styles.listContainer}>
          {reservations.map((reservation) => (
            <div key={reservation.id} className={styles.reservationCard}>
              <div
                className={styles.cardHeader}
                onClick={() =>
                  setExpandedId(
                    expandedId === reservation.id ? null : reservation.id
                  )
                }
              >
                <div className={styles.userInfo}>
                  <h3>{reservation.name}</h3>
                  <p>{reservation.phone}</p>
                  <span className={`${styles.status} ${styles[reservation.status]}`}>
                    {reservation.status === 'confirmed'
                      ? '✓ 확정됨'
                      : reservation.status === 'requested'
                      ? '⏳ 대기중'
                      : '✕ 취소됨'}
                  </span>
                </div>

                <ChevronDown
                  size={20}
                  className={`${styles.chevron} ${
                    expandedId === reservation.id ? styles.expanded : ''
                  }`}
                />
              </div>

              {expandedId === reservation.id && (
                <div className={styles.cardContent}>
                  <div className={styles.basicInfo}>
                    <div className={styles.infoField}>
                      <label>소속</label>
                      <p>
                        {reservation.district} {reservation.team}
                      </p>
                    </div>
                    <div className={styles.infoField}>
                      <label>캠퍼스</label>
                      <p>{reservation.campus}</p>
                    </div>
                    <div className={styles.infoField}>
                      <label>도착역 선호도</label>
                      <div className={styles.stationList}>
                        {reservation.stationPreferences.map((pref) => (
                          <p key={`${pref.rank}`}>
                            {pref.rank}지망: {pref.station.name} ({pref.station.line})
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>

                  {editingId === reservation.id ? (
                    <div className={styles.editForm}>
                      <h4>버스표 확정</h4>

                      <div className={styles.formRow}>
                        <div className={styles.formField}>
                          <label>호차 *</label>
                          <input
                            type="text"
                            value={editForm.busNumber}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                busNumber: e.target.value,
                              })
                            }
                            placeholder="예: 1호"
                          />
                        </div>

                        <div className={styles.formField}>
                          <label>좌석</label>
                          <input
                            type="text"
                            value={editForm.seatNumber}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                seatNumber: e.target.value,
                              })
                            }
                            placeholder="예: A-10"
                          />
                        </div>
                      </div>

                      <div className={styles.formRow}>
                        <div className={styles.formField}>
                          <label>출발 시간 *</label>
                          <input
                            type="text"
                            value={editForm.departureTime}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                departureTime: e.target.value,
                              })
                            }
                            placeholder="예: 14:00"
                          />
                        </div>

                        <div className={styles.formField}>
                          <label>탑승 장소 *</label>
                          <input
                            type="text"
                            value={editForm.boardingPlace}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                boardingPlace: e.target.value,
                              })
                            }
                            placeholder="예: 신문로 입구"
                          />
                        </div>
                      </div>

                      <div className={styles.formField}>
                        <label>확정 하차역 *</label>
                        <input
                          type="text"
                          value={editForm.dropoffStation}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              dropoffStation: e.target.value,
                            })
                          }
                          placeholder="예: 청량리역"
                        />
                      </div>

                      <div className={styles.formField}>
                        <label>세부 하차 위치</label>
                        <input
                          type="text"
                          value={editForm.dropoffDetail}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              dropoffDetail: e.target.value,
                            })
                          }
                          placeholder="예: 3번 출구"
                        />
                      </div>

                      <div className={styles.formField}>
                        <label>관리자 메모</label>
                        <textarea
                          value={editForm.managerNote}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              managerNote: e.target.value,
                            })
                          }
                          placeholder="추가 안내사항을 입력하세요"
                          rows={3}
                        />
                      </div>

                      <div className={styles.formActions}>
                        <button
                          className={styles.saveButton}
                          onClick={() => handleSave(reservation)}
                        >
                          <Check size={16} /> 저장
                        </button>
                        <button
                          className={styles.cancelButton}
                          onClick={handleCancel}
                        >
                          <X size={16} /> 취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {reservation.confirmedTicket ? (
                        <div className={styles.confirmedInfo}>
                          <h4>확정된 버스표</h4>
                          <div className={styles.infoGrid}>
                            <div className={styles.infoField}>
                              <label>호차</label>
                              <p>{reservation.confirmedTicket.busNumber}</p>
                            </div>
                            <div className={styles.infoField}>
                              <label>좌석</label>
                              <p>
                                {reservation.confirmedTicket.seatNumber ||
                                  '현장 안내'}
                              </p>
                            </div>
                            <div className={styles.infoField}>
                              <label>출발 시간</label>
                              <p>{reservation.confirmedTicket.departureTime}</p>
                            </div>
                            <div className={styles.infoField}>
                              <label>탑승 장소</label>
                              <p>{reservation.confirmedTicket.boardingPlace}</p>
                            </div>
                            <div className={styles.infoField}>
                              <label>하차역</label>
                              <p>{reservation.confirmedTicket.dropoffStation}</p>
                            </div>
                            {reservation.confirmedTicket.dropoffDetail && (
                              <div className={styles.infoField}>
                                <label>세부 위치</label>
                                <p>{reservation.confirmedTicket.dropoffDetail}</p>
                              </div>
                            )}
                          </div>
                          {reservation.confirmedTicket.managerNote && (
                            <div className={styles.managerNote}>
                              <strong>메모:</strong>
                              <p>{reservation.confirmedTicket.managerNote}</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className={styles.notConfirmed}>
                          <p>아직 버스표가 확정되지 않았습니다.</p>
                        </div>
                      )}

                      {reservation.status !== 'confirmed' && (
                        <button
                          className={styles.editButton}
                          onClick={() => handleEditClick(reservation)}
                        >
                          <Edit2 size={16} /> 버스표 확정하기
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};

export default AdminTicketPage;
