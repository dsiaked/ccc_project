import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BusFront,
  ChevronDown,
  ChevronUp,
  Download,
  Landmark,
  Megaphone,
  MessageSquare,
  RotateCcw,
  Save,
} from 'lucide-react';
import AdminHeader from './AdminHeader';
import { useAdminAuth } from '../../components/AdminAuthProvider';
import { formatBusLabel } from '../../utils/busLabel';
import { supabase } from '../../lib/supabase';
import {
  getAdminRole,
  getBusTicketPrice,
  getCampusTransferByScope,
  getCampusTransferStats,
  getCampusScopesForAdmin,
  getGlobalCampusNotices,
  getReservationsWithPaymentByTeamCampus,
  cancelCampusTransferReport,
  createOrUpdatePaymentStatus,
  markCampusTransferSent,
  type CampusRequest,
  type CampusTransferStat,
} from '../../lib/adminService';
import {
  getUnreadCampusNotices,
  markCampusNoticesRead,
} from '../../lib/adminNoticeReadState';
import { getDistrictTransferAccountNumber } from '../../lib/districtTransferAccountService';
import {
  getCampusPaymentAccount,
  updateCampusPaymentAccount,
  type CampusPaymentAccount,
} from '../../lib/campusPaymentAccountService';
import styles from './AdminCampusPage.module.css';

interface PaymentInfo {
  id: string;
  amount: number;
  status: 'pending' | 'completed' | 'refunded';
  paid_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface StationPreference {
  rank: 1 | 2;
  station: {
    id: string;
    name: string;
    line?: string;
    address?: string;
  };
}

interface ReservationWithPayment {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  district?: string;
  team: string;
  campus: string;
  station_preferences: StationPreference[];
  status: string;
  confirmed_ticket: {
    busNumber?: string | null;
    seatNumber?: string | null;
    departureTime?: string | null;
    boardingPlace?: string | null;
    dropoffStation?: string | null;
  } | null;
  created_at: string;
  updated_at: string;
  payments: PaymentInfo[] | null;
}

interface CampusAdminScope {
  campusId: string;
  district: string;
  team: string;
  campus: string;
}

const getScopeKey = (scope: CampusAdminScope) =>
  [scope.district, scope.team, scope.campus].join('\0');

const GLOBAL_ADMIN_CAMPUS_SCOPE_KEY = 'ccc-bus-global-admin-campus-scope';

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;

  if (error && typeof error === 'object') {
    const errorRecord = error as Record<string, unknown>;

    return String(
      errorRecord.message ||
        errorRecord.details ||
        errorRecord.hint ||
        '알 수 없는 오류가 발생했습니다.'
    );
  }

  return '알 수 없는 오류가 발생했습니다.';
};

