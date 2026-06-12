import { supabase } from './supabase';
export { parseInvitationCodes } from '../utils/invitationCodes';

export type InvitationRole = 'campus_admin' | 'boarding_manager';
export type InvitationStatus = 'active' | 'used' | 'expired' | 'cancelled';

export interface InvitationValidationItem {
  index: number;
  role: InvitationRole;
  campusId: string | null;
  campus: string | null;
}

export interface InvitationValidationResult {
  valid: boolean;
  invitations: InvitationValidationItem[];
  errorCode: string | null;
  errorIndex: number | null;
  errorMessage: string | null;
}

export interface AdminInvitationCode {
  id: string;
  code: string | null;
  codeHint: string;
  role: InvitationRole;
  campusId: string | null;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  usedBy: string | null;
  cancelledAt: string | null;
  status: InvitationStatus;
}

export interface CreatedInvitationCode {
  id: string;
  code: string;
  expiresAt: string;
  campusId?: string | null;
}

export interface InvitationCleanupResult {
  deletedInvitations: number;
  deletedAuditLogs: number;
}

const toValidationResult = (value: unknown): InvitationValidationResult => {
  const source =
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

  return {
    valid: source.valid === true,
    invitations: Array.isArray(source.invitations)
      ? (source.invitations as InvitationValidationItem[])
      : [],
    errorCode:
      typeof source.errorCode === 'string' ? source.errorCode : null,
    errorIndex:
      typeof source.errorIndex === 'number' ? source.errorIndex : null,
    errorMessage:
      typeof source.errorMessage === 'string' ? source.errorMessage : null,
  };
};

export async function validateInvitationCodes(codes: string[]) {
  const { data, error } = await supabase.rpc('validate_admin_invitation_codes', {
    p_codes: codes,
  });

  if (error) throw error;

  return toValidationResult(data);
}

export async function redeemInvitationCodes(codes: string[]) {
  const { data, error } = await supabase.rpc('redeem_admin_invitation_codes', {
    p_codes: codes,
  });

  if (error) throw error;

  return data;
}

export async function createAdminInvitationCode(
  role: InvitationRole,
  campusId: string | null
) {
  const { data, error } = await supabase.rpc('create_admin_invitation_code', {
    p_role: role,
    p_campus_id: campusId,
  });

  if (error) throw error;

  return data as unknown as CreatedInvitationCode;
}

export async function createAdminInvitationCodes(
  role: InvitationRole,
  campusId: string | null,
  count: number
) {
  if (count === 1) {
    return [await createAdminInvitationCode(role, campusId)];
  }

  const { data, error } = await supabase.rpc('create_admin_invitation_codes', {
    p_role: role,
    p_campus_id: campusId,
    p_count: count,
  });

  if (error) {
    if (error.code === 'PGRST202') {
      throw new Error(
        '여러 권한 등록 코드 발급 기능의 데이터베이스 업데이트가 아직 적용되지 않았습니다.'
      );
    }
    throw error;
  }

  return data as unknown as CreatedInvitationCode[];
}

export async function createAllCampusAdminInvitationCodes() {
  const { data, error } = await supabase.rpc(
    'create_all_campus_admin_invitation_codes'
  );

  if (error) {
    if (error.code === 'PGRST202') {
      throw new Error(
        '모든 캠퍼스 권한 등록 코드 일괄 발급 기능의 데이터베이스 업데이트가 아직 적용되지 않았습니다.'
      );
    }
    throw error;
  }

  return data as unknown as CreatedInvitationCode[];
}

export async function cancelAdminInvitationCode(invitationId: string) {
  const { data, error } = await supabase.rpc('cancel_admin_invitation_code', {
    p_invitation_id: invitationId,
  });

  if (error) throw error;

  return Boolean(data);
}

export async function cleanupAdminInvitationCodes(): Promise<InvitationCleanupResult> {
  const { data, error } = await supabase.rpc('cleanup_admin_invitation_codes');

  if (error) throw error;

  const source =
    data && typeof data === 'object' ? (data as Record<string, unknown>) : {};

  return {
    deletedInvitations: Number(source.deletedInvitations ?? 0),
    deletedAuditLogs: Number(source.deletedAuditLogs ?? 0),
  };
}

export async function getAdminInvitationCodes(): Promise<AdminInvitationCode[]> {
  const { data, error } = await supabase
    .from('admin_invitation_codes')
    .select(
      'id, code, code_hint, role, campus_id, created_at, expires_at, used_at, used_by, cancelled_at'
    )
    .order('created_at', { ascending: false });

  if (error) throw error;

  const now = Date.now();

  return (data ?? []).map((item) => ({
    id: item.id,
    code: item.code,
    codeHint: item.code_hint,
    role: item.role as InvitationRole,
    campusId: item.campus_id,
    createdAt: item.created_at,
    expiresAt: item.expires_at,
    usedAt: item.used_at,
    usedBy: item.used_by,
    cancelledAt: item.cancelled_at,
    status: item.cancelled_at
      ? 'cancelled'
      : item.used_at
        ? 'used'
        : new Date(item.expires_at).getTime() <= now
          ? 'expired'
          : 'active',
  }));
}
