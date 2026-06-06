import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bus,
  CheckCircle2,
  History,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Users,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import AdminHeader from './AdminHeader';
import { getBusOptions } from '../../lib/admin/busAllocationService';
import {
  acquireAllocationWorkspaceLock,
  cancelConfirmedWorkspace,
  confirmAllocationWorkspace,
  getAllocationWorkspaces,
  getFirstChoiceCoverage,
  getWorkspaceTotals,
  saveAllocationWorkspace,
  saveConfirmedWorkspaceChanges,
  validateWorkspace,
} from '../../lib/admin/allocationWorkspaceService';
import type {
  AllocationWorkspaceBus,
  AllocationWorkspaceData,
  AllocationWorkspacePassenger,
  AllocationWorkspaceRow,
} from '../../lib/admin/allocationWorkspaceService';
import { supabase } from '../../lib/supabase';

import styles from './AdminAllocationWorkspacePage.module.css';

interface BusOption {
  id: string;
  capacity: number;
  estimated_price: number;
  max_count?: number;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const nextSeatNumber = (
  workspace: AllocationWorkspaceData,
  busId: string
) => {
  const bus = workspace.buses.find((item) => item.id === busId);
  if (!bus) return null;

  const used = new Set(
    workspace.passengers
      .filter((passenger) => passenger.busId === busId)
      .map((passenger) => passenger.seatNumber)
      .filter((seat): seat is number => seat !== null)
  );

  return (
    Array.from({ length: bus.capacity }, (_, index) => index + 1).find(
      (seat) => !used.has(seat)
    ) ?? null
  );
};

const AdminAllocationWorkspacePage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const workspaceId = searchParams.get('id') ?? '';
  const [row, setRow] = useState<AllocationWorkspaceRow | null>(null);
  const [workspace, setWorkspace] = useState<AllocationWorkspaceData | null>(
    null
  );
  const [otherWorkspaces, setOtherWorkspaces] = useState<
    AllocationWorkspaceRow[]
  >([]);
  const [busOptions, setBusOptions] = useState<BusOption[]>([]);
  const [selectedBusId, setSelectedBusId] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [cancelText, setCancelText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);

  useEffect(() => {
    if (!workspaceId) {
      navigate('/admin/allocation');
      return;
    }

    void Promise.all([getAllocationWorkspaces(), getBusOptions()])
      .then(async ([nextRows, options]) => {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) throw new Error('로그인이 필요합니다.');
        const lockResult = await acquireAllocationWorkspaceLock(
          workspaceId,
          session.user.id
        );
        setRow(lockResult.row);
        setWorkspace(lockResult.row.allocation_data);
        setReadOnly(lockResult.readOnly);
        setSelectedBusId(lockResult.row.allocation_data.buses[0]?.id ?? '');
        setOtherWorkspaces(
          nextRows.filter(
            (item) =>
              item.id !== workspaceId && item.allocation_data.status === 'draft'
          )
        );
        setBusOptions(options as BusOption[]);
      })
      .catch((loadError) => {
        console.error(loadError);
        setError('배차 작업안을 불러오지 못했습니다.');
      });
  }, [navigate, workspaceId]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const selectedBus = workspace?.buses.find((bus) => bus.id === selectedBusId);
  const validation = useMemo(
    () => (workspace ? validateWorkspace(workspace) : { errors: [], warnings: [] }),
    [workspace]
  );
  const totals = useMemo(
    () => (workspace ? getWorkspaceTotals(workspace) : { totalCost: 0, totalCapacity: 0 }),
    [workspace]
  );

  const updateWorkspace = (
    updater: (current: AllocationWorkspaceData) => AllocationWorkspaceData
  ) => {
    setWorkspace((current) => (current ? updater(clone(current)) : current));
    setDirty(true);
  };

