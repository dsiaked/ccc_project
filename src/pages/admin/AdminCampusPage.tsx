import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  BusFront,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleCheck,
  Download,
  Landmark,
  Megaphone,
  MessageSquare,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
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
import { getReservationDeadline } from '../../lib/reservationDeadlineService';
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

type ApplicantPaymentFilter = 'all' | 'pending' | 'completed' | 'refunded';

const APPLICANT_PAGE_SIZE = 10;

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
  const [pendingBulkPaymentStatus, setPendingBulkPaymentStatus] = useState<
    boolean | null
  >(null);
  const [transferSending, setTransferSending] = useState(false);
  const [savingPaymentAccount, setSavingPaymentAccount] = useState(false);
  const [savingApplicantImage, setSavingApplicantImage] = useState(false);
  const [isApplicantListOpen, setIsApplicantListOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [applicantQuery, setApplicantQuery] = useState('');
  const [applicantPaymentFilter, setApplicantPaymentFilter] =
    useState<ApplicantPaymentFilter>('all');
  const [applicantPage, setApplicantPage] = useState(1);

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
  const [hasSavedPaymentAccount, setHasSavedPaymentAccount] = useState(false);
  const [isPaymentAccountDirty, setIsPaymentAccountDirty] = useState(false);
  const [paymentAccountMessage, setPaymentAccountMessage] = useState<
    string | null
  >(null);
  const [isReservationDeadlineClosed, setIsReservationDeadlineClosed] =
    useState(false);

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
      console.warn('캠퍼스 송금 완료 보고 상태 조회 실패:', error);

      try {
        return await getCampusTransferByScope(scope);
      } catch (fallbackError) {
        console.warn('캠퍼스 송금 완료 보고 직접 조회 실패:', fallbackError);
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
            throw new Error('캠퍼스 회계 순장님에게 연결된 캠퍼스 ID가 없습니다.');
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
          reservationDeadlineResult,
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
          getReservationDeadline(),
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
            setHasSavedPaymentAccount(Boolean(paymentAccountResult.value));
            setIsPaymentAccountDirty(false);
            setPaymentAccount(
              paymentAccountResult.value ?? {
                campusId: nextScope.campusId,
                bankName: '',
                accountNumber: '',
                accountHolder: '',
              }
            );
          } else {
            setHasSavedPaymentAccount(false);
            setIsPaymentAccountDirty(false);
            console.warn(
              'Failed to load campus payment account:',
              paymentAccountResult.reason
            );
          }

          if (reservationDeadlineResult.status === 'fulfilled') {
            setIsReservationDeadlineClosed(reservationDeadlineResult.value.isClosed);
          } else {
            setIsReservationDeadlineClosed(false);
            console.warn(
              'Failed to load reservation deadline status:',
              reservationDeadlineResult.reason
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

  const filteredReservations = useMemo(() => {
    const query = applicantQuery.trim().toLocaleLowerCase('ko');
    const compactQuery = query.replaceAll(/\s|-/g, '');

    return reservations.filter((reservation) => {
      const payment = getPayment(reservation);
      const paymentStatus = payment?.status ?? 'pending';

      if (
        applicantPaymentFilter !== 'all' &&
        paymentStatus !== applicantPaymentFilter
      ) {
        return false;
      }

      if (!query) return true;

      const searchableText = [
        reservation.name,
        reservation.phone,
        getStationName(reservation, 1),
        getStationName(reservation, 2),
        reservation.confirmed_ticket?.dropoffStation,
        formatBusLabel(reservation.confirmed_ticket?.busNumber),
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('ko');

      return (
        searchableText.includes(query) ||
        searchableText.replaceAll(/\s|-/g, '').includes(compactQuery)
      );
    });
  }, [applicantPaymentFilter, applicantQuery, reservations]);

  const filteredCheckableReservations = useMemo(() => {
    return filteredReservations.filter((reservation) => {
      const payment = getPayment(reservation);
      return payment?.status !== 'refunded';
    });
  }, [filteredReservations]);

  const applicantTotalPages = Math.max(
    1,
    Math.ceil(filteredReservations.length / APPLICANT_PAGE_SIZE)
  );
  const effectiveApplicantPage = Math.min(applicantPage, applicantTotalPages);
  const pagedReservations = filteredReservations.slice(
    (effectiveApplicantPage - 1) * APPLICANT_PAGE_SIZE,
    effectiveApplicantPage * APPLICANT_PAGE_SIZE
  );
  const applicantRangeStart =
    filteredReservations.length === 0
      ? 0
      : (effectiveApplicantPage - 1) * APPLICANT_PAGE_SIZE + 1;
  const applicantRangeEnd = Math.min(
    effectiveApplicantPage * APPLICANT_PAGE_SIZE,
    filteredReservations.length
  );

  const allChecked =
    filteredCheckableReservations.length > 0 &&
    filteredCheckableReservations.every((reservation) => {
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
        '개인정보가 포함된 이미지입니다. 필요한 범위에서만 사용해주세요.',
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
  const transferAmountToSend = needsAdditionalTransfer
    ? campusTransfer?.additionalAmountDue ?? totalAmount
    : totalAmount;
  const isPaymentCheckLocked = hasReportedTransfer && !needsAdditionalTransfer;
  const hasDistrictTransferAccount = Boolean(
    districtTransferAccountNumber.trim()
  );
  const canReportCampusTransfer =
    canSendCampusTransfer &&
    isReservationDeadlineClosed &&
    hasDistrictTransferAccount &&
    (!hasReportedTransfer || needsAdditionalTransfer);
  const remainingPaymentCount = Math.max(0, totalPeople - paidPeople);
  const reportButtonLabel = needsAdditionalTransfer
    ? '추가 송금 완료 보고하기'
    : '송금 완료 보고하기';
  const disabledReportButtonLabel = !isReservationDeadlineClosed
    ? '신청 마감 후 보고 가능'
    : totalPeople === 0
      ? '확인할 신청자가 없습니다'
      : remainingPaymentCount > 0
        ? `${remainingPaymentCount}명 입금 확인 필요`
        : !hasDistrictTransferAccount
          ? '본부 송금 계좌 확인 필요'
          : reportButtonLabel;
  const transferStatusTitle = isHeadOfficeConfirmed
      ? '정산 완료'
      : hasReportedTransfer && !needsAdditionalTransfer
        ? '본부 확인 대기 중'
        : !isReservationDeadlineClosed
          ? '신청 마감 대기 중'
          : totalPeople === 0
            ? '신청자 없음'
            : remainingPaymentCount > 0
              ? needsAdditionalTransfer
                ? '추가 신청자 입금 확인 중'
                : '신청자 입금 확인 중'
              : !hasDistrictTransferAccount
                ? '본부 송금 계좌 확인 필요'
                : needsAdditionalTransfer
                  ? '추가 송금 필요'
                  : '본부 송금 가능';
  const transferStatusDescription = isHeadOfficeConfirmed
      ? `본부에서 ${(
          campusTransfer.actualConfirmedAmount ??
          campusTransfer.reportedTotalAmount
        ).toLocaleString()}원을 확인했습니다. 이번 캠퍼스 버스비 정산이 완료되었습니다.`
      : hasReportedTransfer && !needsAdditionalTransfer
        ? `${campusTransfer.reportedTotalAmount.toLocaleString()}원 송금 완료를 보고했습니다. 본부에서 입금 내역을 확인하고 있습니다.`
        : !isReservationDeadlineClosed
          ? '신청 마감 후 신청자 입금 확인과 본부 송금을 진행할 수 있습니다.'
          : totalPeople === 0
            ? '현재 본부로 송금할 버스 신청자가 없습니다.'
            : remainingPaymentCount > 0
              ? `신청자 ${totalPeople}명 중 ${paidPeople}명의 입금을 확인했습니다. 남은 ${remainingPaymentCount}명의 입금을 확인하면 본부로 송금할 수 있습니다.`
              : !hasDistrictTransferAccount
                ? '본부 송금 계좌가 아직 등록되지 않았습니다. 계좌가 표시되기 전에는 송금하지 말고 문의 게시판으로 알려주세요.'
                : needsAdditionalTransfer
                  ? `추가 신청으로 송금할 금액이 ${transferAmountToSend.toLocaleString()}원 증가했습니다. 아래 계좌로 추가 금액만 송금한 뒤 완료 사실을 보고해주세요.`
                  : `신청자 ${totalPeople}명 전원의 입금을 확인했습니다. ${transferAmountToSend.toLocaleString()}원을 아래 계좌로 송금한 뒤 완료 사실을 보고해주세요.`;

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

  const handleQuickPaymentToggle = (
    reservation: ReservationWithPayment,
    isCompleted: boolean
  ) => {
    if (
      isCompleted &&
      !window.confirm(
        `${reservation.name}님의 입금 확인을 취소하고 미입금으로 되돌릴까요?`
      )
    ) {
      return;
    }

    void handleDirectPaymentCheck(reservation, !isCompleted);
  };

  const handleBulkPaymentCheck = (checked: boolean) => {
    if (verifying) return;

    if (isPaymentCheckLocked) {
      alert('송금 완료 보고 이후에는 입금 상태를 수정할 수 없습니다.');
      return;
    }

    if (filteredCheckableReservations.length === 0) {
      return;
    }

    setPendingBulkPaymentStatus(checked);
  };

  const confirmBulkPaymentCheck = async () => {
    if (pendingBulkPaymentStatus === null || verifying) return;

    const checked = pendingBulkPaymentStatus;
    const nextStatus = checked ? 'completed' : 'pending';

    setVerifying(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('로그인이 필요합니다.');
      }

      await Promise.all(
        filteredCheckableReservations.map((reservation) => {
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
      setPendingBulkPaymentStatus(null);
    } catch (error) {
      console.error('전체 입금 상태 변경 실패:', error);

      alert(`전체 입금 상태 변경에 실패했습니다: ${getErrorMessage(error)}`);
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (pendingBulkPaymentStatus === null) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !verifying) {
        setPendingBulkPaymentStatus(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingBulkPaymentStatus, verifying]);

  const handleMarkCampusTransferSent = async () => {
    if (!adminScope) {
      alert('관리자 정보를 찾을 수 없습니다.');
      return;
    }

    if (paidPeople !== totalPeople) {
      alert('아직 모든 인원의 입금이 확인되지 않았습니다.');
      return;
    }

    try {
      const deadline = await getReservationDeadline();

      setIsReservationDeadlineClosed(deadline.isClosed);

      if (!deadline.isClosed) {
        alert('신청 마감 후 송금 완료를 보고할 수 있습니다.');
        return;
      }
    } catch (error) {
      console.error('신청 마감 상태 조회 실패:', error);
      alert('신청 마감 상태를 확인할 수 없어 송금 완료 보고를 진행할 수 없습니다.');
      return;
    }

    const ok = window.confirm(
      `${adminScope.campus} 캠퍼스에서 본부로 ${transferAmountToSend.toLocaleString()}원을 ${needsAdditionalTransfer ? '추가 송금' : '송금'}한 사실을 보고할까요?\n\n실제 송금을 완료한 경우에만 진행해주세요.\n입금자명은 공백 없이 캠퍼스명 뒤에 담당자명을 입력해주세요. (예: ${adminScope.campus}홍길동)\n\n송금 완료를 보고한 뒤에는 신청자 입금 확인을 수정할 수 없습니다. 수정이 필요하면 본부 확인 전에 송금 완료 보고를 취소해주세요.`
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

      alert('본부에 송금 완료 사실을 보고했습니다.');
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
      alert('취소할 송금 완료 보고가 없습니다.');
      return;
    }

    const ok = window.confirm(
      '송금 완료 보고를 취소할까요?\n\n취소 후 신청자 입금 상태를 다시 수정할 수 있습니다. 수정이 끝나면 송금 완료 사실을 다시 보고해주세요.'
    );

    if (!ok) return;

    setTransferSending(true);

    try {
      await cancelCampusTransferReport({ transferId: campusTransfer.id });

      setCampusTransfer(null);

      if (adminScope) {
        await refreshReservations(adminScope.campus, adminScope.team);
      }

      alert('송금 완료 보고를 취소했습니다.');
    } catch (error) {
      console.error('송금 완료 보고 취소 실패:', error);
      alert(`송금 완료 보고 취소 중 오류가 발생했습니다: ${getErrorMessage(error)}`);
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
    setIsPaymentAccountDirty(true);
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
      setHasSavedPaymentAccount(true);
      setIsPaymentAccountDirty(false);
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
        {activeAdminRole?.role === 'global_admin' && (
          <>
            <section className={styles.globalAdminPanel}>
              <div className={styles.globalAdminPanelHeading}>
                <span className={styles.globalAdminPanelIcon}>
                  <ShieldCheck size={20} aria-hidden="true" />
                </span>
                <span>
                  <strong>전체 관리자 전용 도구</strong>
                  <small>이 영역은 캠퍼스 회계 순장님에게 보이지 않습니다.</small>
                </span>
              </div>

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

              <div className={styles.globalAdminWarning}>
                <AlertTriangle size={20} aria-hidden="true" />
                <div>
                  <strong>캠퍼스 회계 순장님 요청 전에는 수정하지 마세요.</strong>
                  <p>
                    캠퍼스 회계 순장님의 요청이 문의로 접수되기 전에는 아래 화면의
                    입금 상태, 입금 계좌, 송금 완료 보고 및 명단을 임의로 수정하지
                    않는 것을 권장합니다. 긴급 조치가 필요하면 캠퍼스 회계 순장님과
                    먼저 확인하고 처리 내역을 문의에 남겨주세요.
                  </p>
                </div>
              </div>
            </section>

            <div className={styles.campusViewMarker}>
              <Building2 size={18} aria-hidden="true" />
              <span>
                <strong>아래부터 캠퍼스 회계 순장님이 보는 화면입니다.</strong>
                <small>
                  전체 관리자는 캠퍼스 회계 순장님과 동일한 화면을 대리 조회합니다.
                </small>
              </span>
            </div>
          </>
        )}

        <section
          className={
            activeAdminRole?.role === 'global_admin'
              ? styles.campusAdminWorkspace
              : undefined
          }
          aria-label="캠퍼스 회계 순장님 운영 화면"
        >
        <section className={styles.header}>
          <div className={styles.roleBanner}>
            <span className={styles.roleBannerIcon}>
              <Building2 size={20} aria-hidden="true" />
            </span>
            <span>
              <strong>캠퍼스 회계 순장님 전용 운영 화면</strong>
              <small>소속 캠퍼스 신청자와 입금·송금 업무를 관리합니다.</small>
            </span>
          </div>
          {adminScope && (
            <div className={styles.adminScopeBadge}>
              <Building2 size={15} aria-hidden="true" />
              {adminScope.district} · {adminScope.team} · {adminScope.campus}
            </div>
          )}
          <h1>캠퍼스 회계 순장님 페이지</h1>
          <p>
            버스 신청자 확인부터 캠퍼스 입금 및 본부 송금 절차까지 이곳에서
            진행합니다.
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
              <div className={styles.preparationGuide}>
                <strong>0. 사전 준비 단계</strong>
                <section
                  className={`${styles.preparationItem} ${styles.preparationItemWarning}`}
                >
                  <div className={styles.preparationItemHeader}>
                    <div
                      className={`${styles.preparationItemIcon} ${styles.preparationItemWarningIcon}`}
                    >
                      <AlertTriangle size={20} aria-hidden="true" />
                    </div>
                    <div className={styles.preparationItemHeading}>
                      <span className={styles.preparationItemNumber}>01</span>
                      <div>
                        <h2>가입 캠퍼스를 확인해주세요</h2>
                        <p>
                          서울지구 소속이 아니더라도 본인 캠퍼스와 함께 온 친구들은 본인
                          캠퍼스로 회원가입하도록 안내해주세요.
                        </p>
                      </div>
                    </div>
                    <span
                      className={`${styles.preparationStatus} ${styles.preparationStatusRequired}`}
                    >
                      확인 필요
                    </span>
                  </div>
                </section>

                <section
                  className={`${styles.preparationItem} ${styles.preparationItemAccount}`}
                >
                  <div className={styles.preparationItemHeader}>
                    <div
                      className={`${styles.preparationItemIcon} ${styles.preparationItemAccountIcon}`}
                    >
                      <Landmark size={20} aria-hidden="true" />
                    </div>
                    <div className={styles.preparationItemHeading}>
                      <span className={styles.preparationItemNumber}>02</span>
                      <div>
                        <h2>입금 계좌 등록</h2>
                        <p>
                          신청자가 신청 과정에서 확인하는 캠퍼스 계좌입니다. 신청
                          접수 전에 등록하고, 접수 중 변경했다면 기존 신청자에게도
                          별도로 안내해주세요.
                        </p>
                      </div>
                    </div>
                    <span
                      className={`${styles.preparationStatus} ${
                        hasSavedPaymentAccount
                          ? styles.preparationStatusComplete
                          : styles.preparationStatusRequired
                      }`}
                    >
                      {hasSavedPaymentAccount && (
                        <CircleCheck size={14} aria-hidden="true" />
                      )}
                      {hasSavedPaymentAccount ? '등록 완료' : '등록 필요'}
                    </span>
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
                          updatePaymentAccountDraft(
                            'accountNumber',
                            event.target.value
                          )
                        }
                        placeholder="계좌번호"
                      />
                    </label>
                    <label>
                      <span>예금주</span>
                      <input
                        value={paymentAccount?.accountHolder ?? ''}
                        onChange={(event) =>
                          updatePaymentAccountDraft(
                            'accountHolder',
                            event.target.value
                          )
                        }
                        placeholder="예금주"
                      />
                    </label>
                    <button
                      type="button"
                      className={
                        hasSavedPaymentAccount && !isPaymentAccountDirty
                          ? styles.paymentAccountSavedButton
                          : styles.paymentAccountSaveButton
                      }
                      onClick={() => void handleSavePaymentAccount()}
                      disabled={
                        savingPaymentAccount ||
                        !adminScope ||
                        (hasSavedPaymentAccount && !isPaymentAccountDirty)
                      }
                    >
                      {hasSavedPaymentAccount && !isPaymentAccountDirty ? (
                        <CircleCheck size={16} aria-hidden="true" />
                      ) : (
                        <Save size={16} aria-hidden="true" />
                      )}
                      {savingPaymentAccount
                        ? '저장 중...'
                        : hasSavedPaymentAccount && !isPaymentAccountDirty
                          ? '저장 완료'
                          : hasSavedPaymentAccount
                            ? '변경 내용 저장'
                            : '입금 받을 계좌 등록'}
                    </button>
                  </div>
                  {paymentAccountMessage && (
                    <p className={styles.paymentAccountMessage} role="status">
                      {paymentAccountMessage}
                    </p>
                  )}
                </section>
              </div>

              <div>
                <strong>1. 신청자 입금 확인</strong>
                <ol className={styles.guideList}>
                  <li>
                    신청자가 등록된 캠퍼스 입금 계좌로 입금했는지 실제 계좌
                    내역을 확인합니다.
                  </li>
                  <li>
                    신청자가 신청 과정에서 &quot;입금했어요&quot;를 선택했더라도
                    실제 입금 내역을 확인한 뒤 개인 체크박스를 선택합니다.
                  </li>
                  <li>
                    신청자 목록에 있어 연락했으나 버스를 타지 않기로 했다면,
                    신청자가 직접 신청을 취소하도록 안내해주세요.
                  </li>
                  <li>전체가 확인되면 목록 상단 체크박스로 한 번에 처리할 수 있습니다.</li>
                </ol>
              </div>
              <div>
                <strong>2. 서울지구 계좌로 송금 후 &quot;송금 완료&quot; 누르기</strong>
                <ol className={styles.guideList}>
                  <li>
                    신청 마감 이후 활성 신청자 전원의 입금 확인이 끝나면 화면의
                    본부 송금 금액을 안내된 계좌로 송금합니다.
                  </li>
                  <li>
                    본부 송금 계좌가 표시되지 않으면 송금하거나 완료 보고를 남기지
                    말고 문의 게시판으로 알려주세요.
                  </li>
                  <li>
                    실제 송금을 마친 뒤 아래의 &quot;송금 완료 보고하기&quot;
                    버튼을 누릅니다.
                  </li>
                </ol>
              </div>
              <div>
                <strong>3. 완료 보고 이후</strong>
                <ol className={styles.guideList}>
                  <li>
                    송금 완료를 보고한 뒤에는 신청자 입금 확인을 수정할 수 없습니다.
                  </li>
                  <li>
                    수정이 필요하면 본부 확인 전에 &quot;송금 완료 보고 취소&quot;를
                    누른 뒤 수정하고 다시 보고합니다.
                  </li>
                  <li>
                    본부 확인 이후 취소·환불, 입금 오류, 명단 수정이 필요하면 문의
                    게시판에 요청을 남겨주세요.
                  </li>
                </ol>
              </div>
              <div>
                <strong>4. 추가 송금</strong>
                <ol className={styles.guideList}>
                  <li>
                    완료 보고 후 추가 신청 등으로 금액이 증가하면 새 신청자의
                    입금을 먼저 확인합니다.
                  </li>
                  <li>
                    화면에 표시된 증가 금액만 추가 송금하고 &quot;추가 송금 완료
                    보고하기&quot;를 눌러 다시 보고합니다.
                  </li>
                </ol>
                <span className={styles.guideWarning}>
                  취소·환불이나 명단 변경은 임의로 처리하지 말고 문의 게시판으로
                  본부와 먼저 확인해주세요.
                </span>
              </div>
            </div>
          )}
        </section>

        <section className={styles.quickPaymentPanel} aria-label="빠른 입금 확인">
          <div className={styles.quickPaymentHeader}>
            <div>
              <h2>빠른 입금 확인</h2>
              <p>
                계좌 입금 내역에서 확인한 이름을 누르세요. 초록색 이름을 다시
                누르면 미입금으로 되돌립니다.
              </p>
            </div>
            <div className={styles.quickPaymentLegend}>
              <span className={styles.quickPaymentPendingLegend}>미입금</span>
              <span className={styles.quickPaymentCompletedLegend}>확인됨</span>
            </div>
          </div>

          {reservations.length === 0 ? (
            <p className={styles.quickPaymentEmpty}>버스 신청자가 없습니다.</p>
          ) : (
            <div className={styles.quickPaymentButtons}>
              {reservations.map((reservation) => {
                const payment = getPayment(reservation);
                const isCompleted = payment?.status === 'completed';
                const isRefunded = payment?.status === 'refunded';

                return (
                  <button
                    key={`quick-payment-${reservation.id}`}
                    type="button"
                    className={`${styles.quickPaymentButton} ${
                      isCompleted ? styles.quickPaymentButtonCompleted : ''
                    } ${isRefunded ? styles.quickPaymentButtonRefunded : ''}`}
                    onClick={() =>
                      handleQuickPaymentToggle(reservation, isCompleted)
                    }
                    disabled={
                      verifying || isRefunded || isPaymentCheckLocked
                    }
                    aria-pressed={isCompleted}
                    aria-label={`${reservation.name} ${
                      isCompleted
                        ? '입금 확인됨, 누르면 미입금으로 변경'
                        : isRefunded
                          ? '환불'
                          : '입금 확인'
                    }`}
                  >
                    {reservation.name}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <div className={styles.listToolbar}>
          <div className={styles.listToolbarHeader}>
            <div>
              <h2 className={styles.listTitle}>상세 신청자 명단</h2>
              <p className={styles.listMeta}>
                동명이인 확인이나 연락이 필요할 때 펼쳐보세요. PNG에는 전체 명단을
                저장합니다.
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
                {isApplicantListOpen ? '상세 명단 접기' : '상세 명단 보기'}
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
        </div>

        {isApplicantListOpen && (
        <div id="campus-applicant-list" className={styles.applicantListContent}>
          <section className={styles.applicantControls} aria-label="신청자 목록 검색 및 필터">
            <label className={styles.applicantSearch}>
              <Search size={17} aria-hidden="true" />
              <input
                type="search"
                value={applicantQuery}
                onChange={(event) => {
                  setApplicantQuery(event.target.value);
                  setApplicantPage(1);
                }}
                  placeholder="이름, 연락처, 행선지, 배차 검색"
              />
            </label>

            <div className={styles.applicantFilters} role="group" aria-label="입금 상태 필터">
              {([
                ['all', '전체', stats.total],
                ['pending', '미입금', stats.pending],
                ['completed', '확인됨', stats.completed],
                ['refunded', '환불', stats.refunded],
              ] as const).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  className={
                    applicantPaymentFilter === value
                      ? styles.activeApplicantFilter
                      : undefined
                  }
                  aria-pressed={applicantPaymentFilter === value}
                  onClick={() => {
                    setApplicantPaymentFilter(value);
                    setApplicantPage(1);
                  }}
                >
                  {label} <span>{count}</span>
                </button>
              ))}
            </div>

            <p className={styles.applicantResultMeta} aria-live="polite">
              {filteredReservations.length === reservations.length
                ? `전체 ${reservations.length}명`
                : `조건에 맞는 신청자 ${filteredReservations.length}명`}
              {filteredReservations.length > 0 &&
                ` · ${applicantRangeStart}-${applicantRangeEnd}명 표시`}
            </p>
          </section>

          <label className={styles.mobileBulkCheck}>
            <input
              type="checkbox"
              checked={allChecked}
              onChange={(event) => handleBulkPaymentCheck(event.target.checked)}
              disabled={
                verifying ||
                filteredCheckableReservations.length === 0 ||
                isPaymentCheckLocked
              }
            />
            <span>
              <strong>현재 필터 결과 입금 확인</strong>
              <small>
                {isPaymentCheckLocked
                  ? '송금 완료 보고 후에는 수정할 수 없습니다.'
                  : `현재 필터 결과 중 확인 가능한 신청자 ${filteredCheckableReservations.length}명을 처리합니다.`}
              </small>
            </span>
          </label>

          <div className={styles.mobileApplicantList}>
            {pagedReservations.length === 0 ? (
              <p className={styles.mobileEmptyState}>
                {reservations.length === 0
                  ? '버스 신청자가 없습니다.'
                  : '검색 조건에 맞는 신청자가 없습니다.'}
              </p>
            ) : (
              pagedReservations.map((reservation) => {
                const payment = getPayment(reservation);
                const paymentStatus = payment?.status || 'no_payment';
                const firstStation = getStationName(reservation, 1);
                const secondStation = getStationName(reservation, 2);
                const confirmedTicket = reservation.confirmed_ticket;

                return (
                  <article
                    key={`mobile-${reservation.id}`}
                    className={`${styles.mobileApplicantCard} ${
                      paymentStatus === 'completed'
                        ? styles.mobileApplicantCardCompleted
                        : ''
                    }`}
                  >
                    <div className={styles.mobileApplicantHeader}>
                      <label className={styles.mobileApplicantCheck}>
                        <input
                          type="checkbox"
                          checked={payment?.status === 'completed'}
                          onChange={(event) =>
                            handleDirectPaymentCheck(
                              reservation,
                              event.target.checked
                            )
                          }
                          disabled={
                            verifying ||
                            payment?.status === 'refunded' ||
                            isPaymentCheckLocked
                          }
                        />
                        <span>입금 확인</span>
                      </label>
                      <span
                        className={`${styles.status} ${
                          payment ? styles[payment.status] : ''
                        }`}
                      >
                        {paymentStatus === 'completed'
                          ? '✓ 확인됨'
                          : paymentStatus === 'refunded'
                            ? '환불'
                            : '대기 중'}
                      </span>
                    </div>

                    <div className={styles.mobileApplicantIdentity}>
                      <strong>{reservation.name}</strong>
                      <a href={`tel:${reservation.phone}`}>{reservation.phone}</a>
                    </div>

                    <dl className={styles.mobileApplicantDetails}>
                      <div>
                        <dt>1지망</dt>
                        <dd>{firstStation}</dd>
                      </div>
                      <div>
                        <dt>2지망</dt>
                        <dd>{secondStation}</dd>
                      </div>
                      <div>
                        <dt>배차</dt>
                        <dd>
                          {confirmedTicket
                            ? `${formatBusLabel(confirmedTicket.busNumber) || '-'} · ${
                                confirmedTicket.dropoffStation || '-'
                              }`
                            : '미확정'}
                        </dd>
                      </div>
                    </dl>
                  </article>
                );
              })
            )}
          </div>

          <div className={styles.tableContainer}>
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
                      filteredCheckableReservations.length === 0 ||
                      isPaymentCheckLocked
                    }
                    title={
                      isPaymentCheckLocked
                        ? '송금 완료 보고 이후에는 수정할 수 없습니다.'
                        : `현재 필터 결과 ${filteredCheckableReservations.length}명 입금 확인`
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
              {pagedReservations.length === 0 ? (
                <tr>
                  <td colSpan={8} className={styles.emptyCell}>
                    {reservations.length === 0
                      ? '버스 신청자가 없습니다.'
                      : '검색 조건에 맞는 신청자가 없습니다.'}
                  </td>
                </tr>
              ) : (
                pagedReservations.map((reservation) => {
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

          {filteredReservations.length > APPLICANT_PAGE_SIZE && (
            <nav className={styles.applicantPagination} aria-label="신청자 목록 페이지">
              <span>
                {applicantRangeStart}-{applicantRangeEnd} /{' '}
                {filteredReservations.length}명
              </span>
              <div>
                <button
                  type="button"
                  aria-label="이전 페이지"
                  disabled={effectiveApplicantPage === 1}
                  onClick={() =>
                    setApplicantPage(Math.max(1, effectiveApplicantPage - 1))
                  }
                >
                  <ChevronLeft size={17} />
                  이전
                </button>
                <strong>
                  {effectiveApplicantPage} / {applicantTotalPages}
                </strong>
                <button
                  type="button"
                  aria-label="다음 페이지"
                  disabled={effectiveApplicantPage === applicantTotalPages}
                  onClick={() =>
                    setApplicantPage(
                      Math.min(applicantTotalPages, effectiveApplicantPage + 1)
                    )
                  }
                >
                  다음
                  <ChevronRight size={17} />
                </button>
              </div>
            </nav>
          )}
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
                <p className={styles.transferEyebrow}>캠퍼스 버스비 정산</p>
                <p className={styles.transferTitle}>본부 송금</p>
              </div>

              <div
                className={`${styles.transferStatusPill} ${
                  campusTransfer?.hasAdditionalSettlement
                    ? styles.transferStatusNeedsUpdate
                    : isHeadOfficeConfirmed
                      ? styles.transferStatusConfirmed
                      : hasReportedTransfer
                        ? styles.transferStatusReported
                        : canReportCampusTransfer
                          ? styles.transferStatusReady
                          : ''
                }`}
              >
                {transferStatusTitle}
              </div>
            </div>

            <p className={styles.transferText}>{transferStatusDescription}</p>
            {campusTransfer?.sentAt && (
              <p className={styles.transferStatusMeta}>
                완료 보고 시각 {formatDateTime(campusTransfer.sentAt)}
              </p>
            )}

            <dl className={styles.transferSummary}>
              <div>
                <dt>송금 계좌</dt>
                <dd>
                  <strong>
                    {districtTransferAccountNumber ||
                      '전체 관리자가 계좌번호를 아직 설정하지 않았습니다.'}
                  </strong>
                  <small className={styles.transferDepositorName}>
                    입금자명: {adminScope?.campus || '서울캠'}홍길동
                  </small>
                </dd>
              </div>
              <div>
                <dt>
                  {needsAdditionalTransfer
                    ? '추가 송금 금액'
                    : '송금할 금액'}
                </dt>
                <dd>
                  <strong>{transferAmountToSend.toLocaleString()}원</strong>
                </dd>
              </div>
              <div>
                <dt>신청자 입금 확인</dt>
                <dd>
                  <strong>
                    {paidPeople} / {totalPeople}명
                  </strong>
                </dd>
              </div>
            </dl>

            {canReportCampusTransfer && (
              <div className={styles.transferWarning}>
                <AlertTriangle size={18} />
                <strong>
                  송금 완료를 보고한 뒤에는 신청자 입금 확인을 수정할 수 없습니다.
                  수정이 필요하면 본부 확인 전에 송금 완료 보고를 취소해주세요.
                </strong>
              </div>
            )}

          </div>

          {!isHeadOfficeConfirmed && (
            <div className={styles.transferActionStack}>
              {(!hasReportedTransfer || needsAdditionalTransfer) && (
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={handleMarkCampusTransferSent}
                  disabled={!canReportCampusTransfer || transferSending}
                >
                  {transferSending
                    ? '처리 중...'
                    : canReportCampusTransfer
                      ? reportButtonLabel
                      : disabledReportButtonLabel}
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
                  {transferSending ? '처리 중...' : '송금 완료 보고 취소'}
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
                필요한 내용을 남기는 공간입니다. 송금 완료 보고와는 별도로
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
        </section>
      </main>

      {pendingBulkPaymentStatus !== null && (
        <div
          className={styles.bulkConfirmBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !verifying) {
              setPendingBulkPaymentStatus(null);
            }
          }}
        >
          <section
            className={styles.bulkConfirmDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-payment-confirm-title"
            aria-describedby="bulk-payment-confirm-description"
          >
            <span className={styles.bulkConfirmIcon} aria-hidden="true">
              <AlertTriangle size={24} />
            </span>
            <div>
              <p className={styles.bulkConfirmEyebrow}>일괄 입금 상태 변경</p>
              <h2 id="bulk-payment-confirm-title">
                현재 필터 결과 {filteredCheckableReservations.length}명을{' '}
                {pendingBulkPaymentStatus ? '입금 확인' : '미입금'} 상태로
                변경할까요?
              </h2>
              <p id="bulk-payment-confirm-description">
                검색어와 입금 상태 필터에 포함된 신청자만 변경하며, 환불 상태
                신청자는 제외합니다.
              </p>
            </div>
            <dl className={styles.bulkConfirmSummary}>
              <div>
                <dt>변경 대상</dt>
                <dd>{filteredCheckableReservations.length}명</dd>
              </div>
              <div>
                <dt>변경 후 상태</dt>
                <dd>{pendingBulkPaymentStatus ? '입금 확인' : '미입금'}</dd>
              </div>
            </dl>
            <div className={styles.bulkConfirmActions}>
              <button
                type="button"
                className={styles.outlineButton}
                onClick={() => setPendingBulkPaymentStatus(null)}
                disabled={verifying}
                autoFocus
              >
                취소
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => void confirmBulkPaymentCheck()}
                disabled={verifying}
              >
                {verifying ? '변경 중...' : '상태 변경하기'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default CampusAdminPage;
