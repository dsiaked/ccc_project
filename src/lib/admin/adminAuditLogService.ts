import { supabase } from '../supabase';

const AUDIT_LOG_SETUP_FILE = 'sql/setup/95_admin_permission_and_audit.sql';

interface SupabaseQueryError {
  code?: string;
  message?: string;
}

const throwAdminAuditLogError = (error: SupabaseQueryError): never => {
  if (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    error.message?.includes('admin_action_audit_logs')
  ) {
    throw new Error(
      `관리 작업 기록 DB 기능이 설치되지 않았습니다. Supabase SQL Editor에서 ${AUDIT_LOG_SETUP_FILE}을 실행해주세요.`
    );
  }

  throw error;
};

export type AdminAuditAction = 'insert' | 'update' | 'delete';

export interface AdminAuditLog {
  id: string;
  actorId: string | null;
  actorName: string;
  actorEmail: string | null;
  action: AdminAuditAction;
  resourceType: string;
  resourceId: string | null;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminAuditLogFilters {
  action?: AdminAuditAction | 'all';
  resourceType?: string;
  actorKeyword?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

interface AdminAuditLogRow {
  id: string;
  actor_id: string | null;
  action: AdminAuditAction;
  resource_type: string;
  resource_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
}

interface ActorProfileRow {
  id: string;
  name: string | null;
  email: string | null;
}

const getActorProfiles = async (actorIds: string[]) => {
  if (actorIds.length === 0) return new Map<string, ActorProfileRow>();

  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email')
    .in('id', actorIds);

  if (error) throwAdminAuditLogError(error);

  return new Map(
    ((data ?? []) as ActorProfileRow[]).map((profile) => [profile.id, profile])
  );
};

const getMatchingActorIds = async (keyword: string) => {
  const normalizedKeyword = keyword.trim();

  if (!normalizedKeyword) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .or(
      `name.ilike.%${normalizedKeyword.replaceAll(',', '')}%,email.ilike.%${normalizedKeyword.replaceAll(',', '')}%`
    )
    .limit(100);

  if (error) throwAdminAuditLogError(error);

  return (data ?? []).map((profile) => profile.id);
};

const mapAuditLogs = async (rows: AdminAuditLogRow[]) => {
  const actorIds = [
    ...new Set(rows.map((row) => row.actor_id).filter((id): id is string => Boolean(id))),
  ];
  const profiles = await getActorProfiles(actorIds);

  return rows.map((row) => {
    const actor = row.actor_id ? profiles.get(row.actor_id) : null;

    return {
      id: row.id,
      actorId: row.actor_id,
      actorName: actor?.name || actor?.email || '알 수 없는 관리자',
      actorEmail: actor?.email ?? null,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      beforeData: row.before_data,
      afterData: row.after_data,
      createdAt: row.created_at,
    } satisfies AdminAuditLog;
  });
};

export const getAdminAuditLogs = async ({
  action = 'all',
  resourceType = '',
  actorKeyword = '',
  dateFrom = '',
  dateTo = '',
  page = 1,
  pageSize = 30,
}: AdminAuditLogFilters = {}) => {
  const normalizedPage = Math.max(1, Math.floor(page));
  const normalizedPageSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
  const matchingActorIds = await getMatchingActorIds(actorKeyword);

  if (matchingActorIds?.length === 0) {
    return { items: [], totalCount: 0, page: normalizedPage, pageSize: normalizedPageSize };
  }

  let query = supabase
    .from('admin_action_audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(
      (normalizedPage - 1) * normalizedPageSize,
      normalizedPage * normalizedPageSize - 1
    );

  if (action !== 'all') query = query.eq('action', action);
  if (resourceType) query = query.eq('resource_type', resourceType);
  if (matchingActorIds) query = query.in('actor_id', matchingActorIds);
  if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
  if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59.999`);

  const { data, error, count } = await query;

  if (error) throwAdminAuditLogError(error);

  return {
    items: await mapAuditLogs((data ?? []) as AdminAuditLogRow[]),
    totalCount: count ?? 0,
    page: normalizedPage,
    pageSize: normalizedPageSize,
  };
};

export const getRecentAdminAuditLogs = async (limit = 5) => {
  const { data, error } = await supabase
    .from('admin_action_audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Math.max(1, limit));

  if (error) throwAdminAuditLogError(error);

  return mapAuditLogs((data ?? []) as AdminAuditLogRow[]);
};

export const adminAuditActionLabels: Record<AdminAuditAction, string> = {
  insert: '생성',
  update: '변경',
  delete: '삭제',
};

export const adminAuditResourceLabels: Record<string, string> = {
  payments: '입금 정보',
  campus_transfers: '캠퍼스 송금',
};
