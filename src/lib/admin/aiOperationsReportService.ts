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
