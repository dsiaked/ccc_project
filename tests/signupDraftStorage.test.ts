import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearSignupDraft,
  emptySignupDraft,
  loadSignupDraft,
  saveSignupDraft,
  SIGNUP_DRAFT_STORAGE_KEY,
  type SignupDraft,
} from '../src/utils/signupDraftStorage.js';

class MemoryStorage {
  private readonly data = new Map<string, string>();

  getItem(key: string) {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.data.set(key, value);
  }

  removeItem(key: string) {
    this.data.delete(key);
  }
}

const sampleDraft: SignupDraft = {
  email: 'user@example.com',
  name: 'Tester',
  phone: '010-1111-2222',
  districtId: 'district-1',
  teamId: 'team-1',
  campusId: 'campus-1',
  externalDistrict: '',
  externalCampus: '',
  coordinatorName: '',
  coordinatorPhone: '',
};

test('signup drafts are restored from session storage only', () => {
  const sessionStorage = new MemoryStorage();
  const legacyLocalStorage = new MemoryStorage();

  sessionStorage.setItem(SIGNUP_DRAFT_STORAGE_KEY, JSON.stringify(sampleDraft));
  legacyLocalStorage.setItem(
    SIGNUP_DRAFT_STORAGE_KEY,
    JSON.stringify({ ...sampleDraft, email: 'stale@example.com' })
  );

  assert.deepEqual(
    loadSignupDraft(sessionStorage, legacyLocalStorage),
    sampleDraft
  );
  assert.equal(legacyLocalStorage.getItem(SIGNUP_DRAFT_STORAGE_KEY), null);
});

test('malformed signup draft fields fall back to empty strings', () => {
  const sessionStorage = new MemoryStorage();

  sessionStorage.setItem(
    SIGNUP_DRAFT_STORAGE_KEY,
    JSON.stringify({ ...sampleDraft, email: 123, campusId: null })
  );

  assert.deepEqual(loadSignupDraft(sessionStorage), {
    ...sampleDraft,
    email: '',
    campusId: '',
  });
});

test('legacy localStorage drafts are discarded to avoid reviving stale PII', () => {
  const sessionStorage = new MemoryStorage();
  const legacyLocalStorage = new MemoryStorage();

  legacyLocalStorage.setItem(SIGNUP_DRAFT_STORAGE_KEY, JSON.stringify(sampleDraft));

  assert.deepEqual(
    loadSignupDraft(sessionStorage, legacyLocalStorage),
    emptySignupDraft
  );
  assert.equal(legacyLocalStorage.getItem(SIGNUP_DRAFT_STORAGE_KEY), null);
});

test('signup draft save and clear target session storage', () => {
  const sessionStorage = new MemoryStorage();
  const legacyLocalStorage = new MemoryStorage();

  saveSignupDraft(sampleDraft, sessionStorage);
  assert.deepEqual(
    JSON.parse(sessionStorage.getItem(SIGNUP_DRAFT_STORAGE_KEY) ?? '{}'),
    sampleDraft
  );

  legacyLocalStorage.setItem(SIGNUP_DRAFT_STORAGE_KEY, JSON.stringify(sampleDraft));
  clearSignupDraft(sessionStorage, legacyLocalStorage);

  assert.equal(sessionStorage.getItem(SIGNUP_DRAFT_STORAGE_KEY), null);
  assert.equal(legacyLocalStorage.getItem(SIGNUP_DRAFT_STORAGE_KEY), null);
});
