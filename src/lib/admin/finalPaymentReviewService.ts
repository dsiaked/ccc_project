import { getBusTicketPrice, getCampusTransferStats } from '../adminService';
import { supabase } from '../supabase';

export type FinalPaymentStatus = 'missing' | 'pending' | 'refunded';
export type IndividualReviewReason =
  | 'remaining_seat'
  | 'outside_seoul'
  | 'admin_created';

export interface UnpaidReservation {
  id: string;
  name: string;
  phone: string;
  district: string;
  team: string;
  campus: string;
  reservationStatus: 'requested' | 'confirmed';
  paymentStatus: FinalPaymentStatus;
  confirmedTicket: boolean;
  reviewReasons: IndividualReviewReason[];
}

export interface UnpaidCampus {
  key: string;
  district: string;
  team: string;
  campus: string;
  campusAdminName: string | null;
  campusAdminPhone: string | null;
  totalPeople: number;
  paidPeople: number;
  unpaidPeople: number;
  expectedAmount: number;
  outstandingAmount: number;
  transferStatus: 'pending' | 'sent' | 'confirmed';
}

export interface FinalPaymentReview {
  ticketPrice: number;
  totalIndividualReviewTargets: number;
  paidIndividualReviewTargets: number;
  unpaidReservations: UnpaidReservation[];
  unpaidCampuses: UnpaidCampus[];
}

type PaymentRow = {
  status?: 'pending' | 'completed' | 'refunded' | null;
};

type ReservationRow = {
  id: string;
  user_id: string;
  name: string | null;
  phone: string | null;
  district: string | null;
  team: string | null;
  campus: string | null;
  affiliation_type?: 'seoul' | 'external' | null;
  status: 'requested' | 'confirmed' | 'cancelled' | null;
  confirmed_ticket: unknown;
  data: Record<string, unknown> | null;
  payments: PaymentRow | PaymentRow[] | null;
};

const PAGE_SIZE = 1000;
const RESERVATION_SELECT =
  'id, user_id, name, phone, district, team, campus, affiliation_type, status, confirmed_ticket, data, payments(status)';
const LEGACY_RESERVATION_SELECT =
  'id, user_id, name, phone, district, team, campus, status, confirmed_ticket, data, payments(status)';

type QueryError = {
  code?: string;
  message: string;
};

const isMissingColumn = (error: QueryError, column: string) =>
  error.code === '42703' ||
  error.code === 'PGRST204' ||
  error.message.includes(`column ${column}`) ||
  error.message.includes(`'${column}' column`);

const throwQueryError = (error: QueryError): never => {
  throw new Error(error.message);
};

const getPayment = (payments: ReservationRow['payments']) =>
  Array.isArray(payments) ? payments[0] : payments;

const getIndividualReviewReasons = (
  row: ReservationRow,
  adminCreatedUserIds: Set<string>
) => {
  const reviewReasons: IndividualReviewReason[] = [];

  if (row.data?.remainingSeatClaim) reviewReasons.push('remaining_seat');
  if (row.affiliation_type === 'external' || row.district !== '서울지구') {
    reviewReasons.push('outside_seoul');
  }
  if (adminCreatedUserIds.has(row.user_id)) reviewReasons.push('admin_created');

  return reviewReasons;
};

const getAdminCreatedUserIds = async () => {
  const ids = new Set<string>();

  while (true) {
    const from = ids.size;
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('account_source', 'admin_created')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      if (isMissingColumn(error, 'account_source')) {
        console.warn(
          'profiles.account_source is not installed yet; admin-created accounts cannot be classified.'
        );
        return ids;
      }

      throwQueryError(error);
    }

    const page = (data ?? []) as Array<{ id: string }>;
    page.forEach((profile) => ids.add(profile.id));

    if (page.length < PAGE_SIZE) return ids;
  }
};

const getAllActiveReservations = async () => {
  const rows: ReservationRow[] = [];
  let useLegacySelect = false;

  while (true) {
    const from = rows.length;
    const result = await supabase
      .from('reservations')
      .select(useLegacySelect ? LEGACY_RESERVATION_SELECT : RESERVATION_SELECT)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    let data: unknown = result.data;
    let error: QueryError | null = result.error;

    if (error && !useLegacySelect && isMissingColumn(error, 'affiliation_type')) {
      console.warn(
        'reservations.affiliation_type is not installed yet; falling back to district-based classification.'
      );
      useLegacySelect = true;

      const legacyResult = await supabase
        .from('reservations')
        .select(LEGACY_RESERVATION_SELECT)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      data = legacyResult.data;
      error = legacyResult.error;
    }

    if (error) throwQueryError(error);

    const page = (data ?? []) as unknown as ReservationRow[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) return rows;
  }
};

