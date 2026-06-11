interface PersonalInquiryErrorLike {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
}

const includesAny = (value: string, candidates: string[]) =>
  candidates.some((candidate) => value.includes(candidate.toLowerCase()));

export const getPersonalInquirySubmitErrorMessage = (error: unknown) => {
  const errorLike =
    error && typeof error === 'object' ? (error as PersonalInquiryErrorLike) : {};
  const code = typeof errorLike.code === 'string' ? errorLike.code : '';
  const description = [
    errorLike.message,
    errorLike.details,
    errorLike.hint,
    typeof error === 'string' ? error : '',
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();

  if (description.includes('resolve an existing inquiry')) {
    return '미해결 문의는 최대 3건까지 등록할 수 있습니다.';
  }
  if (description.includes('please wait before creating another inquiry')) {
    return '연속 등록을 막기 위해 잠시 후 다시 시도해주세요.';
  }
  if (
    code === 'PGRST301' ||
    code === 'PGRST302' ||
    includesAny(description, [
      'authentication is required',
      'jwt expired',
      'invalid jwt',
      'session expired',
    ])
  ) {
    return '로그인 세션이 만료되었습니다. 다시 로그인한 뒤 문의를 접수해주세요.';
  }
  if (
    code === 'PGRST202' ||
    code === '42883' ||
    includesAny(description, [
      'create_personal_inquiry',
      'schema cache',
      'could not find the function',
    ])
  ) {
    return '문의 접수 기능을 현재 사용할 수 없습니다. 관리자에게 문의해주세요.';
  }
  if (
    includesAny(description, [
      'failed to fetch',
      'networkerror',
      'network request failed',
      'load failed',
    ])
  ) {
    return '서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해주세요.';
  }

  return code
    ? `문의를 접수하지 못했습니다. 잠시 후 다시 시도해주세요. (오류 코드: ${code})`
    : '문의를 접수하지 못했습니다. 잠시 후 다시 시도해주세요.';
};
