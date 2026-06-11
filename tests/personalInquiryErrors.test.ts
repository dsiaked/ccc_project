import assert from 'node:assert/strict';
import test from 'node:test';

import { getPersonalInquirySubmitErrorMessage } from '../src/lib/personalInquiryError.js';

test('personal inquiry submit errors explain known recovery actions', () => {
  assert.equal(
    getPersonalInquirySubmitErrorMessage({
      message: 'Resolve an existing inquiry before creating another one.',
    }),
    '미해결 문의는 최대 3건까지 등록할 수 있습니다.'
  );
  assert.equal(
    getPersonalInquirySubmitErrorMessage({ code: 'PGRST301', message: 'JWT expired' }),
    '로그인 세션이 만료되었습니다. 다시 로그인한 뒤 문의를 접수해주세요.'
  );
  assert.equal(
    getPersonalInquirySubmitErrorMessage({
      code: 'PGRST202',
      message: 'Could not find the function public.create_personal_inquiry',
    }),
    '문의 접수 기능을 현재 사용할 수 없습니다. 관리자에게 문의해주세요.'
  );
  assert.equal(
    getPersonalInquirySubmitErrorMessage(new TypeError('Failed to fetch')),
    '서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해주세요.'
  );
});

test('personal inquiry submit errors expose an available diagnostic code', () => {
  assert.equal(
    getPersonalInquirySubmitErrorMessage({ code: 'XX001', message: 'Unknown failure' }),
    '문의를 접수하지 못했습니다. 잠시 후 다시 시도해주세요. (오류 코드: XX001)'
  );
});