  const updateBus = (
    busId: string,
    key: keyof AllocationWorkspaceBus,
    value: string | number
  ) => {
    updateWorkspace((current) => {
      const bus = current.buses.find((item) => item.id === busId);
      if (bus) Object.assign(bus, { [key]: value });
      return current;
    });
  };

  const assignPassenger = (passengerId: string, busId: string | null) => {
    updateWorkspace((current) => {
      const passenger = current.passengers.find(
        (item) => item.reservationId === passengerId
      );
      if (!passenger) return current;
      passenger.busId = busId;
      passenger.seatNumber = busId ? nextSeatNumber(current, busId) : null;
      return current;
    });
  };

  const dropPassenger = (
    event: React.DragEvent<HTMLElement>,
    busId: string | null
  ) => {
    event.preventDefault();
    const passengerId = event.dataTransfer.getData('text/allocation-passenger');
    if (passengerId) assignPassenger(passengerId, busId);
  };

  const updatePassengerSeat = (passengerId: string, seatNumber: number | null) => {
    updateWorkspace((current) => {
      const passenger = current.passengers.find(
        (item) => item.reservationId === passengerId
      );
      if (passenger) passenger.seatNumber = seatNumber;
      return current;
    });
  };

  const addBus = (option: BusOption) => {
    const usedCount =
      workspace?.buses.filter(
        (bus) =>
          bus.optionId === option.id ||
          (bus.capacity === option.capacity && bus.price === option.estimated_price)
      ).length ?? 0;
    if (usedCount >= (option.max_count ?? 999)) {
      setError(`${option.capacity}석 버스의 사용 가능 최대 대수에 도달했습니다.`);
      return;
    }
    updateWorkspace((current) => {
      const busNumber = current.buses.length + 1;
      const bus: AllocationWorkspaceBus = {
        id: `bus-${Date.now()}-${option.id}`,
        optionId: option.id,
        label: `${busNumber}호차`,
        capacity: option.capacity,
        price: option.estimated_price,
        maxAvailableCount: option.max_count ?? 999,
        destination: '',
        departureTime: current.buses[0]?.departureTime ?? '',
        boardingPlace: current.buses[0]?.boardingPlace ?? '',
        minimumPassengers: 36,
      };
      current.buses.push(bus);
      setSelectedBusId(bus.id);
      return current;
    });
  };

  const deleteBus = (busId: string) => {
    if (!window.confirm('이 버스를 삭제하고 탑승객을 미배차 상태로 옮길까요?')) return;
    updateWorkspace((current) => {
      current.buses = current.buses.filter((bus) => bus.id !== busId);
      current.passengers.forEach((passenger) => {
        if (passenger.busId === busId) {
          passenger.busId = null;
          passenger.seatNumber = null;
        }
      });
      setSelectedBusId(current.buses[0]?.id ?? '');
      return current;
    });
  };

