import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRightLeft,
  Archive,
  ArchiveRestore,
  AlertTriangle,
  Bus,
  CheckCircle2,
  ClipboardList,
  LoaderCircle,
  Pencil,
  Phone,
  RefreshCw,
  Search,
  UserPlus,
  UserX,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useAdminAuth } from '../../components/AdminAuthProvider';
import {
  archiveBoardingException,
  getBoardingExceptionArchiveSnapshot,
  getBoardingExceptionReasonEdits,
  restoreBoardingException,
  updateBoardingExceptionReason,
  type BoardingExceptionArchiveSnapshot,
  type BoardingExceptionReasonEdit,
} from '../../lib/admin/boardingExceptionArchiveService';
import { getBoardingManagementSnapshot } from '../../lib/admin/boardingManagementService';
import { supabase } from '../../lib/supabase';
import { formatBusLabel } from '../../utils/busLabel';
import { formatKoreanDateTime } from '../../utils/dateTime';
import AdminHeader from './AdminHeader';
import {
  buildBoardingExceptionRecords,
  type BoardingExceptionKind,
  type BoardingExceptionRecord,
} from './boardingExceptionRecords';
import styles from './AdminBoardingExceptionsPage.module.css';

const kindDetails: Record<
  BoardingExceptionKind,
  { label: string; description: string; icon: typeof Bus }
> = {
  walk_in: {
    label: '현장 추가 탑승',
    description: '기존 확정 명단에 없던 탑승자를 현장에서 추가했습니다.',
    icon: UserPlus,
  },
  bus_move: {
    label: '호차 이동',
    description: '확정된 탑승자의 호차를 현장 상황에 맞게 변경했습니다.',
    icon: ArrowRightLeft,
  },
  no_show: {
    label: '미탑승 처리',
    description: '탑승자를 미탑승으로 처리했습니다.',
    icon: UserX,
  },
  no_show_reversed: {
    label: '미탑승 처리 취소·탑승 전환',
    description: '미탑승 처리된 탑승자의 탑승을 다시 확인했습니다.',
    icon: Bus,
  },
};

const getKoreanDateKey = (value: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));

