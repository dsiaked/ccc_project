import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, RotateCcw, Search, Send, Users } from 'lucide-react';
import Header from '../../components/Header';
import { supabase } from '../../lib/supabase';
import {
  confirmCampusTransferById,
  getCampusTransferStats,
  markCampusTransferSent,
  revertCampusTransferConfirmationById,
  type CampusTransferStat,
} from '../../lib/adminService';
import styles from './AdminCampusTransferPage.module.css';

type StatusFilter = 'all' | 'pending' | 'sent' | 'confirmed';

const AdminCampusTransferPage = () => {
  const [transfers, setTransfers] = useState<CampusTransferStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [teamFilter, setTeamFilter] = useState('all');

  const loadTransferStats = async () => {
    try {
      setLoading(true);

      const data = await getCampusTransferStats();
      setTransfers(data);
    } catch (error) {
      console.error('캠퍼스 송금 현황 조회 실패:', error);
      alert(
        `캠퍼스 송금 현황을 불러오지 못했습니다: ${
          error instanceof Error ? error.message : '알 수 없는 오류'
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransferStats();
  }, []);

  const getCurrentUserId = async () => {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      throw error;
    }

    if (!user) {
      throw new Error('로그인이 필요합니다.');
    }

    return user.id;
  };

  const teamOptions = useMemo(() => {
    const teamSet = new Set<string>();

    transfers.forEach((transfer) => {
      if (transfer.team) {
        teamSet.add(transfer.team);
      }
    });

    return Array.from(teamSet).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [transfers]);

  const filteredTransfers = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();

    return transfers.filter((transfer) => {
      const matchesStatus =
        statusFilter === 'all' || transfer.status === statusFilter;

      const matchesTeam =
        teamFilter === 'all' || transfer.team === teamFilter;

      const searchTarget = [
        transfer.district,
        transfer.team,
        transfer.campus,
        transfer.campusAdminName,
        transfer.campusAdminPhone,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesKeyword = !keyword || searchTarget.includes(keyword);

      return matchesStatus && matchesTeam && matchesKeyword;
    });
  }, [transfers, searchKeyword, statusFilter, teamFilter]);

  const summary = useMemo(() => {
    const totalCampuses = transfers.length;

    const sentCampuses = transfers.filter(
      (transfer) => transfer.status === 'sent'
    ).length;

    const confirmedCampuses = transfers.filter(
      (transfer) => transfer.status === 'confirmed'
    ).length;

    const paidCampusCount = transfers.filter(
      (transfer) =>
        transfer.status === 'sent' || transfer.status === 'confirmed'
    ).length;

    const totalPeople = transfers.reduce(
      (sum, transfer) => sum + transfer.totalPeople,
      0
    );

    const paidPeople = transfers.reduce(
      (sum, transfer) => sum + transfer.paidPeople,
      0
    );

    const totalAmount = transfers.reduce(
      (sum, transfer) => sum + transfer.totalAmount,
      0
    );

    return {
      totalCampuses,
      sentCampuses,
      confirmedCampuses,
      paidCampusCount,
      totalPeople,
      paidPeople,
      totalAmount,
    };
  }, [transfers]);

  const updateTransferById = (
    transferId: string,
    updater: (transfer: CampusTransferStat) => CampusTransferStat
  ) => {
    setTransfers((prev) =>
      prev.map((item) => (item.id === transferId ? updater(item) : item))
    );
  };

  const handleMarkSent = async (transfer: CampusTransferStat) => {
    if (processingId) return;

    const ok = window.confirm(
      `${transfer.district} / ${transfer.team} / ${transfer.campus} 송금 완료로 처리하시겠습니까?`
    );

    if (!ok) return;

    try {
      setProcessingId(transfer.id);

      const userId = await getCurrentUserId();

      const result = await markCampusTransferSent({
        district: transfer.district,
        team: transfer.team,
        campus: transfer.campus,
        sentBy: userId,
        totalPeople: transfer.totalPeople,
        paidPeople: transfer.paidPeople,
        totalAmount: transfer.totalAmount,
      });

      setTransfers((prev) =>
        prev.map((item) => {
          const isSameCampus =
            item.district === transfer.district &&
            item.team === transfer.team &&
            item.campus === transfer.campus;

          if (!isSameCampus) return item;

          return {
            ...item,
            id: result?.id ?? item.id,
            status: 'sent',
            sentAt: result?.sent_at ?? new Date().toISOString(),
          };
        })
      );

      alert('캠퍼스 송금 완료 처리가 되었습니다.');
    } catch (error) {
      console.error('송금 완료 처리 중 오류:', error);
      alert(
        `송금 완료 처리 중 오류가 발생했습니다: ${
          error instanceof Error ? error.message : '알 수 없는 오류'
        }`
      );
    } finally {
      setProcessingId(null);
    }
  };

  const handleConfirmTransfer = async (transfer: CampusTransferStat) => {
    if (processingId) return;

    if (transfer.id.startsWith('empty-')) {
      alert('아직 송금 완료 처리된 행이 없습니다. 먼저 송금 완료 처리를 해주세요.');
      return;
    }

    // const ok = window.confirm(
    //   `${transfer.district} / ${transfer.team} / ${transfer.campus} 송금을 최종 확인 완료 처리하시겠습니까?`
    // );

    // if (!ok) return;

    try {
      setProcessingId(transfer.id);

      const userId = await getCurrentUserId();

      await confirmCampusTransferById({
        transferId: transfer.id,
        confirmedBy: userId,
      });

      updateTransferById(transfer.id, (item) => ({
        ...item,
        status: 'confirmed',
      }));

      // alert('캠퍼스 송금 확인이 완료되었습니다.');
    } catch (error) {
      console.error('캠퍼스 송금 확인 처리 중 오류:', error);
      alert(
        `캠퍼스 송금 확인 처리 중 오류가 발생했습니다: ${
          error instanceof Error ? error.message : '알 수 없는 오류'
        }`
      );
    } finally {
      setProcessingId(null);
    }
  };

  const handleRevertTransfer = async (transfer: CampusTransferStat) => {
    if (processingId) return;

    if (transfer.id.startsWith('empty-')) {
      alert('되돌릴 수 있는 송금 행이 없습니다.');
      return;
    }

    const ok = window.confirm(
      `${transfer.district} / ${transfer.team} / ${transfer.campus} 송금 확인을 되돌리시겠습니까?`
    );

    if (!ok) return;

    try {
      setProcessingId(transfer.id);

      await revertCampusTransferConfirmationById({
        transferId: transfer.id,
      });

      updateTransferById(transfer.id, (item) => ({
        ...item,
        status: 'sent',
      }));

      alert('캠퍼스 송금 확인이 되돌려졌습니다.');
    } catch (error) {
      console.error('캠퍼스 송금 확인 되돌리기 중 오류:', error);
      alert(
        `캠퍼스 송금 확인 되돌리기 중 오류가 발생했습니다: ${
          error instanceof Error ? error.message : '알 수 없는 오류'
        }`
      );
    } finally {
      setProcessingId(null);
    }
  };

  const handleConfirmAllSentTransfers = async () => {
    if (processingId) return;

    const targets = filteredTransfers.filter(
      (transfer) =>
        transfer.status === 'sent' && !transfer.id.startsWith('empty-')
    );

    if (targets.length === 0) {
      alert('확인 완료 처리할 송금 완료 캠퍼스가 없습니다.');
      return;
    }

    const ok = window.confirm(
      `현재 필터된 송금 완료 캠퍼스 ${targets.length}개를 전체 확인 완료 처리하시겠습니까?`
    );

    if (!ok) return;

    try {
      setProcessingId('all');

      const userId = await getCurrentUserId();

      for (const transfer of targets) {
        await confirmCampusTransferById({
          transferId: transfer.id,
          confirmedBy: userId,
        });
      }

      const targetIds = new Set(targets.map((transfer) => transfer.id));

      setTransfers((prev) =>
        prev.map((item) =>
          targetIds.has(item.id)
            ? {
                ...item,
                status: 'confirmed',
              }
            : item
        )
      );

      alert('전체 확인 완료 처리가 되었습니다.');
    } catch (error) {
      console.error('전체 확인 완료 처리 중 오류:', error);
      alert(
        `전체 확인 완료 처리 중 오류가 발생했습니다: ${
          error instanceof Error ? error.message : '알 수 없는 오류'
        }`
      );
    } finally {
      setProcessingId(null);
    }
  };

  const formatCurrency = (amount: number) => {
    return `${amount.toLocaleString()}원`;
  };

  const getStatusLabel = (status: CampusTransferStat['status']) => {
    if (status === 'confirmed') return '확인 완료';
    if (status === 'sent') return '송금 완료';
    return '확인 전';
  };

  const getStatusClassName = (status: CampusTransferStat['status']) => {
    if (status === 'confirmed') return styles.statusConfirmed;
    if (status === 'sent') return styles.statusSent;
    return styles.statusPending;
  };

  return (
    <div className={styles.page}>
      <Header />

      <main className={styles.main}>
        <section className={styles.headerSection}>
          <div>
            <p className={styles.eyebrow}>전체 관리자</p>
            <h1 className={styles.title}>캠퍼스 송금 현황</h1>
            <p className={styles.description}>
              캠퍼스별 입금 인원과 송금 예정액을 확인하고 송금 완료 및 최종 확인 처리를 관리합니다.
            </p>
          </div>

          <button
            type="button"
            className={styles.refreshButton}
            onClick={loadTransferStats}
            disabled={loading || Boolean(processingId)}
          >
            새로고침
          </button>
        </section>

        <section className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <div className={styles.summaryIcon}>
              <Users size={20} />
            </div>
            <div>
              <p className={styles.summaryLabel}>입금한 캠퍼스 / 전체 캠퍼스</p>
              <strong className={styles.summaryValue}>
                {summary.paidCampusCount} / {summary.totalCampuses}
              </strong>
            </div>
          </article>

          <article className={styles.summaryCard}>
            <div className={styles.summaryIcon}>
              <CheckCircle2 size={20} />
            </div>
            <div>
              <p className={styles.summaryLabel}>확인 완료 캠퍼스</p>
              <strong className={styles.summaryValue}>
                {summary.confirmedCampuses}
              </strong>
            </div>
          </article>

          <article className={styles.summaryCard}>
            <div className={styles.summaryIcon}>
              <Users size={20} />
            </div>
            <div>
              <p className={styles.summaryLabel}>입금 인원 / 전체 인원</p>
              <strong className={styles.summaryValue}>
                {summary.paidPeople} / {summary.totalPeople}
              </strong>
            </div>
          </article>

          <article className={styles.summaryCard}>
            <div className={styles.summaryIcon}>
              <Send size={20} />
            </div>
            <div>
              <p className={styles.summaryLabel}>송금 예정액</p>
              <strong className={styles.summaryValue}>
                {formatCurrency(summary.totalAmount)}
              </strong>
            </div>
          </article>
        </section>

        <section className={styles.filterSection}>
          <div className={styles.searchBox}>
            <Search size={18} />
            <input
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              placeholder="지구, 팀, 캠퍼스, 관리자 이름으로 검색"
            />
          </div>

          <select
            value={teamFilter}
            onChange={(event) => setTeamFilter(event.target.value)}
            className={styles.select}
          >
            <option value="all">전체 팀</option>
            {teamOptions.map((team) => (
              <option key={team} value={team}>
                {team}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as StatusFilter)
            }
            className={styles.select}
          >
            <option value="all">전체 상태</option>
            <option value="pending">확인 전</option>
            <option value="sent">송금 완료</option>
            <option value="confirmed">확인 완료</option>
          </select>

          <button
            type="button"
            className={styles.confirmAllButton}
            onClick={handleConfirmAllSentTransfers}
            disabled={loading || Boolean(processingId)}
          >
            전체 확인 완료
          </button>
        </section>

        <section className={styles.tableSection}>
          {loading ? (
            <div className={styles.emptyState}>
              캠퍼스 송금 현황을 불러오는 중입니다.
            </div>
          ) : filteredTransfers.length === 0 ? (
            <div className={styles.emptyState}>
              조회되는 캠퍼스 송금 정보가 없습니다.
            </div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>지구</th>
                    <th>팀</th>
                    <th>캠퍼스</th>
                    <th>캠퍼스 관리자</th>
                    <th>입금 인원</th>
                    <th>송금 예정액</th>
                    <th>상태</th>
                    <th>처리</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredTransfers.map((transfer) => {
                    const isProcessing =
                      processingId === transfer.id || processingId === 'all';

                    const isEmptyTransfer = transfer.id.startsWith('empty-');

                    return (
                      <tr
                        key={`${transfer.district}-${transfer.team}-${transfer.campus}`}
                        className={
                          transfer.status === 'confirmed'
                            ? styles.confirmedRow
                            : transfer.status === 'sent'
                              ? styles.sentRow
                              : undefined
                        }
                      >
                        <td>{transfer.district}</td>
                        <td>{transfer.team}</td>
                        <td className={styles.campusCell}>
                          {transfer.campus}
                        </td>
                        <td>
                          {transfer.campusAdminName ? (
                            <div className={styles.adminInfo}>
                              <span>{transfer.campusAdminName}</span>
                              {transfer.campusAdminPhone && (
                                <small>{transfer.campusAdminPhone}</small>
                              )}
                            </div>
                          ) : (
                            <span className={styles.muted}>미등록</span>
                          )}
                        </td>
                        <td>
                          {transfer.paidPeople} / {transfer.totalPeople}
                        </td>
                        <td className={styles.amountCell}>
                          {formatCurrency(transfer.totalAmount)}
                        </td>
                        <td>
                          <span
                            className={`${styles.statusBadge} ${getStatusClassName(
                              transfer.status
                            )}`}
                          >
                            {getStatusLabel(transfer.status)}
                          </span>
                        </td>
                        <td>
                          <div className={styles.actionGroup}>
                            {transfer.status === 'pending' && (
                              <button
                                type="button"
                                className={styles.sentButton}
                                onClick={() => handleMarkSent(transfer)}
                                disabled={isProcessing}
                              >
                                송금 완료
                              </button>
                            )}

                            {transfer.status === 'sent' && (
                              <button
                                type="button"
                                className={styles.confirmButton}
                                onClick={() => handleConfirmTransfer(transfer)}
                                disabled={isProcessing || isEmptyTransfer}
                              >
                                확인 완료
                              </button>
                            )}

                            {transfer.status === 'confirmed' && (
                              <button
                                type="button"
                                className={styles.revertButton}
                                onClick={() => handleRevertTransfer(transfer)}
                                disabled={isProcessing || isEmptyTransfer}
                              >
                                <RotateCcw size={14} />
                                되돌리기
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default AdminCampusTransferPage;