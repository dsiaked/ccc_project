import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, MessageSquare, RotateCcw, Search, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AdminHeader from './AdminHeader';
import { supabase } from '../../lib/supabase';
import {
  confirmCampusTransferById,
  getBusTicketPrice,
  getCampusTransferStats,
  revertCampusTransferConfirmationById,
  type CampusTransferStat,
} from '../../lib/adminService';
import styles from './AdminCampusTransferPage.module.css';

type StatusFilter =
  | 'all'
  | 'pending'
  | 'sent'
  | 'confirmed';

const AdminCampusTransferPage = () => {
  const navigate = useNavigate();
  const [transfers, setTransfers] = useState<CampusTransferStat[]>([]);
  const [ticketPrice, setTicketPrice] = useState(0);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [teamFilter, setTeamFilter] = useState('all');

  const loadTransferStats = useCallback(async () => {
    try {
      setLoading(true);

      const [data, price] = await Promise.all([
        getCampusTransferStats(),
        getBusTicketPrice(),
      ]);

      setTransfers(data);
      setTicketPrice(price);
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
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadTransferStats();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadTransferStats]);

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
        statusFilter === 'all' ||
        transfer.status === statusFilter;

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

    const confirmedCampuses = transfers.filter(
      (transfer) => transfer.status === 'confirmed'
    ).length;

    const transferReportedCount = transfers.filter(
      (transfer) =>
        transfer.status === 'sent' || transfer.status === 'confirmed'
    ).length;
    const totalAmount = transfers.reduce(
      (sum, transfer) => sum + transfer.totalAmount,
      0
    );

    const actualConfirmedAmount = transfers.reduce(
      (sum, transfer) => sum + (transfer.actualConfirmedAmount ?? 0),
      0
    );

    return {
      totalCampuses,
      confirmedCampuses,
      transferReportedCount,
      totalAmount,
      actualConfirmedAmount,
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

  const handleSaveActualAmount = async (transfer: CampusTransferStat) => {
    if (processingId) return;

    if (transfer.id.startsWith('empty-')) {
      alert('아직 캠퍼스에서 본부 송금 완료를 보고하지 않았습니다.');
      return;
    }

    const actualConfirmedAmount = transfer.paidPeople * ticketPrice;

    try {
      setProcessingId(transfer.id);

      const userId = await getCurrentUserId();

      const confirmedTransfer = await confirmCampusTransferById({
        transferId: transfer.id,
        confirmedBy: userId,
        actualConfirmedAmount,
      });

      updateTransferById(transfer.id, (item) => ({
        ...item,
        status: 'confirmed',
        actualConfirmedAmount: confirmedTransfer.actualConfirmedAmount,
      }));

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
      `${transfer.district} / ${transfer.team} / ${transfer.campus} 본부 입금 확인을 취소할까요?`
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
        actualConfirmedAmount: null,
      }));

      alert('본부 입금 확인을 취소했습니다.');
    } catch (error) {
      console.error('본부 입금 확인 취소 중 오류:', error);
      alert(
        `본부 입금 확인 취소 중 오류가 발생했습니다: ${
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
        transfer.status === 'sent' &&
        !transfer.id.startsWith('empty-')
    );

    if (targets.length === 0) {
      alert('본부 입금 확인 처리할 송금 보고 캠퍼스가 없습니다.');
      return;
    }

    const ok = window.confirm(
      `현재 필터된 송금 보고 캠퍼스 ${targets.length}개의 본부 입금을 전체 확인 처리할까요?`
    );

    if (!ok) return;

    try {
      setProcessingId('all');

      const userId = await getCurrentUserId();

      const confirmedAmountById = new Map<string, number>();

      for (const transfer of targets) {
        const confirmedTransfer = await confirmCampusTransferById({
          transferId: transfer.id,
          confirmedBy: userId,
          actualConfirmedAmount: transfer.paidPeople * ticketPrice,
        });

        confirmedAmountById.set(
          transfer.id,
          confirmedTransfer.actualConfirmedAmount
        );
      }

      const targetIds = new Set(targets.map((transfer) => transfer.id));

      setTransfers((prev) =>
        prev.map((item) =>
          targetIds.has(item.id)
            ? {
                ...item,
                status: 'confirmed',
                actualConfirmedAmount:
                  confirmedAmountById.get(item.id) ?? item.totalAmount,
              }
            : item
        )
      );
      alert('본부 입금 전체 확인 처리가 완료되었습니다.');
    } catch (error) {
      console.error('본부 입금 전체 확인 처리 중 오류:', error);
      alert(
        `본부 입금 전체 확인 처리 중 오류가 발생했습니다: ${
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

  const getStatusLabel = (transfer: CampusTransferStat) => {
    if (transfer.status === 'confirmed') return '본부 확인 완료';
    if (transfer.status === 'sent') return '송금 보고됨';

    if (
      transfer.totalPeople > 0 &&
      transfer.paidPeople === transfer.totalPeople
    ) {
      return '송금 대기';
    }

    return '입금 확인 중';
  };

  const getStatusDescription = (transfer: CampusTransferStat) => {
    if (transfer.status === 'confirmed') {
      return '본부가 실제 입금액을 확인했습니다.';
    }

    if (transfer.status === 'sent') {
      return '캠퍼스가 송금 완료를 보고했습니다.';
    }

    if (
      transfer.totalPeople > 0 &&
      transfer.paidPeople === transfer.totalPeople
    ) {
      return '전원 입금 확인 후 송금 보고를 기다립니다.';
    }

    return '캠퍼스에서 개인별 입금을 확인 중입니다.';
  };

  const getStatusClassName = (transfer: CampusTransferStat) => {
    if (transfer.status === 'confirmed') return styles.statusConfirmed;
    if (transfer.status === 'sent') return styles.statusSent;

    if (
      transfer.totalPeople > 0 &&
      transfer.paidPeople === transfer.totalPeople
    ) {
      return styles.statusReady;
    }

    return styles.statusPending;
  };

  return (
    <div className={styles.page}>
      <AdminHeader />

      <main className={styles.main}>
        <section className={styles.headerSection}>
          <div>
            <p className={styles.eyebrow}>전체 관리자</p>
            <h1 className={styles.title}>캠퍼스별 입금 및 송금 현황</h1>
            <p className={styles.description}>
              캠퍼스가 보고한 송금 예정액과 본부에서 확인한 실제 입금액을
              비교해 최종 입금 확인을 처리합니다.
            </p>
          </div>

          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.refreshButton}
              onClick={() => navigate('/admin/communications')}
            >
              <MessageSquare size={17} />
              문의 게시판
            </button>

            <button
              type="button"
              className={styles.refreshButton}
              onClick={loadTransferStats}
              disabled={loading || Boolean(processingId)}
            >
              새로고침
            </button>
          </div>
        </section>

        <section className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <div className={styles.summaryIcon}>
              <Send size={20} />
            </div>
            <div>
              <p className={styles.summaryLabel}>실제 입금액 / 송금 예정액</p>
              <strong className={styles.summaryValue}>
                {formatCurrency(summary.actualConfirmedAmount)} /{' '}
                {formatCurrency(summary.totalAmount)}
              </strong>
            </div>
          </article>

          <article className={styles.summaryCard}>
            <div className={styles.summaryIcon}>
              <CheckCircle2 size={20} />
            </div>
            <div>
              <p className={styles.summaryLabel}>송금 보고 / 확인 완료 / 전체 캠퍼스</p>
              <strong className={styles.summaryValue}>
                {summary.transferReportedCount} / {summary.confirmedCampuses} /{' '}
                {summary.totalCampuses}
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
            <option value="pending">입금 확인/송금 대기</option>
            <option value="sent">송금 보고됨</option>
            <option value="confirmed">본부 확인 완료</option>
          </select>

          <button
            type="button"
            className={styles.confirmAllButton}
            onClick={handleConfirmAllSentTransfers}
            disabled={loading || Boolean(processingId)}
          >
            보고 건 전체 확인
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
                    <th>캠퍼스 회계 순장님</th>
                    <th>입금 확인액 / 송금 예정액</th>
                    <th>상태</th>
                    <th>처리</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredTransfers.map((transfer) => {
                    const isProcessing =
                      processingId === transfer.id || processingId === 'all';

                    const isEmptyTransfer = transfer.id.startsWith('empty-');
                    const canConfirmTransfer =
                      !isEmptyTransfer && transfer.status === 'sent';
                    const checkedPaymentAmount =
                      transfer.paidPeople * ticketPrice;

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
                        <td className={styles.amountCell}>
                          <div className={styles.amountStack}>
                            <div className={styles.amountInputRow}>
                              <strong>{formatCurrency(checkedPaymentAmount)}</strong>
                              <span>/ {formatCurrency(transfer.totalAmount)}</span>
                            </div>
                            <small>
                              {transfer.paidPeople} / {transfer.totalPeople}명 입금 확인
                            </small>
                            {transfer.reportedTotalAmount > 0 && (
                              <small>
                                보고 {formatCurrency(transfer.reportedTotalAmount)}
                              </small>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className={styles.statusStack}>
                            <span
                              className={`${styles.statusBadge} ${getStatusClassName(
                                transfer
                              )}`}
                            >
                              {getStatusLabel(transfer)}
                            </span>
                            <span className={styles.statusDescription}>
                              {getStatusDescription(transfer)}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className={styles.actionGroup}>
                            {canConfirmTransfer && (
                              <button
                                type="button"
                                className={styles.confirmButton}
                                onClick={() => handleSaveActualAmount(transfer)}
                                disabled={isProcessing}
                              >
                                입금 확인
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
                                확인 취소
                              </button>
                            )}

                            {transfer.status === 'pending' && (
                              <span className={styles.waitingAction}>
                                캠퍼스 보고 대기
                              </span>
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
