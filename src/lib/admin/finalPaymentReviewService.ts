import {
  getBusTicketPrice,
  getCampusTransferStats,
  type CampusTransferStat,
} from '../adminService';
import { supabase } from '../supabase';

export type FinalPaymentStatus = 'missing' | 'pending' | 'completed' | 'refunded';
export type IndividualReviewReason =
  | 'remaining_seat'
  | 'outside_seoul'
  | 'admin_created';

export interface IndividualReviewReservation {
  id: string;
  userId: string;
  paymentId: string | null;
  remainingSeatStatus: 'pending_payment' | 'confirmed' | null;
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

export interface FinalPaymentReview {
  ticketPrice: number;
  totalPaymentTargets: number;
  paidPaymentTargets: number;
  totalIndividualReviewTargets: number;
  paidIndividualReviewTargets: number;
  campusTransfers: CampusTransferStat[];
  individualReviewReservations: IndividualReviewReservation[];
}

type PaymentRow = {
  id?: string | null;
  status?: 'pending' | 'completed' | 'refunded' | null;
};

type ReservationRow = {
  id: string;
  created_at: string;
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
  'id, created_at, user_id, name, phone, district, team, campus, affiliation_type, status, confirmed_ticket, data, payments(id,status)';
const LEGACY_RESERVATION_SELECT =
  'id, created_at, user_id, name, phone, district, team, campus, status, confirmed_ticket, data, payments(id,status)';

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

const getRemainingSeatStatus = (data: ReservationRow['data']) => {
  const claim = data?.remainingSeatClaim;

  if (!claim || typeof claim !== 'object') return null;

  const status = (claim as { status?: unknown }).status;
  return status === 'pending_payment' || status === 'confirmed' ? status : null;
};

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
  let cursorId: string | null = null;

  while (true) {
    let query = supabase
      .from('profiles')
      .select('id')
      .eq('account_source', 'admin_created')
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);

    if (cursorId) query = query.gt('id', cursorId);

    const { data, error } = await query;

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
    cursorId = page[page.length - 1].id;
  }
};

const getAllActiveReservations = async () => {
  const rows: ReservationRow[] = [];
  let useLegacySelect = false;
  let cursor: Pick<ReservationRow, 'created_at' | 'id'> | null = null;

  while (true) {
    let query = supabase
      .from('reservations')
      .select(useLegacySelect ? LEGACY_RESERVATION_SELECT : RESERVATION_SELECT)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(PAGE_SIZE);

    if (cursor) {
      query = query.or(
        `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
      );
    }

    const result = await query;
    let data: unknown = result.data;
    let error: QueryError | null = result.error;

    if (error && !useLegacySelect && isMissingColumn(error, 'affiliation_type')) {
      console.warn(
        'reservations.affiliation_type is not installed yet; falling back to district-based classification.'
      );
      useLegacySelect = true;

      let legacyQuery = supabase
        .from('reservations')
        .select(LEGACY_RESERVATION_SELECT)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE);

      if (cursor) {
        legacyQuery = legacyQuery.or(
          `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
        );
      }

      const legacyResult = await legacyQuery;

      data = legacyResult.data;
      error = legacyResult.error;
    }

    if (error) throwQueryError(error);

    const page = (data ?? []) as unknown as ReservationRow[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) return rows;
    cursor = page[page.length - 1];
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

  const individualReviewReservations =
    individualReviewTargets.map<IndividualReviewReservation>((row) => {
      const payment = getPayment(row.payments);

      return {
        id: row.id,
        userId: row.user_id,
        paymentId: payment?.id ?? null,
        remainingSeatStatus: getRemainingSeatStatus(row.data),
        name: row.name ?? '',
        phone: row.phone ?? '',
        district: row.district ?? '',
        team: row.team ?? '',
        campus: row.campus ?? '',
        reservationStatus: row.status === 'confirmed' ? 'confirmed' : 'requested',
        paymentStatus:
          payment?.status === 'completed'
            ? 'completed'
            : payment?.status === 'refunded'
            ? 'refunded'
            : payment?.status === 'pending'
              ? 'pending'
              : 'missing',
        confirmedTicket: Boolean(row.confirmed_ticket),
        reviewReasons: row.reviewReasons,
      };
    });

  return {
    ticketPrice,
    totalPaymentTargets: reservations.length,
    paidPaymentTargets: reservations.filter(
      (reservation) => getPayment(reservation.payments)?.status === 'completed'
    ).length,
    totalIndividualReviewTargets: individualReviewTargets.length,
    paidIndividualReviewTargets: individualReviewReservations.filter(
      (reservation) => reservation.paymentStatus === 'completed'
    ).length,
    campusTransfers: transfers,
    individualReviewReservations,
  };
}