export async function getFinalPaymentReview(): Promise<FinalPaymentReview> {
  const [reservations, transfers, ticketPrice, adminCreatedUserIds] = await Promise.all([
    getAllActiveReservations(),
    getCampusTransferStats(),
    getBusTicketPrice(),
    getAdminCreatedUserIds(),
  ]);

  const individualReviewTargets = reservations.flatMap<
    ReservationRow & { reviewReasons: IndividualReviewReason[] }
  >((row) => {
    const reviewReasons = getIndividualReviewReasons(row, adminCreatedUserIds);

    return reviewReasons.length > 0 ? [{ ...row, reviewReasons }] : [];
  });

  const unpaidReservations = individualReviewTargets.flatMap<UnpaidReservation>(
    (row) => {
      const payment = getPayment(row.payments);

      if (payment?.status === 'completed') return [];

      return [{
        id: row.id,
        name: row.name ?? '',
        phone: row.phone ?? '',
        district: row.district ?? '',
        team: row.team ?? '',
        campus: row.campus ?? '',
        reservationStatus: row.status === 'confirmed' ? 'confirmed' : 'requested',
        paymentStatus:
          payment?.status === 'refunded'
            ? 'refunded'
            : payment?.status === 'pending'
              ? 'pending'
              : 'missing',
        confirmedTicket: Boolean(row.confirmed_ticket),
        reviewReasons: row.reviewReasons,
      }];
    }
  );

  const transferByCampus = new Map(
    transfers.map((transfer) => [
      [transfer.district, transfer.team, transfer.campus].join('|'),
      transfer,
    ])
  );
  const campusPaymentStats = new Map<
    string,
    {
      district: string;
      team: string;
      campus: string;
      totalPeople: number;
      paidPeople: number;
    }
  >();

  reservations.forEach((row) => {
    if (getIndividualReviewReasons(row, adminCreatedUserIds).length > 0) return;

    const district = row.district ?? '';
    const team = row.team ?? '';
    const campus = row.campus ?? '';
    const key = [district, team, campus].join('|');
    const stat = campusPaymentStats.get(key) ?? {
      district,
      team,
      campus,
      totalPeople: 0,
      paidPeople: 0,
    };

    stat.totalPeople += 1;
    if (getPayment(row.payments)?.status === 'completed') stat.paidPeople += 1;
    campusPaymentStats.set(key, stat);
  });

  const unpaidCampuses = Array.from(campusPaymentStats.entries())
    .flatMap<UnpaidCampus>(([key, stat]) => {
      const transfer = transferByCampus.get(key);
      const transferStatus = transfer?.status ?? 'pending';

      if (
        transferStatus === 'confirmed' &&
        stat.paidPeople === stat.totalPeople
      ) {
        return [];
      }

      const expectedAmount = stat.totalPeople * ticketPrice;

      return [{
        key,
        district: stat.district,
        team: stat.team,
        campus: stat.campus,
        campusAdminName: transfer?.campusAdminName ?? null,
        campusAdminPhone: transfer?.campusAdminPhone ?? null,
        totalPeople: stat.totalPeople,
        paidPeople: stat.paidPeople,
        unpaidPeople: Math.max(stat.totalPeople - stat.paidPeople, 0),
        expectedAmount,
        outstandingAmount: Math.max(
          expectedAmount - (transfer?.actualConfirmedAmount ?? 0),
          0
        ),
        transferStatus,
      }];
    })
    .sort(
      (a, b) =>
        a.district.localeCompare(b.district, 'ko') ||
        a.team.localeCompare(b.team, 'ko') ||
        a.campus.localeCompare(b.campus, 'ko')
    );

  return {
    ticketPrice,
    totalIndividualReviewTargets: individualReviewTargets.length,
    paidIndividualReviewTargets:
      individualReviewTargets.length - unpaidReservations.length,
    unpaidReservations,
    unpaidCampuses,
  };
}
