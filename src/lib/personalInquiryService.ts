import { supabase } from './supabase';

export const personalInquiryReadEventName = 'personal-inquiry-read';
export const personalInquiryChangedEventName = 'personal-inquiry-changed';

export type PersonalInquiryCategory =
  | 'reservation'
  | 'payment'
  | 'ticket'
  | 'boarding'
  | 'etc';
export type PersonalInquiryStatus =
  | 'open'
  | 'in_progress'
  | 'resolved'
  | 'on_hold';
export type PersonalInquiryMessageRole = 'user' | 'global_admin';

export interface PersonalInquiryMessage {
  id: string;
  inquiryId: string;
  senderId: string;
  senderRole: PersonalInquiryMessageRole;
  message: string;
  createdAt: string;
}

export interface PersonalInquiry {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  userPhone: string | null;
  category: PersonalInquiryCategory;
  status: PersonalInquiryStatus;
  title: string;
  content: string;
  adminResponse: string | null;
  handledBy: string | null;
  handledAt: string | null;
  createdAt: string;
  updatedAt: string;
  messages: PersonalInquiryMessage[];
}

export interface PersonalInquirySummary {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  onHold: number;
}

export interface PersonalInquiryPageResult {
  items: PersonalInquiry[];
  total: number;
  summary: PersonalInquirySummary;
}

export interface PersonalInquiryAuditLog {
  id: string;
  inquiryId: string;
  messageId: string | null;
  actorId: string | null;
  action: 'status_changed' | 'response_changed' | 'message_created';
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  createdAt: string;
}

type MessageRow = {
  id: string;
  inquiry_id: string;
  sender_id: string;
  sender_role: PersonalInquiryMessageRole;
  message: string;
  created_at: string;
};

type InquiryRow = {
  id: string;
  user_id: string;
  user_name?: string | null;
  user_email?: string | null;
  user_phone?: string | null;
  category: PersonalInquiryCategory;
  status: PersonalInquiryStatus;
  title: string;
  content: string;
  admin_response: string | null;
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
  updated_at: string;
  messages?: MessageRow[];
};

const mapMessage = (row: MessageRow): PersonalInquiryMessage => ({
  id: row.id,
  inquiryId: row.inquiry_id,
  senderId: row.sender_id,
  senderRole: row.sender_role,
  message: row.message,
  createdAt: row.created_at,
});

const mapInquiry = (
  row: InquiryRow,
  messages: PersonalInquiryMessage[] = []
): PersonalInquiry => ({
  id: row.id,
  userId: row.user_id,
  userName: row.user_name ?? null,
  userEmail: row.user_email ?? null,
  userPhone: row.user_phone ?? null,
  category: row.category,
  status: row.status,
  title: row.title,
  content: row.content,
  adminResponse: row.admin_response,
  handledBy: row.handled_by,
  handledAt: row.handled_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  messages: row.messages?.map(mapMessage) ?? messages,
});

const isMissingPersonalInquiryPageRpc = (error: {
  code?: string;
  message?: string;
}) =>
  error.code === 'PGRST202' ||
  error.code === '42883' ||
  Boolean(
    error.message?.includes('get_personal_inquiries_page_as_global_admin') ||
      error.message?.includes('schema cache') ||
      error.message?.includes('Could not find the function')
  );

const getLegacyPersonalInquiryMessages = (
  row: InquiryRow
): PersonalInquiryMessage[] => {
  const messages: PersonalInquiryMessage[] = [
    {
      id: `initial-${row.id}`,
      inquiryId: row.id,
      senderId: row.user_id,
      senderRole: 'user',
      message: row.content,
      createdAt: row.created_at,
    },
  ];

  if (row.admin_response?.trim()) {
    messages.push({
      id: `response-${row.id}`,
      inquiryId: row.id,
      senderId: row.handled_by ?? row.user_id,
      senderRole: 'global_admin',
      message: row.admin_response,
      createdAt: row.handled_at ?? row.updated_at,
    });
  }

  return messages;
};

const matchesLegacyPersonalInquirySearch = (
  row: InquiryRow,
  normalizedSearch: string
) =>
  normalizedSearch === '' ||
  [
    row.user_name,
    row.user_email,
    row.user_phone,
    row.title,
    row.content,
    row.admin_response,
  ].some((value) => value?.toLocaleLowerCase().includes(normalizedSearch));

async function getLegacyCompatiblePersonalInquiryPage(params: {
  page: number;
  pageSize: number;
  status: PersonalInquiryStatus | 'all';
  search: string;
}): Promise<PersonalInquiryPageResult> {
  const { data, error } = await supabase.rpc(
    'get_personal_inquiries_as_global_admin'
  );
  if (error) throw error;

  const rows = (data ?? []) as InquiryRow[];
  const normalizedSearch = params.search.trim().toLocaleLowerCase();
  const filteredRows = rows.filter(
    (row) =>
      (params.status === 'all' || row.status === params.status) &&
      matchesLegacyPersonalInquirySearch(row, normalizedSearch)
  );
  const start = (Math.max(1, params.page) - 1) * params.pageSize;
  const countByStatus = (status: PersonalInquiryStatus) =>
    rows.filter((row) => row.status === status).length;

  return {
    items: filteredRows
      .slice(start, start + params.pageSize)
      .map((row) => mapInquiry(row, getLegacyPersonalInquiryMessages(row))),
    total: filteredRows.length,
    summary: {
      total: rows.length,
      open: countByStatus('open'),
      inProgress: countByStatus('in_progress'),
      resolved: countByStatus('resolved'),
      onHold: countByStatus('on_hold'),
    },
  };
}