const AdminBoardingExceptionsPage = () => {
  const navigate = useNavigate();
  const { adminRole } = useAdminAuth();
  const isGlobalAdmin = adminRole?.role === 'global_admin';
  const [snapshot, setSnapshot] = useState<
    Awaited<ReturnType<typeof getBoardingManagementSnapshot>>
  >(null);
  const [archiveSnapshot, setArchiveSnapshot] =
    useState<BoardingExceptionArchiveSnapshot>({
      archivedKeys: [],
      records: [],
    });
  const [reasonEdits, setReasonEdits] = useState<BoardingExceptionReasonEdit[]>(
    []
  );
  const [editingRecord, setEditingRecord] =
    useState<BoardingExceptionRecord | null>(null);
  const [editingReason, setEditingReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<'unresolved' | 'archived'>('unresolved');
  const [processingRecordId, setProcessingRecordId] = useState('');
  const actionInFlightRef = useRef(false);
  const [pendingAction, setPendingAction] = useState<{
    mode: 'archive' | 'restore';
    record: BoardingExceptionRecord;
  } | null>(null);
  const [actionDialogError, setActionDialogError] = useState('');
  const [kindFilter, setKindFilter] = useState<BoardingExceptionKind | ''>('');
  const [busFilter, setBusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [search, setSearch] = useState('');
  const realtimeTimerRef = useRef<number | null>(null);

  const loadSnapshot = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);

    try {
      const [nextSnapshot, nextArchiveSnapshot, nextReasonEdits] =
        await Promise.all([
        getBoardingManagementSnapshot(),
        getBoardingExceptionArchiveSnapshot(),
        getBoardingExceptionReasonEdits(),
      ]);
      setSnapshot(nextSnapshot);
      setArchiveSnapshot(nextArchiveSnapshot);
      setReasonEdits(nextReasonEdits);
      setError('');
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : '특수상황 기록을 불러오지 못했습니다.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initialLoadTimer = window.setTimeout(() => {
      void loadSnapshot();
    }, 0);

    const scheduleRefresh = () => {
      if (realtimeTimerRef.current !== null) {
        window.clearTimeout(realtimeTimerRef.current);
      }
      realtimeTimerRef.current = window.setTimeout(() => {
        realtimeTimerRef.current = null;
        void loadSnapshot(true);
      }, 800);
    };

    const channel = supabase
      .channel('boarding-exception-records-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reservations' },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'boarding_status_events' },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'boarding_walk_in_passengers' },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'boarding_exception_archives' },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'boarding_exception_reason_edits',
        },
        scheduleRefresh
      )
      .subscribe();

    return () => {
      window.clearTimeout(initialLoadTimer);
      if (realtimeTimerRef.current !== null) {
        window.clearTimeout(realtimeTimerRef.current);
      }
      void supabase.removeChannel(channel);
    };
  }, [loadSnapshot]);

  const records = useMemo(() => {
    const editsByRecordKey = new Map(
      reasonEdits.map((edit) => [edit.recordKey, edit])
    );
    return buildBoardingExceptionRecords(snapshot).map((record) => {
      const edit = editsByRecordKey.get(record.id);
      return edit
        ? {
            ...record,
            reason: edit.reason,
            reasonUpdatedAt: edit.updatedAt,
            reasonUpdatedByName: edit.updatedByName,
          }
        : record;
    });
  }, [reasonEdits, snapshot]);
  const archivedKeys = useMemo(
    () => new Set(archiveSnapshot.archivedKeys),
    [archiveSnapshot.archivedKeys]
  );
  const unresolvedRecords = useMemo(
    () => records.filter((record) => !archivedKeys.has(record.id)),
    [archivedKeys, records]
  );
  const archivedRecords = useMemo(
    () =>
      isGlobalAdmin
        ? (archiveSnapshot.records as unknown as BoardingExceptionRecord[])
        : [],
    [archiveSnapshot.records, isGlobalAdmin]
  );
  const sourceRecords = view === 'archived' ? archivedRecords : unresolvedRecords;
  const counts = useMemo(
    () =>
      sourceRecords.reduce(
        (result, record) => {
          result[record.kind] += 1;
          return result;
        },
        {
          walk_in: 0,
          bus_move: 0,
          no_show: 0,
          no_show_reversed: 0,
        } as Record<BoardingExceptionKind, number>
      ),
    [sourceRecords]
  );
  const buses = useMemo(
    () =>
      Array.from(new Set(sourceRecords.map((record) => record.busNumber))).sort(
        (left, right) =>
          formatBusLabel(left).localeCompare(formatBusLabel(right), 'ko', {
            numeric: true,
          })
      ),
    [sourceRecords]
  );
  const filteredRecords = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('ko');

    return sourceRecords.filter((record) => {
      if (kindFilter && record.kind !== kindFilter) return false;
      if (busFilter && record.busNumber !== busFilter) return false;
      if (
        dateFilter &&
        (!record.createdAt || getKoreanDateKey(record.createdAt) !== dateFilter)
      ) {
        return false;
      }
      if (!keyword) return true;

      return [
        record.passengerName,
        record.passengerPhone,
        record.campus,
        record.busNumber,
        record.seatNumber,
        record.actorName,
        record.reason,
        kindDetails[record.kind].label,
      ].some((value) => value.toLocaleLowerCase('ko').includes(keyword));
    });
  }, [busFilter, dateFilter, kindFilter, search, sourceRecords]);

  const handleArchive = (record: BoardingExceptionRecord) => {
    if (!isGlobalAdmin || processingRecordId || actionInFlightRef.current) return;
    setActionDialogError('');
    setPendingAction({ mode: 'archive', record });
  };

  const handleRestore = (record: BoardingExceptionRecord) => {
    if (!isGlobalAdmin || processingRecordId || actionInFlightRef.current) return;
    setActionDialogError('');
    setPendingAction({ mode: 'restore', record });
  };

  const confirmPendingAction = async () => {
    if (
      !isGlobalAdmin ||
      !pendingAction ||
      processingRecordId ||
      actionInFlightRef.current
    ) {
      return;
    }

    const { mode, record } = pendingAction;
    actionInFlightRef.current = true;
    setProcessingRecordId(record.id);
    setError('');
    setActionDialogError('');
    try {
      if (mode === 'archive') {
        await archiveBoardingException(record.id, record.allocationId, {
          ...record,
        });
      } else {
        await restoreBoardingException(record.id);
      }
      await loadSnapshot(true);
      setPendingAction(null);
    } catch (actionError) {
      setActionDialogError(
        actionError instanceof Error
          ? actionError.message
          : mode === 'archive'
            ? '특수상황 기록을 보관하지 못했습니다.'
            : '특수상황 기록을 복구하지 못했습니다.'
      );
    } finally {
      actionInFlightRef.current = false;
      setProcessingRecordId('');
    }
  };

  useEffect(() => {
    if (!pendingAction) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !processingRecordId) {
        setPendingAction(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingAction, processingRecordId]);

  const openReasonEditor = (record: BoardingExceptionRecord) => {
    setEditingRecord(record);
    setEditingReason(record.reason);
  };

  const handleReasonUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingRecord || !editingReason.trim() || processingRecordId) return;

    setProcessingRecordId(editingRecord.id);
    setError('');
    try {
      await updateBoardingExceptionReason({
        recordKey: editingRecord.id,
        allocationId: editingRecord.allocationId,
        busId: editingRecord.busId,
        reason: editingReason.trim(),
      });
      setEditingRecord(null);
      setEditingReason('');
      await loadSnapshot(true);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : '처리 사유를 수정하지 못했습니다.'
      );
    } finally {
      setProcessingRecordId('');
    }
  };

  return (
    <div className={styles.pageContainer}>
      <AdminHeader />
      <main className={styles.main}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate('/admin/boarding')}
        >
          <ArrowLeft size={16} />
          탑승 확인 관리
        </button>

        <section className={styles.hero}>
          <div className={styles.heroIcon}>
            <ClipboardList size={25} />
          </div>
          <div>
            <span>탑승 현장 기록</span>
            <h1>특수상황 기록</h1>
            <p>
              해결되지 않은 현장 예외를 우선 확인하고, 전체 관리자가 확인
              완료한 기록은 보관함으로 이동합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadSnapshot(true)}
            disabled={loading || refreshing}
          >
            <RefreshCw size={15} className={refreshing ? styles.spinning : ''} />
            {refreshing ? '동기화 중' : '새로고침'}
          </button>
        </section>

        {isGlobalAdmin && (
          <nav className={styles.viewTabs} aria-label="특수상황 기록 보기">
            <button
              type="button"
              className={view === 'unresolved' ? styles.active : ''}
              onClick={() => setView('unresolved')}
            >
              <CheckCircle2 size={16} />
              미해결
              <strong>{unresolvedRecords.length.toLocaleString()}</strong>
            </button>
            <button
              type="button"
              className={view === 'archived' ? styles.active : ''}
              onClick={() => setView('archived')}
            >
              <Archive size={16} />
              보관함
              <strong>{archivedRecords.length.toLocaleString()}</strong>
            </button>
          </nav>
        )}

        <section className={styles.summaryGrid} aria-label="특수상황 요약">
          {(Object.keys(kindDetails) as BoardingExceptionKind[]).map((kind) => {
            const detail = kindDetails[kind];
            const Icon = detail.icon;
            return (
              <button
                type="button"
                key={kind}
                className={`${styles.summaryCard} ${styles[kind]} ${
                  kindFilter === kind ? styles.selected : ''
                }`}
                onClick={() =>
                  setKindFilter((current) => (current === kind ? '' : kind))
                }
              >
                <Icon size={19} />
                <span>{detail.label}</span>
                <strong>{counts[kind].toLocaleString()}건</strong>
              </button>
            );
          })}
        </section>

        <section className={styles.filters}>
          <label className={styles.searchField}>
            <span>기록 검색</span>
            <div>
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="이름, 캠퍼스, 사유, 처리자"
              />
            </div>
          </label>
          <label>
            <span>상황 유형</span>
            <select
              value={kindFilter}
              onChange={(event) =>
                setKindFilter(event.target.value as BoardingExceptionKind | '')
              }
            >
              <option value="">전체 유형</option>
              {(Object.keys(kindDetails) as BoardingExceptionKind[]).map(
                (kind) => (
                  <option key={kind} value={kind}>
                    {kindDetails[kind].label}
                  </option>
                )
              )}
            </select>
          </label>
          <label>
            <span>호차</span>
            <select
              value={busFilter}
              onChange={(event) => setBusFilter(event.target.value)}
            >
              <option value="">전체 호차</option>
              {buses.map((bus) => (
                <option key={bus} value={bus}>
                  {formatBusLabel(bus)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>처리일</span>
            <input
              type="date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
            />
          </label>
        </section>

        {error && (
          <section className={styles.error} role="alert">
            <strong>특수상황 기록을 사용할 수 없습니다.</strong>
            <span>{error}</span>
            <button type="button" onClick={() => void loadSnapshot()}>
              다시 확인
            </button>
          </section>
        )}

        <section className={styles.recordPanel}>
          <header>
            <div>
              <h2>통합 기록</h2>
              <p>
                {view === 'archived' ? '보관 기록' : '미해결 기록'}{' '}
                {sourceRecords.length.toLocaleString()}건 중{' '}
                {filteredRecords.length.toLocaleString()}건 표시
              </p>
            </div>
            <button type="button" onClick={() => navigate('/admin/boarding')}>
              탑승 관리에서 처리
            </button>
          </header>

          {loading ? (
            <div className={styles.emptyState}>기록을 불러오는 중입니다.</div>
          ) : filteredRecords.length === 0 ? (
            <div className={styles.emptyState}>
              {view === 'archived'
                ? '조건에 맞는 보관 기록이 없습니다.'
                : '조건에 맞는 미해결 특수상황이 없습니다.'}
            </div>
          ) : (
            <div className={styles.recordList}>
              {filteredRecords.map((record) => {
                const detail = kindDetails[record.kind];
                const Icon = detail.icon;
                return (
                  <article className={styles.recordCard} key={record.id}>
                    <div className={`${styles.recordIcon} ${styles[record.kind]}`}>
                      <Icon size={18} />
                    </div>
                    <div className={styles.recordBody}>
                      <div className={styles.recordHeading}>
                        <div>
                          <span className={`${styles.kindBadge} ${styles[record.kind]}`}>
                            {detail.label}
                          </span>
                          {record.isAutomatic && (
                            <span className={styles.autoBadge}>자동 처리</span>
                          )}
                          {record.archivedAt && (
                            <span className={styles.archiveBadge}>보관 완료</span>
                          )}
                        </div>
                        <time>
                          {record.createdAt
                            ? formatKoreanDateTime(record.createdAt)
                            : '기록 시각 없음'}
                        </time>
                      </div>
                      <div className={styles.passengerRow}>
                        <strong>{record.passengerName}</strong>
                        <span>{record.campus || '소속 정보 없음'}</span>
                        <span>
                          {formatBusLabel(record.busNumber)} · 명단{' '}
                          {record.seatNumber}번
                        </span>
                      </div>
                      <p className={styles.description}>{detail.description}</p>
                      <div className={styles.reason}>
                        <span>처리 사유</span>
                        <strong>{record.reason}</strong>
                        {record.reasonUpdatedAt && (
                          <small>
                            수정: {record.reasonUpdatedByName ?? '탑승 관리자'} ·{' '}
                            {formatKoreanDateTime(record.reasonUpdatedAt)}
                          </small>
                        )}
                      </div>
                      <footer>
                        <div>
                          <span>처리자 · {record.actorName}</span>
                          {record.archivedAt && (
                            <span>
                              보관 · {record.archivedByName ?? '전체 관리자'} ·{' '}
                              {formatKoreanDateTime(record.archivedAt)}
                            </span>
                          )}
                        </div>
                        <div className={styles.recordActions}>
                          {!record.archivedAt && record.busId && (
                            <button
                              type="button"
                              onClick={() => openReasonEditor(record)}
                              disabled={Boolean(processingRecordId)}
                            >
                              <Pencil size={14} />
                              처리 사유 수정
                            </button>
                          )}
                          {record.passengerPhone && (
                            <a href={`tel:${record.passengerPhone}`}>
                              <Phone size={14} />
                              {record.passengerPhone}
                            </a>
                          )}
                          {isGlobalAdmin && view === 'unresolved' && (
                            <button
                              type="button"
                              onClick={() => handleArchive(record)}
                              disabled={Boolean(processingRecordId)}
                            >
                              <Archive size={14} />
                              {processingRecordId === record.id
                                ? '보관 중'
                                : '확인 후 보관'}
                            </button>
                          )}
                          {isGlobalAdmin && view === 'archived' && (
                            <button
                              type="button"
                              onClick={() => handleRestore(record)}
                              disabled={Boolean(processingRecordId)}
                            >
                              <ArchiveRestore size={14} />
                              {processingRecordId === record.id
                                ? '복구 중'
                                : '미해결로 복구'}
                            </button>
                          )}
                        </div>
                      </footer>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
      {pendingAction && (
        <div
          className={styles.modalBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !processingRecordId) {
              setPendingAction(null);
            }
          }}
        >
          <section
            className={styles.actionModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="exception-action-dialog-title"
            aria-describedby="exception-action-dialog-description"
          >
            <span className={styles.actionModalIcon} aria-hidden="true">
              {pendingAction.mode === 'archive' ? (
                <Archive size={25} />
              ) : (
                <ArchiveRestore size={25} />
              )}
            </span>
            <p className={styles.actionModalEyebrow}>
              {pendingAction.mode === 'archive'
                ? '특수상황 확인 완료'
                : '보관 기록 복구'}
            </p>
            <h2 id="exception-action-dialog-title">
              {pendingAction.record.passengerName}님의 기록을{' '}
              {pendingAction.mode === 'archive' ? '보관할까요?' : '복구할까요?'}
            </h2>
            <p id="exception-action-dialog-description">
              {pendingAction.mode === 'archive'
                ? '현재 기록 스냅샷을 보관하고 미해결 목록에서 제외합니다. 원본 탑승 기록은 삭제되지 않습니다.'
                : '보관 표시를 제거하고 이 기록을 미해결 목록으로 되돌립니다. 원본 탑승 기록은 변경되지 않습니다.'}
            </p>
            <div className={styles.actionRecordSummary}>
              <div>
                <span>상황</span>
                <strong>{kindDetails[pendingAction.record.kind].label}</strong>
              </div>
              <div>
                <span>탑승 정보</span>
                <strong>
                  {formatBusLabel(pendingAction.record.busNumber)} · 명단{' '}
                  {pendingAction.record.seatNumber}번
                </strong>
              </div>
              <div>
                <span>처리 사유</span>
                <strong>{pendingAction.record.reason}</strong>
              </div>
            </div>
            <div className={styles.actionModalNotice}>
              <AlertTriangle size={18} aria-hidden="true" />
              <span>
                {pendingAction.mode === 'archive'
                  ? '확인이 끝난 기록에만 사용하세요. 필요하면 보관함에서 다시 미해결 상태로 복구할 수 있습니다.'
                  : '복구 후에는 담당자가 다시 확인해야 하는 미해결 기록으로 표시됩니다.'}
              </span>
            </div>
            {actionDialogError && (
              <p className={styles.actionModalError} role="alert">
                {actionDialogError}
              </p>
            )}
            <footer className={styles.actionModalActions}>
              <button
                type="button"
                autoFocus
                onClick={() => setPendingAction(null)}
                disabled={Boolean(processingRecordId)}
              >
                현재 상태 유지
              </button>
              <button
                type="button"
                className={styles.actionModalSubmit}
                onClick={() => void confirmPendingAction()}
                disabled={Boolean(processingRecordId)}
              >
                {processingRecordId ? (
                  <>
                    <LoaderCircle className={styles.spinning} size={17} />
                    처리 중...
                  </>
                ) : pendingAction.mode === 'archive' ? (
                  '확인 완료 후 보관'
                ) : (
                  '미해결 목록으로 복구'
                )}
              </button>
            </footer>
          </section>
        </div>
      )}
      {editingRecord && (
        <div
          className={styles.modalBackdrop}
          onMouseDown={() => setEditingRecord(null)}
        >
          <form
            className={styles.reasonModal}
            onSubmit={(event) => void handleReasonUpdate(event)}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span>특수상황 기록</span>
                <h2>처리 사유 수정</h2>
              </div>
              <button type="button" onClick={() => setEditingRecord(null)}>
                닫기
              </button>
            </header>
            <p>
              {editingRecord.passengerName} ·{' '}
              {formatBusLabel(editingRecord.busNumber)}
            </p>
            <label>
              <span>처리 사유</span>
              <textarea
                value={editingReason}
                onChange={(event) => setEditingReason(event.target.value)}
                rows={5}
                autoFocus
                required
              />
            </label>
            <small>
              수정 내용과 수정자는 별도 이력에 보존됩니다. 담당 호차 기록만
              수정할 수 있습니다.
            </small>
            <footer>
              <button type="button" onClick={() => setEditingRecord(null)}>
                취소
              </button>
              <button
                type="submit"
                disabled={!editingReason.trim() || Boolean(processingRecordId)}
              >
                {processingRecordId === editingRecord.id
                  ? '저장 중'
                  : '수정 저장'}
              </button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
};

export default AdminBoardingExceptionsPage;