  const save = async () => {
    if (!row || !workspace) return;
    setSaving(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('로그인이 필요합니다.');

      const saved =
        workspace.status === 'confirmed'
          ? await saveConfirmedWorkspaceChanges(row, workspace, session.user.id)
          : await saveAllocationWorkspace(row, workspace, session.user.id);
      setRow(saved);
      setWorkspace(saved.allocation_data);
      setDirty(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const restoreVersion = (versionId: string) => {
    if (!workspace) return;
    const version = workspace.versions.find((item) => item.id === versionId);
    if (!version || !window.confirm(`${version.label} 상태로 복원할까요?`)) return;
    updateWorkspace((current) => ({
      ...current,
      buses: clone(version.buses),
      passengers: clone(version.passengers),
    }));
    setSelectedBusId(version.buses[0]?.id ?? '');
  };

  const confirmAll = async () => {
    if (!row || !workspace || confirmText !== '전체 배차를 확정합니다') return;
    setSaving(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('로그인이 필요합니다.');
      const saved = await confirmAllocationWorkspace(row, workspace, session.user.id);
      setRow(saved);
      setWorkspace(saved.allocation_data);
      setDirty(false);
      setConfirmText('');
    } catch (confirmError) {
      setError(
        confirmError instanceof Error ? confirmError.message : '확정하지 못했습니다.'
      );
    } finally {
      setSaving(false);
    }
  };

  const cancelConfirmation = async () => {
    if (!row || !workspace || cancelText !== '배차 확정을 취소합니다') return;
    setSaving(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('로그인이 필요합니다.');
      const saved = await cancelConfirmedWorkspace(row, workspace, session.user.id);
      setRow(saved);
      setWorkspace(saved.allocation_data);
      setDirty(false);
      setCancelText('');
    } catch (cancelError) {
      setError(
        cancelError instanceof Error ? cancelError.message : '확정을 취소하지 못했습니다.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (!workspace || !row) {
    return (
      <div className={styles.page}>
        <AdminHeader />
        <main className={styles.main}>{error ?? '배차 작업안을 불러오는 중입니다.'}</main>
      </div>
    );
  }

  const selectedPassengers = workspace.passengers.filter(
    (passenger) => passenger.busId === selectedBusId
  );
  const unassignedPassengers = workspace.passengers.filter(
    (passenger) => !passenger.busId
  );
  const destinationOptions = [
    ...new Set(workspace.passengers.flatMap((passenger) => passenger.preferences)),
  ];
  const canConfirm =
    validation.errors.length === 0 &&
    (validation.warnings.length === 0 || workspace.allowMinimumPassengerOverride);

  return (
    <div className={styles.page}>
      <AdminHeader />
      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <button type="button" className={styles.back} onClick={() => navigate('/admin/allocation')}>
              <ArrowLeft size={17} /> 배차 계산으로
            </button>
            <h1>{row.allocation_name}</h1>
            <p>
              {workspace.status === 'confirmed' ? '확정 배차' : '임시 배차안'} ·
              저장 버튼을 눌러야 변경사항이 반영됩니다.
            </p>
          </div>
          <button type="button" className={styles.saveButton} disabled={!dirty || saving || readOnly} onClick={save}>
            <Save size={17} /> {saving ? '저장 중...' : '변경사항 저장'}
          </button>
        </header>

        {error && <div className={styles.error}>{error}</div>}
        {readOnly && (
          <div className={styles.readOnlyBanner}>
            다른 전체 관리자가 이 배차안을 편집 중입니다. 현재는 조회만 가능합니다.
          </div>
        )}

        <section className={styles.metrics}>
          <article><Users size={20} /><strong>{workspace.passengers.length}명</strong><span>전체 승객</span></article>
          <article><Bus size={20} /><strong>{workspace.buses.length}대</strong><span>운행 버스</span></article>
          <article><CheckCircle2 size={20} /><strong>{getFirstChoiceCoverage(workspace).toFixed(1)}%</strong><span>1지망 반영률</span></article>
          <article><strong>{totals.totalCost.toLocaleString()}원</strong><span>총비용</span></article>
          <article className={validation.errors.length ? styles.metricError : undefined}>
            <AlertTriangle size={20} /><strong>{validation.errors.length}건</strong><span>확정 차단 오류</span>
          </article>
        </section>

        <section className={`${styles.workspace} ${readOnly ? styles.readOnly : ''}`}>
          <aside className={styles.busPanel}>
            <h2>버스와 미배차 승객</h2>
            <div className={styles.addBusRow}>
              {busOptions.map((option) => (
                <button type="button" key={option.id} onClick={() => addBus(option)}>
                  <Plus size={14} /> {option.capacity}석 (최대 {option.max_count ?? 999}대)
                </button>
              ))}
            </div>
            <div className={styles.busList}>
              {workspace.buses.map((bus) => {
                const count = workspace.passengers.filter((passenger) => passenger.busId === bus.id).length;
                return (
                  <button
                    type="button"
                    key={bus.id}
                    className={bus.id === selectedBusId ? styles.selectedBus : undefined}
                    onClick={() => setSelectedBusId(bus.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => dropPassenger(event, bus.id)}
                  >
                    <strong>{bus.label}</strong>
                    <span>{count}/{bus.capacity}명</span>
                    <small>{bus.destination || '도착역 미설정'}</small>
                  </button>
                );
              })}
            </div>
            <div
              className={styles.unassigned}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => dropPassenger(event, null)}
            >
              <strong>미배차 {unassignedPassengers.length}명</strong>
              {unassignedPassengers.map((passenger) => (
                <div key={passenger.reservationId}>{passenger.name}</div>
              ))}
            </div>
          </aside>

          <section className={styles.editor}>
            {!selectedBus ? (
              <div className={styles.empty}>편집할 버스를 선택하거나 추가하세요.</div>
            ) : (
              <>
                <div className={styles.busForm}>
                  <label>버스 이름<input value={selectedBus.label} onChange={(event) => updateBus(selectedBus.id, 'label', event.target.value)} /></label>
                  <label>도착역<select value={selectedBus.destination} onChange={(event) => updateBus(selectedBus.id, 'destination', event.target.value)}><option value="">선택</option>{destinationOptions.map((destination) => <option key={destination} value={destination}>{destination}</option>)}</select></label>
                  <label>출발 시간<input value={selectedBus.departureTime} onChange={(event) => updateBus(selectedBus.id, 'departureTime', event.target.value)} /></label>
                  <label>탑승 장소<input value={selectedBus.boardingPlace} onChange={(event) => updateBus(selectedBus.id, 'boardingPlace', event.target.value)} /></label>
                  <button type="button" className={styles.deleteButton} onClick={() => deleteBus(selectedBus.id)}><Trash2 size={15} /> 버스 삭제</button>
                </div>

                <div className={styles.passengerHeader}>
                  <h2>{selectedBus.label} 승객 {selectedPassengers.length}명</h2>
                  <span>좌석 1번부터 {selectedBus.capacity}번까지</span>
                </div>
                <div className={styles.passengerTableWrap}>
                  <table>
                    <thead><tr><th>승객</th><th>캠퍼스·팀</th><th>1·2지망</th><th>버스 이동</th><th>좌석</th></tr></thead>
                    <tbody>
                      {selectedPassengers.map((passenger) => (
                        <PassengerRow
                          key={passenger.reservationId}
                          passenger={passenger}
                          buses={workspace.buses}
                          onAssign={assignPassenger}
                          onSeat={updatePassengerSeat}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </section>

        <section className={`${styles.allPassengerSection} ${readOnly ? styles.readOnly : ''}`}>
          <h2>전체 승객 배차 편집</h2>
          <div className={styles.passengerTableWrap}>
            <table>
              <thead><tr><th>승객</th><th>캠퍼스·팀</th><th>1·2지망</th><th>버스 이동</th><th>좌석</th></tr></thead>
              <tbody>
                {workspace.passengers.map((passenger) => (
                  <PassengerRow
                    key={passenger.reservationId}
                    passenger={passenger}
                    buses={workspace.buses}
                    onAssign={assignPassenger}
                    onSeat={updatePassengerSeat}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={`${styles.reviewGrid} ${readOnly ? styles.readOnly : ''}`}>
          <article>
            <h2>최종 검증</h2>
            {validation.errors.length === 0 ? <p className={styles.ok}>차단 오류가 없습니다.</p> : validation.errors.map((item) => <p className={styles.validationError} key={item}>{item}</p>)}
            {validation.warnings.map((item) => <p className={styles.warning} key={item}>{item}</p>)}
            {validation.warnings.length > 0 && (
              <label className={styles.override}>
                <input
                  type="checkbox"
                  checked={workspace.allowMinimumPassengerOverride}
                  onChange={(event) => updateWorkspace((current) => ({ ...current, allowMinimumPassengerOverride: event.target.checked }))}
                />
                최소 탑승 인원 미달을 관리자 권한으로 예외 승인
              </label>
            )}
          </article>

          <article>
            <h2><History size={18} /> 버전 복원</h2>
            {workspace.versions.length === 0 ? <p>저장된 버전이 없습니다.</p> : workspace.versions.map((version) => (
              <button type="button" className={styles.versionButton} key={version.id} onClick={() => restoreVersion(version.id)}>
                <RotateCcw size={14} /> {version.label} · {new Date(version.createdAt).toLocaleString()}
              </button>
            ))}
          </article>

          <article>
            <h2>다른 임시안 비교</h2>
            {otherWorkspaces.length === 0 ? <p>비교할 다른 임시안이 없습니다.</p> : otherWorkspaces.map((item) => (
              <button type="button" className={styles.versionButton} key={item.id} onClick={() => navigate(`/admin/allocation/workspace?id=${item.id}`)}>
                {item.allocation_name} · {item.total_cost.toLocaleString()}원
              </button>
            ))}
          </article>

          <article>
            <h2><History size={18} /> 변경 이력</h2>
            {[...workspace.history].reverse().map((item) => (
              <div className={styles.historyItem} key={item.id}>
                <strong>{item.detail}</strong>
                <span>{new Date(item.at).toLocaleString()} · {item.actorId.slice(0, 8)}</span>
              </div>
            ))}
          </article>
        </section>

        <section className={`${styles.finalSection} ${readOnly ? styles.readOnly : ''}`}>
          <h2>{workspace.status === 'confirmed' ? '확정 배차 관리' : '최종 배차 확정'}</h2>
          {workspace.status === 'draft' ? (
            <>
              <p>모든 차단 오류를 해결한 뒤 <strong>전체 배차를 확정합니다</strong>를 입력하세요.</p>
              <input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} placeholder="전체 배차를 확정합니다" />
              <button type="button" disabled={!canConfirm || dirty || confirmText !== '전체 배차를 확정합니다' || saving} onClick={confirmAll}>전체 배차 확정</button>
            </>
          ) : (
            <>
              <p>확정 취소 시 승객 버스표가 즉시 숨겨지고 임시 배차안으로 돌아갑니다.</p>
              <input value={cancelText} onChange={(event) => setCancelText(event.target.value)} placeholder="배차 확정을 취소합니다" />
              <button type="button" disabled={cancelText !== '배차 확정을 취소합니다' || saving} onClick={cancelConfirmation}>배차 확정 취소</button>
            </>
          )}
        </section>
      </main>
    </div>
  );
};

const PassengerRow = ({
  passenger,
  buses,
  onAssign,
  onSeat,
}: {
  passenger: AllocationWorkspacePassenger;
  buses: AllocationWorkspaceBus[];
  onAssign: (passengerId: string, busId: string | null) => void;
  onSeat: (passengerId: string, seat: number | null) => void;
}) => (
  <tr
    draggable
    onDragStart={(event) =>
      event.dataTransfer.setData(
        'text/allocation-passenger',
        passenger.reservationId
      )
    }
  >
    <td><strong>{passenger.name}</strong></td>
    <td>{passenger.campus} · {passenger.team}</td>
    <td>{passenger.preferences.join(' / ') || '지망 정보 없음'}</td>
    <td>
      <select value={passenger.busId ?? ''} onChange={(event) => onAssign(passenger.reservationId, event.target.value || null)}>
        <option value="">미배차</option>
        {buses.map((bus) => <option key={bus.id} value={bus.id}>{bus.label} · {bus.destination || '도착역 미설정'}</option>)}
      </select>
    </td>
    <td><input type="number" min="1" value={passenger.seatNumber ?? ''} disabled={!passenger.busId} onChange={(event) => onSeat(passenger.reservationId, event.target.value ? Number(event.target.value) : null)} /></td>
  </tr>
);

export default AdminAllocationWorkspacePage;