export async function getMyPersonalInquiries() {
  const [inquiryResult, messageResult] = await Promise.all([
    supabase.rpc('get_my_personal_inquiries'),
    supabase.rpc('get_my_personal_inquiry_messages'),
  ]);
  if (inquiryResult.error) throw inquiryResult.error;
  if (messageResult.error) throw messageResult.error;

  const messagesByInquiry = new Map<string, PersonalInquiryMessage[]>();
  ((messageResult.data ?? []) as MessageRow[]).forEach((row) => {
    const message = mapMessage(row);
    const current = messagesByInquiry.get(message.inquiryId) ?? [];
    current.push(message);
    messagesByInquiry.set(message.inquiryId, current);
  });

  return ((inquiryResult.data ?? []) as InquiryRow[]).map((row) =>
    mapInquiry(row, messagesByInquiry.get(row.id) ?? [])
  );
}

export async function createPersonalInquiry(params: {
  category: PersonalInquiryCategory;
  title: string;
  content: string;
}) {
  const { data, error } = await supabase.rpc('create_personal_inquiry', {
    p_category: params.category,
    p_title: params.title,
    p_content: params.content,
  });
  if (error) throw error;
  window.dispatchEvent(new CustomEvent(personalInquiryChangedEventName));
  return mapInquiry(data as InquiryRow);
}

export async function addPersonalInquiryMessage(params: {
  inquiryId: string;
  message: string;
}) {
  const { data, error } = await supabase.rpc('add_personal_inquiry_message', {
    p_inquiry_id: params.inquiryId,
    p_message: params.message,
  });
  if (error) throw error;
  window.dispatchEvent(new CustomEvent(personalInquiryChangedEventName));
  return mapMessage(data as MessageRow);
}

export async function getPersonalInquiriesPageAsGlobalAdmin(params: {
  page: number;
  pageSize: number;
  status: PersonalInquiryStatus | 'all';
  search: string;
}): Promise<PersonalInquiryPageResult> {
  const { data, error } = await supabase.rpc(
    'get_personal_inquiries_page_as_global_admin',
    {
      p_page: params.page,
      p_page_size: params.pageSize,
      p_status: params.status,
      p_search: params.search,
    }
  );
  if (error) {
    if (isMissingPersonalInquiryPageRpc(error)) {
      return getLegacyCompatiblePersonalInquiryPage(params);
    }
    throw error;
  }
  const result = data as {
    items?: InquiryRow[];
    total?: number;
    summary?: {
      total?: number;
      open?: number;
      in_progress?: number;
      resolved?: number;
      on_hold?: number;
    };
  };
  return {
    items: (result.items ?? []).map((row) => mapInquiry(row)),
    total: Number(result.total ?? 0),
    summary: {
      total: Number(result.summary?.total ?? 0),
      open: Number(result.summary?.open ?? 0),
      inProgress: Number(result.summary?.in_progress ?? 0),
      resolved: Number(result.summary?.resolved ?? 0),
      onHold: Number(result.summary?.on_hold ?? 0),
    },
  };
}

export async function respondToPersonalInquiry(params: {
  inquiryId: string;
  status: PersonalInquiryStatus;
  adminResponse: string;
}) {
  const { data, error } = await supabase.rpc('respond_to_personal_inquiry', {
    p_inquiry_id: params.inquiryId,
    p_status: params.status,
    p_admin_response: params.adminResponse,
  });
  if (error) throw error;
  window.dispatchEvent(new CustomEvent(personalInquiryChangedEventName));
  return mapInquiry(data as InquiryRow);
}

export async function markPersonalInquiryRead(inquiryId: string) {
  const { error } = await supabase.rpc('mark_personal_inquiry_read', {
    p_inquiry_id: inquiryId,
  });
  if (error) throw error;
  window.dispatchEvent(new CustomEvent(personalInquiryReadEventName));
}

export async function getUnreadPersonalInquiryCount() {
  const { data, error } = await supabase.rpc('get_unread_personal_inquiry_count');
  if (error) throw error;
  return Number(data ?? 0);
}

export async function getPersonalInquiryAuditLogs(
  inquiryId: string
): Promise<PersonalInquiryAuditLog[]> {
  const { data, error } = await supabase.rpc('get_personal_inquiry_audit_logs', {
    p_inquiry_id: inquiryId,
  });
  if (error) throw error;
  return ((data ?? []) as Array<{
    id: string;
    inquiry_id: string;
    message_id: string | null;
    actor_id: string | null;
    action: PersonalInquiryAuditLog['action'];
    before_data: Record<string, unknown> | null;
    after_data: Record<string, unknown> | null;
    created_at: string;
  }>).map((row) => ({
    id: row.id,
    inquiryId: row.inquiry_id,
    messageId: row.message_id,
    actorId: row.actor_id,
    action: row.action,
    beforeData: row.before_data,
    afterData: row.after_data,
    createdAt: row.created_at,
  }));
}
