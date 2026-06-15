import { useMemo, useState } from 'react';
import { AlertTriangle, Bus, CheckCircle2, MapPin, RotateCcw, Save, Users, X } from 'lucide-react';

import {
  getDestinationQueueStats,
  isSecondChoiceDestinationAssignment,
  validateDestinationQueueWorkspace,
} from '../../lib/admin/destinationQueueAllocation';
import {
  confirmDestinationQueueAllocation,
  cancelConfirmedWorkspace,
  saveAllocationWorkspace,
  type AllocationWorkspaceData,
  type AllocationWorkspaceRow,
} from '../../lib/admin/allocationWorkspaceService';
import { supabase } from '../../lib/supabase';
import styles from './DestinationQueueWorkspaceEditor.module.css';

interface Props {
  row: AllocationWorkspaceRow;
  workspace: AllocationWorkspaceData;
  setRow: (row: AllocationWorkspaceRow) => void;
  setWorkspace: (workspace: AllocationWorkspaceData) => void;
  dirty: boolean;
  setDirty: (dirty: boolean) => void;
}

const DestinationQueueWorkspaceEditor = ({
  row,
  workspace,
  setRow,
  setWorkspace,
  dirty,
  setDirty,
}: Props) => {
  const [selectedDestination, setSelectedDestination] = useState('');
  const [search, setSearch] = useState('');
  const [assignmentFilter, setAssignmentFilter] = useState<'all' | 'second_choice'>('all');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const readOnly = workspace.status === 'confirmed';

  const stats = useMemo(
    () => getDestinationQueueStats(workspace.passengers.map((passenger) => ({
      assignedDestination: passenger.assignedDestination ?? '',
      preferences: passenger.preferences,
    }))),
    [workspace.passengers]
  );
  const destinationOptions = useMemo(
    () => [...new Set(workspace.passengers.flatMap((passenger) => passenger.preferences))],
    [workspace.passengers]
  );
  const effectiveDestination = selectedDestination || stats[0]?.destination || '';
  const normalizedSearch = search.trim().toLocaleLowerCase('ko');
  const visiblePassengers = workspace.passengers.filter((passenger) => {
    if ((passenger.assignedDestination ?? '') !== effectiveDestination) return false;
    if (
      assignmentFilter === 'second_choice' &&
      !isSecondChoiceDestinationAssignment({
        assignedDestination: passenger.assignedDestination ?? '',
        preferences: passenger.preferences,
      })
    ) {
      return false;
    }
    if (!normalizedSearch) return true;
    return [passenger.name, passenger.phone, passenger.campus, passenger.team]
      .join(' ')
      .toLocaleLowerCase('ko')
      .includes(normalizedSearch);
  });
  const firstChoiceCoverage = workspace.passengers.length
    ? Math.round(
        (workspace.passengers.filter(
          (passenger) => passenger.preferences[0] === passenger.assignedDestination
        ).length /
          workspace.passengers.length) *
          100
      )
    : 0;
  const expectedBusCount = stats.reduce(
    (total, destination) => total + destination.expectedBusCount,
    0
  );

  const updateWorkspace = (next: AllocationWorkspaceData) => {
    setWorkspace(next);
    setDirty(true);
    setMessage('');
    setError('');
  };

  const save = async () => {
    if (saving || readOnly || !dirty) return;
    setSaving(true);
    setError('');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('관리자 로그인이 필요합니다.');
      const saved = await saveAllocationWorkspace(
        row,
        workspace,
        session.user.id,
        '행선지 대기 배차 명단을 저장했습니다.'
      );
      setRow(saved);
      setWorkspace(saved.allocation_data);
      setDirty(false);
      setMessage('변경사항을 저장했습니다.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const confirm = async () => {
    if (saving || readOnly || dirty) return;
    const errors = validateDestinationQueueWorkspace({
      commonBoarding: workspace.commonBoarding ?? {
        departureTime: '',
        boardingPlace: '',
      },
      passengers: workspace.passengers.map((passenger) => ({
        ...passenger,
        assignedDestination: passenger.assignedDestination ?? '',
        busId: null,
        seatNumber: null,
      })),
    });
    if (errors.length) {
      setError(errors[0]);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = await confirmDestinationQueueAllocation(row, workspace);
      setRow(saved);
      setWorkspace(saved.allocation_data);
      setMessage('행선지 배정을 확정했습니다.');
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : '확정하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const cancelConfirmation = async () => {
    if (saving || workspace.status !== 'confirmed') return;
    setSaving(true);
    setError('');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('관리자 로그인이 필요합니다.');
      const saved = await cancelConfirmedWorkspace(row, workspace, session.user.id);
      setRow(saved);
      setWorkspace(saved.allocation_data);
      setDirty(false);
      setCancelDialogOpen(false);
      setMessage('행선지 배차 확정을 취소했습니다.');
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : '확정을 취소하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.editor}>
      <header className={styles.hero}>
        <div>
          <span>행선지 대기 배차</span>
          <h1>{row.allocation_name}</h1>
          <p>사전에는 행선지만 확정합니다. 실제 호차는 현장 탑승 시 44명 단위로 생성됩니다.</p>
        </div>
        <div className={styles.actions}>
          {readOnly ? (
            <button type="button" className={styles.cancelButton} onClick={() => setCancelDialogOpen(true)} disabled={saving}>
              <RotateCcw size={17} /> 배차 확정 취소
            </button>
          ) : (
            <>
              <button type="button" onClick={save} disabled={saving || !dirty}>
                <Save size={17} /> 변경사항 저장
              </button>
              <button type="button" className={styles.primary} onClick={confirm} disabled={saving || dirty}>
                <CheckCircle2 size={17} /> 행선지 배정 확정
              </button>
            </>
          )}
        </div>
      </header>

      {message && <div className={styles.success}>{message}</div>}
      {error && <div className={styles.error}>{error}</div>}
      {readOnly && (
        <div className={styles.confirmedNotice}>
          <CheckCircle2 size={18} />
          <div>
            <strong>행선지 배차가 확정되었습니다.</strong>
            <span>취소하면 승객의 확정표가 숨겨지고 출발 전 생성된 대기 호차가 정리됩니다.</span>
          </div>
        </div>
      )}

      <section className={styles.metrics}>
        <article><Users size={19} /><strong>{workspace.passengers.length}명</strong><span>확정 인원</span></article>
        <article><Bus size={19} /><strong>{expectedBusCount}대</strong><span>예상 버스</span></article>
        <article><CheckCircle2 size={19} /><strong>{firstChoiceCoverage}%</strong><span>1지망 배정</span></article>
        <article><MapPin size={19} /><strong>{stats.length}곳</strong><span>운영 행선지</span></article>
      </section>

      <section className={styles.commonBoarding}>
        <div>
          <strong>공통 탑승 정보</strong>
          <span>모든 행선지에 동일하게 안내됩니다.</span>
        </div>
        <label>
          운영 시작 시간
          <input
            value={workspace.commonBoarding?.departureTime ?? ''}
            disabled={readOnly}
            onChange={(event) =>
              updateWorkspace({
                ...workspace,
                commonBoarding: {
                  departureTime: event.target.value,
                  boardingPlace: workspace.commonBoarding?.boardingPlace ?? '',
                },
              })
            }
          />
        </label>
        <label>
          탑승 장소
          <input
            value={workspace.commonBoarding?.boardingPlace ?? ''}
            disabled={readOnly}
            onChange={(event) =>
              updateWorkspace({
                ...workspace,
                commonBoarding: {
                  departureTime: workspace.commonBoarding?.departureTime ?? '',
                  boardingPlace: event.target.value,
                },
              })
            }
          />
        </label>
      </section>

      <div className={styles.workspace}>
        <aside>
          <h2>행선지</h2>
          {stats.map((destination) => (
            <button
              type="button"
              key={destination.destination}
              className={effectiveDestination === destination.destination ? styles.selected : undefined}
              onClick={() => setSelectedDestination(destination.destination)}
            >
              <strong>{destination.destination}</strong>
              <span>
                {destination.passengerCount}명 · 예상 {destination.expectedBusCount}대 ·
                나머지 {destination.remainderCount}명
              </span>
              <small>
                잔여좌석 {destination.remainingSeatCount}석 · 1지망 {destination.firstChoiceCount} ·
                2지망 {destination.secondChoiceCount}
              </small>
            </button>
          ))}
        </aside>
        <section className={styles.roster}>
          <div className={styles.rosterHeader}>
            <div><h2>{effectiveDestination}행 확정 명단</h2><span>{visiblePassengers.length}명 표시</span></div>
            <div className={styles.rosterControls}>
              <div className={styles.assignmentFilters} aria-label="배정 지망 필터">
                <button
                  type="button"
                  className={assignmentFilter === 'all' ? styles.activeFilter : undefined}
                  onClick={() => setAssignmentFilter('all')}
                >
                  전체
                </button>
                <button
                  type="button"
                  className={assignmentFilter === 'second_choice' ? styles.activeFilter : undefined}
                  onClick={() => setAssignmentFilter('second_choice')}
                >
                  2지망 배정
                </button>
              </div>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="이름, 연락처, 캠퍼스 검색" />
            </div>
          </div>
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>이름</th><th>캠퍼스·팀</th><th>1지망</th><th>2지망</th><th>확정 행선지</th></tr></thead>
              <tbody>
                {visiblePassengers.map((passenger) => {
                  const isSecondChoice = isSecondChoiceDestinationAssignment({
                    assignedDestination: passenger.assignedDestination ?? '',
                    preferences: passenger.preferences,
                  });
                  return (
                  <tr key={passenger.reservationId} className={isSecondChoice ? styles.secondChoiceRow : undefined}>
                    <td>
                      <div className={styles.passengerName}>
                        <strong>{passenger.name}</strong>
                        {isSecondChoice && <span className={styles.secondChoiceBadge}>2지망 배정</span>}
                      </div>
                      <small>{passenger.phone}</small>
                    </td>
                    <td>{passenger.campus} · {passenger.team}</td>
                    <td>{passenger.preferences[0] ?? '-'}</td>
                    <td className={isSecondChoice ? styles.secondChoiceCell : undefined}>{passenger.preferences[1] ?? '-'}</td>
                    <td>
                      <select
                        disabled={readOnly}
                        value={passenger.assignedDestination ?? ''}
                        onChange={(event) =>
                          updateWorkspace({
                            ...workspace,
                            passengers: workspace.passengers.map((item) =>
                              item.reservationId === passenger.reservationId
                                ? { ...item, assignedDestination: event.target.value }
                                : item
                            ),
                          })
                        }
                      >
                        {destinationOptions.map((destination) => <option key={destination}>{destination}</option>)}
                      </select>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {cancelDialogOpen && (
        <div className={styles.dialogBackdrop} onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) setCancelDialogOpen(false);
        }}>
          <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="destination-queue-cancel-title">
            <button type="button" className={styles.dialogClose} onClick={() => setCancelDialogOpen(false)} disabled={saving} aria-label="닫기">
              <X size={18} />
            </button>
            <AlertTriangle className={styles.dialogIcon} size={28} />
            <h2 id="destination-queue-cancel-title">배차 확정을 취소할까요?</h2>
            <p>
              승객의 행선지 확정표가 즉시 숨겨지고 초안 상태로 돌아갑니다.
              이미 출발한 행선지 대기 호차가 있으면 취소할 수 없습니다.
            </p>
            <div className={styles.dialogActions}>
              <button type="button" onClick={() => setCancelDialogOpen(false)} disabled={saving}>돌아가기</button>
              <button type="button" className={styles.danger} onClick={() => void cancelConfirmation()} disabled={saving}>
                <RotateCcw size={17} /> {saving ? '취소 처리 중...' : '배차 확정 취소'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default DestinationQueueWorkspaceEditor;
