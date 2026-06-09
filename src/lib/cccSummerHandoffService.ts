import { supabase } from './supabase';

export interface CccSummerProfile {
  name: string;
  phone: string;
  univName: string;
  branchName: string;
  isStaff: boolean;
}

interface HandoffSession {
  access_token: string;
  refresh_token: string;
}

export interface CccSummerHandoffResult {
  profile: CccSummerProfile;
  requiresCampusSelection: boolean;
}

const exchangeRequests = new Map<string, Promise<CccSummerHandoffResult>>();

const getErrorMessage = (error: unknown) => {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String(error.message)
      : '';

  if (message.includes('missing_required_profile_fields')) {
    return 'CCC 개인정보 제공 항목이 부족합니다. CCC 여름수련회 페이지에서 개인정보 제공 동의를 다시 확인해주세요.';
  }
  if (message.includes('ccc_summer_exchange_failed')) {
    return 'CCC 로그인 정보가 만료되었거나 이미 사용되었습니다. CCC 페이지에서 다시 입장해주세요.';
  }

  return 'CCC 로그인 정보를 확인하지 못했습니다. 잠시 후 CCC 페이지에서 다시 입장해주세요.';
};

const exchangeAndSetSession = async (
  code: string,
  redirectUri: string
): Promise<CccSummerHandoffResult> => {
  const { data, error } = await supabase.functions.invoke('ccc-summer-handoff', {
    body: { action: 'exchange', code, redirectUri },
  });

  if (error) throw new Error(getErrorMessage(error));

  const session = data?.session as HandoffSession | undefined;
  if (!session?.access_token || !session.refresh_token) {
    throw new Error('CCC 로그인 세션을 생성하지 못했습니다.');
  }

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (sessionError) throw new Error('로그인 세션을 저장하지 못했습니다.');

  return {
    profile: data.profile as CccSummerProfile,
    requiresCampusSelection: data.requiresCampusSelection === true,
  };
};

export const exchangeCccSummerCode = (code: string, redirectUri: string) => {
  const requestKey = `${redirectUri}:${code}`;
  const existingRequest = exchangeRequests.get(requestKey);
  if (existingRequest) return existingRequest;

  const request = exchangeAndSetSession(code, redirectUri);
  exchangeRequests.set(requestKey, request);
  return request;
};

export const selectCccSummerCampus = async (campusId: string) => {
  const { data, error } = await supabase.functions.invoke('ccc-summer-handoff', {
    body: { action: 'select-campus', campusId },
  });

  if (error || data?.requiresCampusSelection !== false) {
    throw new Error('캠퍼스 연결을 저장하지 못했습니다. 다시 시도해주세요.');
  }
};
