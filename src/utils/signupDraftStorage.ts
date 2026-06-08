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

const parseSignupDraft = (value: string | null): SignupDraft | null => {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    const source = parsed as Record<string, unknown>;

    return {
      email:
        typeof source.email === 'string' ? source.email : emptySignupDraft.email,
      name: typeof source.name === 'string' ? source.name : emptySignupDraft.name,
      phone:
        typeof source.phone === 'string' ? source.phone : emptySignupDraft.phone,
      districtId:
        typeof source.districtId === 'string'
          ? source.districtId
          : emptySignupDraft.districtId,
      teamId:
        typeof source.teamId === 'string'
          ? source.teamId
          : emptySignupDraft.teamId,
      campusId:
        typeof source.campusId === 'string'
          ? source.campusId
          : emptySignupDraft.campusId,
      externalDistrict:
        typeof source.externalDistrict === 'string'
          ? source.externalDistrict
          : emptySignupDraft.externalDistrict,
      externalCampus:
        typeof source.externalCampus === 'string'
          ? source.externalCampus
          : emptySignupDraft.externalCampus,
      coordinatorName:
        typeof source.coordinatorName === 'string'
          ? source.coordinatorName
          : emptySignupDraft.coordinatorName,
      coordinatorPhone:
        typeof source.coordinatorPhone === 'string'
          ? source.coordinatorPhone
          : emptySignupDraft.coordinatorPhone,
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