const formatDateTime = (value: string | null) => {
  if (!value) return '-';

  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

const getStationName = (
  reservation: ReservationWithPayment,
  rank: StationPreference['rank']
) =>
  reservation.station_preferences?.find(
    (preference) => preference.rank === rank
  )?.station?.name || '-';

const getPaymentStatusLabel = (payment: PaymentInfo | null) => {
  if (payment?.status === 'completed') return '입금 확인';
  if (payment?.status === 'refunded') return '환불';

  return '미입금';
};

const getConfirmedTicketLines = (
  reservation: ReservationWithPayment
) => {
  const ticket = reservation.confirmed_ticket;

  if (!ticket) return ['미확정'];

  return [
    `확정: ${ticket.dropoffStation || '-'} ${formatBusLabel(ticket.busNumber) || '-'} ${
      ticket.seatNumber ? `${ticket.seatNumber}번 좌석` : '좌석 미지정'
    }`,
  ];
};

const fitCanvasText = (
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number
) => {
  if (context.measureText(value).width <= maxWidth) return value;

  let fitted = value;

  while (
    fitted.length > 0 &&
    context.measureText(`${fitted}…`).width > maxWidth
  ) {
    fitted = fitted.slice(0, -1);
  }

  return `${fitted}…`;
};

const findCampusTransfer = (
  transferStats: CampusTransferStat[],
  scope: CampusAdminScope
) => {
  return (
    transferStats.find(
      (transfer) =>
        transfer.district.trim() === scope.district.trim() &&
        transfer.team.trim() === scope.team.trim() &&
        transfer.campus.trim() === scope.campus.trim()
    ) ?? null
  );
};

const CampusAdminPage = () => {
  const navigate = useNavigate();
  const { adminRole: activeAdminRole } = useAdminAuth();

  const [reservations, setReservations] = useState<ReservationWithPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [transferSending, setTransferSending] = useState(false);
  const [savingPaymentAccount, setSavingPaymentAccount] = useState(false);
  const [savingApplicantImage, setSavingApplicantImage] = useState(false);
  const [isApplicantListOpen, setIsApplicantListOpen] = useState(true);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  const [adminScope, setAdminScope] = useState<CampusAdminScope | null>(null);
  const [availableScopes, setAvailableScopes] = useState<CampusAdminScope[]>([]);
  const [selectedScopeKey, setSelectedScopeKey] = useState(() =>
    typeof window === 'undefined'
      ? ''
      : window.localStorage.getItem(GLOBAL_ADMIN_CAMPUS_SCOPE_KEY) ?? ''
  );
  const [campusTransfer, setCampusTransfer] =
    useState<CampusTransferStat | null>(null);
  const [campusNotices, setCampusNotices] = useState<CampusRequest[]>([]);
  const [campus, setCampus] = useState('');
  const [ticketPrice, setTicketPrice] = useState(0);
  const [districtTransferAccountNumber, setDistrictTransferAccountNumber] =
    useState('');
  const [paymentAccount, setPaymentAccount] =
    useState<CampusPaymentAccount | null>(null);
  const [paymentAccountMessage, setPaymentAccountMessage] = useState<
    string | null
  >(null);

  const getPayment = (reservation: ReservationWithPayment) => {
    return reservation.payments?.[0] || null;
  };

  const loadCampusTransferStatus = useCallback(async (scope: CampusAdminScope) => {
    try {
      const transferStats = await getCampusTransferStats();
      const transferFromStats = findCampusTransfer(transferStats, scope);

      if (
        transferFromStats &&
        (transferFromStats.status === 'sent' ||
          transferFromStats.status === 'confirmed')
      ) {
        return transferFromStats;
      }

      return await getCampusTransferByScope(scope);
    } catch (error) {
      console.warn('캠퍼스 송금 보고 상태 조회 실패:', error);

      try {
        return await getCampusTransferByScope(scope);
      } catch (fallbackError) {
        console.warn('캠퍼스 송금 보고 직접 조회 실패:', fallbackError);
        return null;
      }
    }
  }, []);

  const refreshReservations = async (targetCampus: string, targetTeam?: string) => {
    const data = await getReservationsWithPaymentByTeamCampus(
      targetCampus,
      targetTeam
    );

    setReservations(data as unknown as ReservationWithPayment[]);
  };

  useEffect(() => {
    let isMounted = true;

    const checkAndLoadData = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          navigate('/login');
          return;
        }

        const adminRole = await getAdminRole(session.user.id);

        if (
          !adminRole ||
          (adminRole.role !== 'campus_admin' &&
            adminRole.role !== 'global_admin')
        ) {
          if (isMounted) {
            alert('캠퍼스 회계 순장님만 접근할 수 있습니다.');
            navigate('/');
          }
          return;
        }

        let nextScope: CampusAdminScope | null = null;

        if (adminRole.role === 'global_admin') {
          const scopes = await getCampusScopesForAdmin();
          nextScope =
            scopes.find((scope) => getScopeKey(scope) === selectedScopeKey) ??
            scopes[0] ??
            null;

          if (isMounted) {
            setAvailableScopes(scopes);
            setSelectedScopeKey(nextScope ? getScopeKey(nextScope) : '');
          }
        } else if (adminRole.district && adminRole.team && adminRole.campus) {
          if (!adminRole.campus_id) {
            throw new Error('캠퍼스 관리자에게 연결된 캠퍼스 ID가 없습니다.');
          }

          nextScope = {
            campusId: adminRole.campus_id,
            district: adminRole.district,
            team: adminRole.team,
            campus: adminRole.campus,
          };
        }

        if (!nextScope) {
          if (isMounted) {
            setAdminScope(null);
            setReservations([]);
            setCampusTransfer(null);
            setCampusNotices([]);
          }
          return;
        }

        const [
          reservationsResult,
          priceResult,
          transferStatusResult,
          noticesResult,
          transferAccountNumberResult,
          paymentAccountResult,
        ] = await Promise.allSettled([
          getReservationsWithPaymentByTeamCampus(
            nextScope.campus,
            nextScope.team
          ),
          getBusTicketPrice(),
          loadCampusTransferStatus(nextScope),
          adminRole.role === 'campus_admin'
            ? getGlobalCampusNotices().then((result) => {
                if (result.error) throw result.error;

                return getUnreadCampusNotices(
                  session.user.id,
                  result.data ?? []
                );
              })
            : Promise.resolve([]),
          getDistrictTransferAccountNumber(),
          getCampusPaymentAccount(nextScope.campusId),
        ]);

        if (reservationsResult.status === 'rejected') {
          throw reservationsResult.reason;
        }

        if (isMounted) {
          setAdminScope(nextScope);

          setCampus(nextScope.campus);
          setReservations(
            reservationsResult.value as unknown as ReservationWithPayment[]
          );

          if (priceResult.status === 'fulfilled') {
            setTicketPrice(priceResult.value);
          } else {
            console.warn('Failed to load bus ticket price:', priceResult.reason);
          }

          if (transferStatusResult.status === 'fulfilled') {
            setCampusTransfer(transferStatusResult.value);
          } else {
            console.warn(
              'Failed to load campus transfer status:',
              transferStatusResult.reason
            );
          }

          if (noticesResult.status === 'fulfilled') {
            setCampusNotices(noticesResult.value);
          } else {
            console.warn('Failed to load campus notices:', noticesResult.reason);
          }

          if (transferAccountNumberResult.status === 'fulfilled') {
            setDistrictTransferAccountNumber(transferAccountNumberResult.value);
          } else {
            console.warn(
              'Failed to load district transfer account number:',
              transferAccountNumberResult.reason
            );
          }

          if (paymentAccountResult.status === 'fulfilled') {
            setPaymentAccount(
              paymentAccountResult.value ?? {
                campusId: nextScope.campusId,
                bankName: '',
                accountNumber: '',
                accountHolder: '',
              }
            );
          } else {
            console.warn(
              'Failed to load campus payment account:',
              paymentAccountResult.reason
            );
          }
        }
      } catch (error) {
        console.error('Failed to load reservations:', error);

        if (isMounted) {
          alert('신청 정보를 불러올 수 없습니다. 다시 시도해주세요.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    checkAndLoadData();

    return () => {
      isMounted = false;
    };
  }, [
    activeAdminRole?.id,
    loadCampusTransferStatus,
    navigate,
    selectedScopeKey,
  ]);

  const stats = useMemo(() => {
    const completed = reservations.filter((reservation) => {
      const payment = getPayment(reservation);
      return payment?.status === 'completed';
    }).length;

    const pending = reservations.filter((reservation) => {
      const payment = getPayment(reservation);
      return !payment || payment.status === 'pending';
    }).length;

    const refunded = reservations.filter((reservation) => {
      const payment = getPayment(reservation);
      return payment?.status === 'refunded';
    }).length;

    return {
      total: reservations.length,
      completed,
      pending,
      refunded,
    };
  }, [reservations]);

  const checkableReservations = useMemo(() => {
    return reservations.filter((reservation) => {
      const payment = getPayment(reservation);
      return payment?.status !== 'refunded';
    });
  }, [reservations]);

  const allChecked =
    checkableReservations.length > 0 &&
    checkableReservations.every((reservation) => {
      const payment = getPayment(reservation);
      return payment?.status === 'completed';
    });

  const totalPeople = stats.total;
  const paidPeople = stats.completed;
  const paymentRate =
    totalPeople > 0 ? Math.round((paidPeople / totalPeople) * 100) : 0;

  const totalAmount =
    reservations.filter((reservation) => reservation.status !== 'cancelled')
      .length * ticketPrice;

  const handleSaveApplicantListImage = async () => {
    if (reservations.length === 0 || savingApplicantImage) return;

    setSavingApplicantImage(true);

    try {
      await document.fonts.ready;

      const columns = [
        { label: '번호', width: 70 },
        { label: '이름', width: 140 },
        { label: '1지망', width: 150 },
        { label: '2지망', width: 150 },
        { label: '배차 확정', width: 350 },
        { label: '입금 상태', width: 130 },
        { label: '신청일', width: 140 },
      ];
      const margin = 48;
      const titleHeight = 150;
      const headerHeight = 54;
      const rowHeight = 54;
      const footerHeight = 54;
      const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
      const logicalWidth = tableWidth + margin * 2;
      const logicalHeight =
        titleHeight +
        headerHeight +
        reservations.length * rowHeight +
        footerHeight;
      const scale = Math.min(2, 16000 / Math.max(logicalWidth, logicalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(logicalWidth * scale);
      canvas.height = Math.ceil(logicalHeight * scale);

      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('이미지를 생성할 수 없습니다.');
      }

      context.scale(scale, scale);
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, logicalWidth, logicalHeight);

      context.fillStyle = '#111827';
      context.font =
        '800 28px "Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif';
      context.fillText(
        `${
          adminScope
            ? `${adminScope.district} ${adminScope.team} ${adminScope.campus}`
            : campus
        } 버스 신청자 목록`,
        margin,
        56
      );

      context.fillStyle = '#475569';
      context.font =
        '600 15px "Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif';
      context.fillText(
        `전체 ${stats.total}명 · 입금 확인 ${stats.completed}명 · 미입금 ${stats.pending}명`,
        margin,
        88
      );
      context.fillText(
        `저장 시각 ${formatDateTime(new Date().toISOString())}`,
        margin,
        116
      );

      let x = margin;
      const tableTop = titleHeight;

      context.fillStyle = '#f1f5f9';
      context.fillRect(margin, tableTop, tableWidth, headerHeight);
      context.strokeStyle = '#cbd5e1';
      context.lineWidth = 1;
      context.font =
        '800 14px "Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif';
      context.textBaseline = 'middle';

      columns.forEach((column) => {
        context.strokeRect(x, tableTop, column.width, headerHeight);
        context.fillStyle = '#334155';
        context.fillText(column.label, x + 12, tableTop + headerHeight / 2);
        x += column.width;
      });

      reservations.forEach((reservation, index) => {
        const payment = getPayment(reservation);
        const rowTop = tableTop + headerHeight + index * rowHeight;
        const values = [
          String(index + 1),
          reservation.name,
          getStationName(reservation, 1),
          getStationName(reservation, 2),
          getConfirmedTicketLines(reservation),
          getPaymentStatusLabel(payment),
          new Date(reservation.created_at).toLocaleDateString('ko-KR'),
        ];

        context.fillStyle =
          payment?.status === 'completed'
            ? '#f0fdf4'
            : index % 2 === 0
              ? '#ffffff'
              : '#f8fafc';
        context.fillRect(margin, rowTop, tableWidth, rowHeight);

        x = margin;
        context.font =
          '600 13px "Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif';

        columns.forEach((column, columnIndex) => {
          const value = values[columnIndex];

          if (Array.isArray(value) && value[0] !== '미확정') {
            context.fillStyle = '#f8fbff';
            context.fillRect(x, rowTop, column.width, rowHeight);
          }

          context.strokeStyle = '#e2e8f0';
          context.strokeRect(x, rowTop, column.width, rowHeight);
          context.fillStyle =
            column.label === '입금 상태' && payment?.status === 'completed'
              ? '#166534'
              : '#334155';

          if (Array.isArray(value)) {
            const lineHeight = 18;
            const linesHeight = value.length * lineHeight;
            const firstLineY =
              rowTop + (rowHeight - linesHeight) / 2 + lineHeight / 2;

            value.forEach((line, lineIndex) => {
              context.font =
                lineIndex === 0
                  ? '800 13px "Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif'
                  : '600 11px "Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif';
              context.fillStyle = lineIndex === 0 ? '#1d4ed8' : '#64748b';
              context.fillText(
                fitCanvasText(context, line, column.width - 24),
                x + 12,
                firstLineY + lineIndex * lineHeight
              );
            });
          } else {
            context.font =
              '600 13px "Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif';
            context.fillText(
              fitCanvasText(context, value, column.width - 24),
              x + 12,
              rowTop + rowHeight / 2
            );
          }
          x += column.width;
        });
      });

      context.fillStyle = '#64748b';
      context.font =
        '500 12px "Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif';
      context.fillText(
        '개인정보가 포함된 이미지입니다. 필요한 범위에서만 사용해 주세요.',
        margin,
        logicalHeight - 22
      );

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error('이미지 파일을 생성할 수 없습니다.'));
        }, 'image/png');
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const date = new Date();
      const dateText = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
      ].join('-');

      link.href = url;
      link.download = `${campus || '캠퍼스'}_버스_신청자_목록_${dateText}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      console.error('신청자 목록 이미지 저장 실패:', error);
      alert(`신청자 목록 이미지 저장에 실패했습니다: ${getErrorMessage(error)}`);
    } finally {
      setSavingApplicantImage(false);
    }
  };

  const canSendCampusTransfer =
    totalPeople > 0 && paidPeople === totalPeople && !transferSending;
  const hasReportedTransfer =
    campusTransfer?.status === 'sent' || campusTransfer?.status === 'confirmed';
  const isHeadOfficeConfirmed =
    campusTransfer?.status === 'confirmed' &&
    !campusTransfer.hasAdditionalSettlement;
  const needsAdditionalTransfer = Boolean(
    campusTransfer?.hasAdditionalSettlement
  );
  const isPaymentCheckLocked = hasReportedTransfer && !needsAdditionalTransfer;
  const canReportCampusTransfer =
    canSendCampusTransfer && (!hasReportedTransfer || needsAdditionalTransfer);
  const reportButtonLabel = campusTransfer?.hasAdditionalSettlement
    ? '추가 송금 완료'
    : isHeadOfficeConfirmed
      ? '본부 확인 완료'
      : hasReportedTransfer
        ? '보고 완료'
        : '송금 완료';
  const transferStatusTitle = campusTransfer?.hasAdditionalSettlement
    ? '추가 정산 필요'
    : isHeadOfficeConfirmed
      ? '본부 확인 완료'
      : hasReportedTransfer
        ? '송금 보고 완료'
        : '송금 보고 전';
  const transferStatusDescription = campusTransfer?.hasAdditionalSettlement
    ? `보고 후 현재 송금 예정액이 ${campusTransfer.additionalAmountDue.toLocaleString()}원 증가했습니다. 추가 송금 후 다시 보고해주세요.`
    : isHeadOfficeConfirmed
      ? `본부에서 ${(
          campusTransfer.actualConfirmedAmount ??
          campusTransfer.reportedTotalAmount
        ).toLocaleString()}원 입금을 확인했습니다.`
      : hasReportedTransfer
        ? `보고 금액 ${campusTransfer.reportedTotalAmount.toLocaleString()}원 · 전체 관리자 확인 대기 중`
        : '전원 입금 확인 후 서울지구 계좌로 송금하고, 송금 완료 버튼을 눌러주세요.';

  const handleDirectPaymentCheck = async (
    reservation: ReservationWithPayment,
    checked: boolean
  ) => {
    if (isPaymentCheckLocked) {
      alert('송금 완료 보고 이후에는 입금 상태를 수정할 수 없습니다.');
      return;
    }

    const payment = getPayment(reservation);
    const nextStatus = checked ? 'completed' : 'pending';

    setVerifying(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('로그인이 필요합니다.');
      }

      await createOrUpdatePaymentStatus({
        paymentId: payment?.id ?? null,
        reservationId: reservation.id,
        userId: reservation.user_id,
        amount: ticketPrice,
        status: nextStatus,
        verifiedBy: checked ? session.user.id : undefined,
      });

      await refreshReservations(campus, adminScope?.team);
    } catch (error) {
      console.error('입금 상태 변경 실패:', error);

      alert(`입금 상태 변경에 실패했습니다: ${getErrorMessage(error)}`);
    } finally {
      setVerifying(false);
    }
  };

  const handleBulkPaymentCheck = async (checked: boolean) => {
    if (isPaymentCheckLocked) {
      alert('송금 완료 보고 이후에는 입금 상태를 수정할 수 없습니다.');
      return;
    }

    const nextStatus = checked ? 'completed' : 'pending';

    if (checkableReservations.length === 0) {
      return;
    }

    setVerifying(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('로그인이 필요합니다.');
      }

      await Promise.all(
        checkableReservations.map((reservation) => {
          const payment = getPayment(reservation);

          return createOrUpdatePaymentStatus({
            paymentId: payment?.id ?? null,
            reservationId: reservation.id,
            userId: reservation.user_id,
            amount: ticketPrice,
            status: nextStatus,
            verifiedBy: checked ? session.user.id : undefined,
          });
        })
      );

      await refreshReservations(campus, adminScope?.team);
    } catch (error) {
      console.error('전체 입금 상태 변경 실패:', error);

      alert(`전체 입금 상태 변경에 실패했습니다: ${getErrorMessage(error)}`);
    } finally {
      setVerifying(false);
    }
  };

  const handleMarkCampusTransferSent = async () => {
    if (!adminScope) {
      alert('관리자 정보를 찾을 수 없습니다.');
      return;
    }

    if (paidPeople !== totalPeople) {
      alert('아직 모든 인원의 입금이 확인되지 않았습니다.');
      return;
    }

    const ok = window.confirm(
      `${adminScope.campus} 캠퍼스 전체 ${paidPeople}명의 입금을 확인했고, 본부에 ${totalAmount.toLocaleString()}원을 송금했다고 보고할까요?\n\n입금자명은 공백 없이 캠퍼스명 뒤에 담당자명을 입력해주세요. (예: ${adminScope.campus}홍길동)\n\n송금 완료 버튼을 누른 이후에는 캠퍼스 회계 순장님 화면에서 입금 상태와 송금 보고 내용을 수정할 수 없습니다.`
    );

    if (!ok) return;

    setTransferSending(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        navigate('/admin/login');
        return;
      }

      const reportedTransfer = await markCampusTransferSent({
        district: adminScope.district,
        team: adminScope.team,
        campus: adminScope.campus,
        sentBy: session.user.id,
        totalPeople,
        paidPeople,
        totalAmount,
      });

      setCampusTransfer(reportedTransfer);
      await refreshReservations(adminScope.campus, adminScope.team);

      alert('본부 송금 완료 보고를 남겼습니다.');
    } catch (error) {
      console.error('본부 송금 완료 보고 실패:', error);

      alert(
        `본부 송금 완료 보고 중 오류가 발생했습니다: ${getErrorMessage(error)}`
      );
    } finally {
      setTransferSending(false);
    }
  };

  const handleCancelCampusTransferReport = async () => {
    if (!campusTransfer || campusTransfer.status !== 'sent') {
      alert('취소할 송금 보고 완료 내역이 없습니다.');
      return;
    }

    const ok = window.confirm(
      '송금 보고 완료를 취소할까요?\n\n취소 후 입금 상태를 다시 수정할 수 있으며, 확인이 끝나면 송금 완료를 다시 보고해야 합니다.'
    );

    if (!ok) return;

    setTransferSending(true);

    try {
      await cancelCampusTransferReport({ transferId: campusTransfer.id });

      setCampusTransfer(null);

      if (adminScope) {
        await refreshReservations(adminScope.campus, adminScope.team);
      }

      alert('송금 보고 완료를 취소했습니다.');
    } catch (error) {
      console.error('송금 보고 완료 취소 실패:', error);
      alert(`송금 보고 완료 취소 중 오류가 발생했습니다: ${getErrorMessage(error)}`);
    } finally {
      setTransferSending(false);
    }
  };

  const handleOpenCampusRequests = () => {
    if (adminScope && campusNotices.length > 0) {
      void supabase.auth.getSession().then(({ data }) => {
        const userId = data.session?.user.id;

        if (userId) {
          void markCampusNoticesRead(
            userId,
            campusNotices.map((notice) => notice.id)
          ).catch((error) => {
            console.error('Failed to mark campus notices read:', error);
          });
        }
      });
    }

    navigate('/admin/communications');
  };

  const updatePaymentAccountDraft = (
    field: 'bankName' | 'accountNumber' | 'accountHolder',
    value: string
  ) => {
    if (!adminScope) return;

    setPaymentAccountMessage(null);
    setPaymentAccount((current) => ({
      campusId: adminScope.campusId,
      bankName: current?.bankName ?? '',
      accountNumber: current?.accountNumber ?? '',
      accountHolder: current?.accountHolder ?? '',
      [field]: value,
    }));
  };

  const handleSavePaymentAccount = async () => {
    if (
      !paymentAccount?.bankName.trim() ||
      !paymentAccount.accountNumber.trim() ||
      !paymentAccount.accountHolder.trim()
    ) {
      setPaymentAccountMessage('은행, 계좌번호, 예금주를 모두 입력해주세요.');
      return;
    }

    setSavingPaymentAccount(true);
    setPaymentAccountMessage(null);

    try {
      const saved = await updateCampusPaymentAccount(paymentAccount);
      setPaymentAccount(saved);
      setPaymentAccountMessage('입금 계좌를 저장했습니다.');
    } catch (error) {
      setPaymentAccountMessage(
        `입금 계좌 저장에 실패했습니다: ${getErrorMessage(error)}`
      );
    } finally {
      setSavingPaymentAccount(false);
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
        <div className={styles.header}>
          {activeAdminRole?.role === 'global_admin' && (
            <label className={styles.scopeSelector}>
              <span>관리할 캠퍼스</span>
              <select
                value={selectedScopeKey}
                onChange={(event) => {
                  const nextScopeKey = event.target.value;
                  setSelectedScopeKey(nextScopeKey);
                  window.localStorage.setItem(
                    GLOBAL_ADMIN_CAMPUS_SCOPE_KEY,
                    nextScopeKey
                  );
                }}
                disabled={availableScopes.length === 0}
              >
                {availableScopes.length === 0 ? (
                  <option value="">관리 가능한 캠퍼스가 없습니다</option>
                ) : (
                  availableScopes.map((scope) => (
                    <option key={getScopeKey(scope)} value={getScopeKey(scope)}>
                      {scope.district} / {scope.team} / {scope.campus}
                    </option>
                  ))
                )}
              </select>
            </label>
          )}
          {adminScope && (
            <div className={styles.adminScopeBadge}>
              {adminScope.district} · {adminScope.team} · {adminScope.campus}
            </div>
          )}
          <h1>캠퍼스 입금 관리</h1>
          <p>
            버스 신청자의 입금 상태를 확인하고 본부 송금 절차를 진행합니다.
          </p>
        </div>

        <section className={styles.signupGuideAlert}>
          <AlertTriangle size={20} aria-hidden="true" />
          <p>
            서울지구 소속이 아니더라도 본인 캠퍼스와 함께 온 친구들은 본인
            캠퍼스로 회원가입하도록 안내해주세요.
          </p>
        </section>

        {campusNotices.length > 0 && (
          <section className={styles.noticeAlert}>
            <div className={styles.noticeAlertIcon}>
              <Megaphone size={20} />
            </div>
            <div className={styles.noticeAlertContent}>
              <div className={styles.noticeAlertHeader}>
                <strong>본부 공지 {campusNotices.length}건</strong>
                <span>
                  최근 공지 {formatDateTime(campusNotices[0]?.createdAt ?? null)}
                </span>
              </div>
              <p>{campusNotices[0]?.title}</p>
            </div>
            <button
              type="button"
              className={styles.noticeAlertButton}
              onClick={handleOpenCampusRequests}
            >
              공지 확인
            </button>
          </section>
        )}

        <section className={styles.paymentAccountPanel}>
          <div className={styles.paymentAccountHeading}>
            <div className={styles.paymentAccountIcon}>
              <Landmark size={20} />
            </div>
            <div>
              <h2>회계 순장님 입금 계좌</h2>
              <p>신청자가 버스비를 입금할 현재 캠퍼스 계좌입니다.</p>
            </div>
          </div>
          <div className={styles.paymentAccountFields}>
            <label>
              <span>은행</span>
              <input
                value={paymentAccount?.bankName ?? ''}
                onChange={(event) =>
                  updatePaymentAccountDraft('bankName', event.target.value)
                }
                placeholder="예: 국민은행"
              />
            </label>
            <label>
              <span>계좌번호</span>
              <input
                value={paymentAccount?.accountNumber ?? ''}
                onChange={(event) =>
                  updatePaymentAccountDraft('accountNumber', event.target.value)
                }
                placeholder="계좌번호"
              />
            </label>
            <label>
              <span>예금주</span>
              <input
                value={paymentAccount?.accountHolder ?? ''}
                onChange={(event) =>
                  updatePaymentAccountDraft('accountHolder', event.target.value)
                }
                placeholder="예금주"
              />
            </label>
            <button
              type="button"
              onClick={() => void handleSavePaymentAccount()}
              disabled={savingPaymentAccount || !adminScope}
            >
              <Save size={16} />
              {savingPaymentAccount ? '저장 중' : '계좌 저장'}
            </button>
          </div>
          {paymentAccountMessage && (
            <p className={styles.paymentAccountMessage} role="status">
              {paymentAccountMessage}
            </p>
          )}
        </section>

        <section className={styles.guidePanel}>
          <button
            type="button"
            className={styles.guideToggle}
            onClick={() => setIsGuideOpen((current) => !current)}
            aria-expanded={isGuideOpen}
            aria-controls="campus-payment-guide"
          >
            <span>
              <strong>입금 확인 및 송금 진행 방법</strong>
              <small>처음 진행할 때 확인해주세요.</small>
            </span>
            {isGuideOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {isGuideOpen && (
            <div id="campus-payment-guide" className={styles.guideSection}>
              <div>
                <strong>사용 순서</strong>
                <ol className={styles.guideList}>
                  <li>신청자 전원이 본인 계좌로 입금했는지 확인합니다.</li>
                  <li>
                    전원 입금이 확인되면 서울지구 계좌로 송금합니다.
                    <span className={styles.guideDepositName}>
                      입금자명: 공백 없이 캠퍼스명 뒤에 담당자명 (예:{' '}
                      {adminScope?.campus || '서울캠'}홍길동)
                    </span>
                  </li>
                  <li>
                    송금을 완료했다면 아래의 &quot;송금 완료&quot; 버튼을
                    눌러주세요.
                    <span className={styles.guideWarning}>
                      버튼을 누른 이후에는 입금 상태와 송금 보고 내용을 수정할 수
                      없습니다.
                    </span>
                  </li>
                </ol>
              </div>
              <div>
                <strong>송금 이후</strong>
                <p>
                  전체 관리자가 본부 입금 확인을 진행합니다. 추가 신청이나 추가
                  입금이 생기면 추가 송금 보고가 필요합니다.
                </p>
              </div>
            </div>
          )}
        </section>

        <div className={styles.statsBar}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>전체 신청</span>
            <span className={styles.statValue}>{stats.total}</span>
          </div>

          <div className={`${styles.stat} ${styles.statCompleted}`}>
            <span className={styles.statLabel}>입금 확인</span>
            <span className={styles.statValue}>{stats.completed}</span>
          </div>

          <div className={styles.stat}>
            <span className={styles.statLabel}>송금 예정액</span>
            <span className={styles.statValue}>
              {totalAmount.toLocaleString()}원
            </span>
          </div>
        </div>

        <div className={styles.listToolbar}>
          <div>
            <h2 className={styles.listTitle}>버스 신청자 목록</h2>
            <p className={styles.listMeta}>
              총 {reservations.length}명 · 현재 목록 전체를 PNG 이미지로 저장할
              수 있습니다.
            </p>
          </div>

          <div className={styles.listActions}>
            <button
              type="button"
              className={styles.listToggleButton}
              onClick={() => setIsApplicantListOpen((current) => !current)}
              aria-expanded={isApplicantListOpen}
              aria-controls="campus-applicant-list"
            >
              {isApplicantListOpen ? (
                <ChevronUp size={18} />
              ) : (
                <ChevronDown size={18} />
              )}
              {isApplicantListOpen ? '접기' : '펼치기'}
            </button>

            <button
              type="button"
              className={styles.imageSaveButton}
              onClick={handleSaveApplicantListImage}
              disabled={reservations.length === 0 || savingApplicantImage}
            >
              <Download size={18} />
              {savingApplicantImage
                ? '이미지 생성 중...'
                : '버스 신청자 목록 이미지 저장'}
            </button>
          </div>
        </div>

        <div className={styles.paymentRatioCard}>
          <div className={styles.paymentRatioHeader}>
            <div>
              <span className={styles.paymentRatioLabel}>입금 진행률</span>
              <strong>
                {stats.completed}명 확인 · {stats.pending}명 미입금
              </strong>
            </div>
            <span className={styles.paymentRatioPercent}>{paymentRate}%</span>
          </div>
          <div
            className={styles.paymentRatioBar}
            role="progressbar"
            aria-label="입금 확인 진행률"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={paymentRate}
          >
            <div
              className={styles.paymentRatioPaid}
              style={{ width: `${paymentRate}%` }}
            />
          </div>
        </div>

        {isApplicantListOpen && (
        <div
          id="campus-applicant-list"
          className={styles.tableContainer}
        >
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.checkCol}>
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={(e) => handleBulkPaymentCheck(e.target.checked)}
                    disabled={
                      verifying ||
                      checkableReservations.length === 0 ||
                      isPaymentCheckLocked
                    }
                    title={
                      isPaymentCheckLocked
                        ? '송금 완료 보고 이후에는 수정할 수 없습니다.'
                        : '전체 입금 확인'
                    }
                  />
                </th>
                <th>이름</th>
                <th>연락처</th>
                <th>1지망</th>
                <th>2지망</th>
                <th>배차 확정</th>
                <th>입금 상태</th>
                <th>신청일</th>
              </tr>
            </thead>

            <tbody>
              {reservations.length === 0 ? (
                <tr>
                  <td colSpan={8} className={styles.emptyCell}>
                    버스 신청자가 없습니다.
                  </td>
                </tr>
              ) : (
                reservations.map((reservation) => {
                  const payment = getPayment(reservation);
                  const paymentStatus = payment?.status || 'no_payment';

                  const firstStation =
                    reservation.station_preferences?.find(
                      (preference) => preference.rank === 1
                    )?.station?.name || '-';

                  const secondStation =
                    reservation.station_preferences?.find(
                      (preference) => preference.rank === 2
                    )?.station?.name || '-';
                  const confirmedTicket = reservation.confirmed_ticket;

                  return (
                    <tr
                      key={reservation.id}
                      className={`${styles.row} ${
                        paymentStatus === 'completed' ? styles.completed : ''
                      }`}
                    >
                      <td className={styles.checkCol}>
                        <input
                          type="checkbox"
                          checked={payment?.status === 'completed'}
                          onChange={(e) =>
                            handleDirectPaymentCheck(
                              reservation,
                              e.target.checked
                            )
                          }
                          disabled={
                            verifying ||
                            payment?.status === 'refunded' ||
                            isPaymentCheckLocked
                          }
                          title={
                            isPaymentCheckLocked
                              ? '송금 완료 보고 이후에는 수정할 수 없습니다.'
                              : undefined
                          }
                        />
                      </td>

                      <td className={styles.name}>{reservation.name}</td>
                      <td className={styles.phone}>{reservation.phone}</td>
                      <td>{firstStation}</td>
                      <td>{secondStation}</td>
                      <td>
                        {confirmedTicket ? (
                          <div className={styles.ticketConfirmed}>
                            <div className={styles.ticketDestination}>
                              <span>귀가 행선지</span>
                              <strong>
                                {confirmedTicket.dropoffStation || '-'}
                              </strong>
                            </div>

                            <div className={styles.ticketAssignment}>
                              <span className={styles.ticketBadge}>
                                <BusFront size={13} />
                                {formatBusLabel(confirmedTicket.busNumber) || '-'}
                              </span>
                              <span className={styles.seatBadge}>
                                {confirmedTicket.seatNumber
                                  ? `${confirmedTicket.seatNumber}번 좌석`
                                  : '좌석 미지정'}
                              </span>
                            </div>

                          </div>
                        ) : (
                          <span className={styles.ticketPending}>미확정</span>
                        )}
                      </td>

                      <td>
                        <span
                          className={`${styles.status} ${
                            payment ? styles[payment.status] : ''
                          }`}
                        >
                          {paymentStatus === 'completed'
                            ? '✓ 확인됨'
                            : paymentStatus === 'pending'
                              ? '대기 중'
                              : paymentStatus === 'refunded'
                                ? '환불'
                                : '대기 중'}
                        </span>
                      </td>

                      <td className={styles.date}>
                        {new Date(reservation.created_at).toLocaleDateString(
                          'ko-KR'
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        )}

        <div
          className={`${styles.transferBox} ${
            hasReportedTransfer ? styles.transferBoxReported : ''
          } ${
            isHeadOfficeConfirmed ? styles.transferBoxConfirmed : ''
          } ${
            campusTransfer?.hasAdditionalSettlement
              ? styles.transferBoxNeedsUpdate
              : ''
          }`}
        >
          <div className={styles.transferContent}>
            <div className={styles.transferHeaderRow}>
              <div>
                <p className={styles.transferEyebrow}>서울지구 계좌 송금</p>
                <p className={styles.transferTitle}>본부 송금 보고</p>
              </div>

              <div
                className={`${styles.transferStatusPill} ${
                  campusTransfer?.hasAdditionalSettlement
                    ? styles.transferStatusNeedsUpdate
                    : isHeadOfficeConfirmed
                      ? styles.transferStatusConfirmed
                      : hasReportedTransfer
                        ? styles.transferStatusReported
                        : ''
                }`}
              >
                {transferStatusTitle}
              </div>
            </div>

            {!isHeadOfficeConfirmed && (
              <p className={styles.transferText}>{transferStatusDescription}</p>
            )}

            <div className={styles.transferDetailGrid}>
              <div className={styles.transferAccountBox}>
                <span>서울지구 송금 계좌 번호</span>
                <strong>
                  {districtTransferAccountNumber ||
                    '전체 관리자가 계좌 번호를 아직 설정하지 않았습니다.'}
                </strong>
                <small className={styles.transferDepositorName}>
                  입금자명: 공백 없이 캠퍼스명 뒤에 담당자명 (예:{' '}
                  {adminScope?.campus || '서울캠'}홍길동)
                </small>
              </div>

              <div className={styles.transferSummaryGrid}>
                <div>
                  <span>송금 예정액</span>
                  <strong>{totalAmount.toLocaleString()}원</strong>
                </div>
                <div>
                  <span>입금 확인</span>
                  <strong>
                    {paidPeople} / {totalPeople}명
                  </strong>
                </div>
              </div>
            </div>

            {!hasReportedTransfer && (
              <div className={styles.transferWarning}>
                <AlertTriangle size={18} />
                <strong>
                  송금 완료 버튼을 누른 이후에는 입금 상태와 송금 보고 내용을
                  수정할 수 없습니다.
                </strong>
              </div>
            )}

            <div
              className={`${styles.transferStatusBox} ${
                campusTransfer?.hasAdditionalSettlement
                  ? styles.transferStatusNeedsUpdate
                  : isHeadOfficeConfirmed
                    ? styles.transferStatusConfirmed
                    : hasReportedTransfer
                      ? styles.transferStatusReported
                      : ''
              }`}
            >
              <strong>{transferStatusTitle}</strong>
              <span>{transferStatusDescription}</span>
              {campusTransfer?.sentAt && (
                <span className={styles.transferStatusMeta}>
                  보고 시각 {formatDateTime(campusTransfer.sentAt)}
                </span>
              )}
            </div>

          </div>

          {(canReportCampusTransfer || campusTransfer?.status === 'sent') && (
            <div className={styles.transferActionStack}>
              {canReportCampusTransfer && (
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={handleMarkCampusTransferSent}
                  disabled={transferSending}
                >
                  {transferSending ? '처리 중...' : reportButtonLabel}
                </button>
              )}
              {campusTransfer?.status === 'sent' && (
                <button
                  type="button"
                  className={styles.cancelTransferButton}
                  onClick={handleCancelCampusTransferReport}
                  disabled={transferSending}
                >
                  <RotateCcw size={16} />
                  {transferSending ? '처리 중...' : '송금 보고 완료 취소'}
                </button>
              )}
            </div>
          )}
        </div>

        <div className={styles.requestHelpBox}>
          <div className={styles.requestHelpText}>
            <MessageSquare size={18} />
            <div>
              <strong>문의 게시판</strong>
              <p>
                마감 이후 추가 신청, 환불, 입금 오류, 명단 수정처럼 본부 확인이
                필요한 내용을 남기는 공간입니다. 송금 완료 처리와는 별도로
                필요할 때만 사용해주세요.
              </p>
            </div>
          </div>

          <button
            type="button"
            className={styles.outlineButton}
            onClick={() => navigate('/admin/communications')}
          >
            문의 게시판 열기
          </button>
        </div>
      </main>
    </div>
  );
};

export default CampusAdminPage;
