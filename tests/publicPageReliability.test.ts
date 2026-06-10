import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readPage = (name: string) =>
  readFileSync(`src/pages/${name}.tsx`, 'utf8');

test('login and password email actions recover from rejected auth requests', () => {
  const loginPage = readPage('LoginPage');
  const forgotPasswordPage = readPage('ForgotPasswordPage');
  const kakaoLoginHandler = loginPage.slice(
    loginPage.indexOf('const handleKakaoLogin'),
    loginPage.indexOf('const handleLogin')
  );

  assert.match(
    kakaoLoginHandler,
    /if \(!signInError\) return;[\s\S]*?catch \(error\)[\s\S]*?setLoadingMethod\(null\)/
  );
  assert.doesNotMatch(kakaoLoginHandler, /finally \{/);
  assert.match(
    loginPage,
    /const handleLogin = async[\s\S]*?catch \(error\)[\s\S]*?setError\('[^']+'\)[\s\S]*?finally \{[\s\S]*?setLoadingMethod\(null\)/
  );
  assert.match(
    forgotPasswordPage,
    /resetPasswordForEmail[\s\S]*?catch \(caughtError\)[\s\S]*?setError\('[^']+'\)[\s\S]*?finally \{[\s\S]*?setIsSending\(false\)/
  );
});

test('email auth flows clear stale kakao callback state before starting a new auth request', () => {
  const loginPage = readPage('LoginPage');
  const signupPage = readPage('SignupPage');

  assert.match(
    loginPage,
    /clearOAuthCallbackState\(\)[\s\S]*signInWithPassword/
  );
  assert.match(
    signupPage,
    /clearOAuthCallbackState\(\)[\s\S]*supabase\.auth\.signUp/
  );
});

test('callback and recovery verification cannot remain stuck after rejected requests', () => {
  const callbackPage = readPage('AuthCallbackPage');
  const resetPasswordPage = readPage('ResetPasswordPage');

  assert.match(
    callbackPage,
    /const verifyCallback = async \(\) => \{[\s\S]*?try \{[\s\S]*?catch \(error\)[\s\S]*?setStatus\('error'\)/
  );
  assert.match(
    resetPasswordPage,
    /exchangeCodeForSession\(recoveryCode\)[\s\S]*?\.catch\(\(exchangeError\)[\s\S]*?setRecoveryStatus\('invalid'\)/
  );
  assert.match(
    resetPasswordPage,
    /supabase\.auth\.getSession\(\)\.then[\s\S]*?\.catch\(\(sessionError\)[\s\S]*?setRecoveryStatus\('invalid'\)/
  );
  assert.match(
    resetPasswordPage,
    /const verifyRecoverySession = async[\s\S]*?catch \(verificationError\)[\s\S]*?setRecoveryStatus\('invalid'\)/
  );
});

test('authenticated public pages distinguish session lookup errors from signed-out users', () => {
  const invitationPage = readPage('InvitationCodePage');
  const remainingSeatPage = readPage('RemainingSeatPage');

  assert.match(
    invitationPage,
    /error: sessionError[\s\S]*?if \(sessionError\)[\s\S]*?setError\('[^']+'\)/
  );
  assert.match(
    invitationPage,
    /\.catch\(\(sessionError\)[\s\S]*?setLoading\(false\)/
  );
  assert.match(
    remainingSeatPage,
    /error: sessionError[\s\S]*?if \(sessionError\) throw sessionError;[\s\S]*?if \(!session\)/
  );
});

test('reservation and confirmed ticket load failures cannot masquerade as missing data', () => {
  const reservationPage = readPage('ReservationPage');
  const confirmedTicketPage = readPage('ConfirmedTicketPage');

  assert.match(
    reservationPage,
    /error: sessionError[\s\S]*?if \(sessionError\) throw sessionError/
  );
  assert.match(
    reservationPage,
    /catch \(error\)[\s\S]*?setInitialLoadError\([\s\S]*?initialLoadError \? \([\s\S]*?role="alert"[\s\S]*?setInitialLoadAttempt/
  );
  assert.match(
    confirmedTicketPage,
    /error: sessionError[\s\S]*?if \(sessionError\) throw sessionError/
  );
  assert.match(
    confirmedTicketPage,
    /catch \(error\)[\s\S]*?setLoadError\([\s\S]*?if \(loadError\)[\s\S]*?role="alert"[\s\S]*?setLoadAttempt/
  );
});

test('reservation organization selectors ignore stale async responses', () => {
  const reservationPage = readPage('ReservationPage');

  assert.match(reservationPage, /const teamOptionsRequestIdRef = useRef\(0\)/);
  assert.match(
    reservationPage,
    /const campusOptionsRequestIdRef = useRef\(0\)/
  );
  assert.match(
    reservationPage,
    /const handleDistrictSelect = async[\s\S]*?const requestId = \(teamOptionsRequestIdRef\.current \+= 1\)[\s\S]*?getTeamOptions\(district\.id\)[\s\S]*?teamOptionsRequestIdRef\.current !== requestId/
  );
  assert.match(
    reservationPage,
    /const handleTeamSelect = async[\s\S]*?const requestId = \(campusOptionsRequestIdRef\.current \+= 1\)[\s\S]*?getCampusOptions\(team\.id\)[\s\S]*?campusOptionsRequestIdRef\.current !== requestId/
  );
});

test('profile load failures block reservation edits', () => {
  const reservationPage = readPage('ReservationPage');

  assert.match(reservationPage, /if \(profileError\) \{\s*throw profileError;\s*\}/);
});

test('consumed auth codes preserve verified session evidence for retry', () => {
  const supabaseClient = readFileSync('src/lib/supabase.ts', 'utf8');
  const callbackPage = readPage('AuthCallbackPage');
  const resetPasswordPage = readPage('ResetPasswordPage');

  assert.match(
    callbackPage,
    /session && \(callbackCode \|\| callbackAccessToken \|\| isOAuthCallback\)[\s\S]*sessionStorage\.setItem\(exchangedCallbackStorageKey, session\.user\.id\)/
  );
  assert.match(
    callbackPage,
    /exchangedUserId !== session\.user\.id[\s\S]*Callback session user changed unexpectedly/
  );
  assert.doesNotMatch(
    callbackPage,
    /console\.error\('?몄쬆 肄쒕갚 ?뺤씤 ?ㅽ뙣:'[\s\S]*clearOAuthState\(\)/
  );
  assert.doesNotMatch(
    supabaseClient,
    /hashParams\.get\('type'\) === 'recovery'[\s\S]*sessionStorage\.setItem/
  );
  assert.match(
    resetPasswordPage,
    /bindRecoveryEvidenceToUser\(exchangeData\.session\.user\.id\)[\s\S]*removeRecoveryCodeFromUrl\(\)/
  );
  assert.match(
    resetPasswordPage,
    /event === 'PASSWORD_RECOVERY' && session[\s\S]*bindRecoveryEvidenceToUser\(session\.user\.id\)[\s\S]*window\.setTimeout/
  );
  assert.match(
    resetPasswordPage,
    /recoverySessionUserId &&[\s\S]*data\.session\.user\.id !== recoverySessionUserId[\s\S]*clearRecoveryEvidence\(\)/
  );
  assert.match(
    resetPasswordPage,
    /const hasRecoveryEvidence =[\s\S]*Boolean\(recoverySessionUserId\)/
  );
  assert.match(
    resetPasswordPage,
    /if \(!recoverySessionUserId\) \{[\s\S]*clearRecoveryEvidence\(\)[\s\S]*setRecoveryStatus\('invalid'\)/
  );
});
