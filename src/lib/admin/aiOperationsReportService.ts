import { supabase } from '../supabase';

export type AiOperationsReportStatus = 'pending' | 'completed' | 'failed';

export interface AiOperationsReport {
  id: string;
  status: AiOperationsReportStatus;
  periodStart: string;
  periodEnd: string;
  anonymized: boolean;
  inputSummary: Record<string, unknown>;
  reportMarkdown: string | null;
  model: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface AiReportLogSettings {
  includeNavigation: boolean;
  includeAuthentication: boolean;
  includeDataChanges: boolean;
  includeAdminAudit: boolean;
  updatedAt: string | null;
}

export interface ActivityEventLog {
  id: string;
  actorKind: 'user' | 'admin' | 'system';
  eventName: string;
  category: string;
  route: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

export interface ActivityEventLogFilters {
  category?: string;
  actorKind?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

interface AiOperationsReportRow {
  id: string;
  status: AiOperationsReportStatus;
  period_start: string;
  period_end: string;
  anonymized: boolean;
  input_summary: Record<string, unknown> | null;
  report_markdown: string | null;
  model: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

interface AiReportLogSettingsRow {
  include_navigation: boolean;
  include_authentication: boolean;
  include_data_changes: boolean;
  include_admin_audit: boolean;
  updated_at: string;
}

interface ActivityEventLogRow {
  id: string;
  actor_kind: 'user' | 'admin' | 'system';
  event_name: string;
  category: string;
  route: string | null;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
}

const mapSettings = (
  row: AiReportLogSettingsRow | null
): AiReportLogSettings => ({
  includeNavigation: row?.include_navigation ?? true,
  includeAuthentication: row?.include_authentication ?? true,
  includeDataChanges: row?.include_data_changes ?? true,
  includeAdminAudit: row?.include_admin_audit ?? true,
  updatedAt: row?.updated_at ?? null,
});

const mapReport = (row: AiOperationsReportRow): AiOperationsReport => ({
  id: row.id,
  status: row.status,
  periodStart: row.period_start,
  periodEnd: row.period_end,
  anonymized: row.anonymized,
  inputSummary: row.input_summary ?? {},
  reportMarkdown: row.report_markdown,
  model: row.model,
  errorMessage: row.error_message,
  createdAt: row.created_at,
  completedAt: row.completed_at,
});

export const getAiOperationsReports = async () => {
  const { data, error } = await supabase
    .from('ai_operations_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) throw error;
  return ((data ?? []) as AiOperationsReportRow[]).map(mapReport);
};

export const generateAiOperationsReport = async (
  periodStart: string,
  periodEnd: string
) => {
  const { data, error } = await supabase.functions.invoke('ai-operations-report', {
    body: { periodStart, periodEnd },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return String(data.reportId);
};

export const getAiReportLogSettings = async () => {
  const { data, error } = await supabase
    .from('ai_report_log_settings')
    .select('*')
    .eq('id', true)
    .maybeSingle();

  if (error) throw error;
  return mapSettings(data as AiReportLogSettingsRow | null);
};

export const updateAiReportLogSettings = async (
  settings: Omit<AiReportLogSettings, 'updatedAt'>
) => {
  const { data, error } = await supabase.rpc('update_ai_report_log_settings', {
    p_include_navigation: settings.includeNavigation,
    p_include_authentication: settings.includeAuthentication,
    p_include_data_changes: settings.includeDataChanges,
    p_include_admin_audit: settings.includeAdminAudit,
  }).single();

  if (error) throw error;
  return mapSettings(data as AiReportLogSettingsRow);
};

export const getActivityEventLogs = async ({
  category = '',
  actorKind = '',
  dateFrom = '',
  dateTo = '',
  page = 1,
  pageSize = 30,
}: ActivityEventLogFilters = {}) => {
  const normalizedPageSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
  const normalizedPage = Math.max(1, Math.floor(page));
  const from = (normalizedPage - 1) * normalizedPageSize;
  const to = from + normalizedPageSize - 1;
  let query = supabase
    .from('activity_event_logs')
    .select('*', { count: 'exact' })
    .order('occurred_at', { ascending: false })
    .range(from, to);

  if (category) query = query.eq('category', category);
  if (actorKind) query = query.eq('actor_kind', actorKind);
  if (dateFrom) query = query.gte('occurred_at', `${dateFrom}T00:00:00`);
  if (dateTo) query = query.lte('occurred_at', `${dateTo}T23:59:59.999`);

  const { data, count, error } = await query;
  if (error) throw error;

  return {
    items: ((data ?? []) as ActivityEventLogRow[]).map((row) => ({
      id: row.id,
      actorKind: row.actor_kind,
      eventName: row.event_name,
      category: row.category,
      route: row.route,
      metadata: row.metadata ?? {},
      occurredAt: row.occurred_at,
    })),
    total: count ?? 0,
  };
};
