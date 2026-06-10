export interface SignupDraft {
  email: string;
  name: string;
  phone: string;
  districtId: string;
  teamId: string;
  campusId: string;
  externalDistrict: string;
  externalCampus: string;
  coordinatorName: string;
  coordinatorPhone: string;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const SIGNUP_DRAFT_STORAGE_KEY = 'ccc-bus-signup-draft';

export const emptySignupDraft: SignupDraft = {
  email: '',
  name: '',
  phone: '',
  districtId: '',
  teamId: '',
  campusId: '',
  externalDistrict: '',
  externalCampus: '',
  coordinatorName: '',
  coordinatorPhone: '',
};

const getDraftString = (
  source: Record<string, unknown>,
  field: keyof SignupDraft
) => (typeof source[field] === 'string' ? source[field] : emptySignupDraft[field]);

const parseSignupDraft = (value: string | null): SignupDraft | null => {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    const source = parsed as Record<string, unknown>;

    return {
      email: getDraftString(source, 'email'),
      name: getDraftString(source, 'name'),
      phone: getDraftString(source, 'phone'),
      districtId: getDraftString(source, 'districtId'),
      teamId: getDraftString(source, 'teamId'),
      campusId: getDraftString(source, 'campusId'),
      externalDistrict: getDraftString(source, 'externalDistrict'),
      externalCampus: getDraftString(source, 'externalCampus'),
      coordinatorName: getDraftString(source, 'coordinatorName'),
      coordinatorPhone: getDraftString(source, 'coordinatorPhone'),
    };
  } catch {
    return null;
  }
};

export const loadSignupDraft = (
  sessionStorage: StorageLike | null | undefined,
  legacyLocalStorage?: StorageLike | null
): SignupDraft => {
  let sessionDraft: SignupDraft | null = null;

  try {
    sessionDraft = parseSignupDraft(
      sessionStorage?.getItem(SIGNUP_DRAFT_STORAGE_KEY) ?? null
    );
  } catch {
    // Ignore blocked storage; the form still works without draft restoration.
  }

  try {
    legacyLocalStorage?.removeItem(SIGNUP_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore browsers that block storage access; we still avoid reviving legacy data.
  }

  return sessionDraft ?? emptySignupDraft;
};

export const saveSignupDraft = (
  draft: SignupDraft,
  sessionStorage: StorageLike | null | undefined
) => {
  try {
    sessionStorage?.setItem(SIGNUP_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Ignore blocked storage; the form still works without draft persistence.
  }
};

export const clearSignupDraft = (
  sessionStorage: StorageLike | null | undefined,
  legacyLocalStorage?: StorageLike | null
) => {
  try {
    sessionStorage?.removeItem(SIGNUP_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore blocked storage; cleanup is best-effort.
  }

  try {
    legacyLocalStorage?.removeItem(SIGNUP_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore blocked storage; cleanup is best-effort.
  }
};
