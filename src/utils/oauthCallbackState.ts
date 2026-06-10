export const OAUTH_PROVIDER_STORAGE_KEY = 'ccc_bus_oauth_provider';
export const OAUTH_REDIRECT_STORAGE_KEY = 'ccc_bus_oauth_redirect';
export const EXCHANGED_CALLBACK_STORAGE_KEY = 'ccc_bus_exchanged_callback_user';

const getSessionStorage = () =>
  typeof window === 'undefined' ? null : window.sessionStorage;

export const rememberKakaoOAuthState = (redirectTo: string) => {
  const storage = getSessionStorage();
  if (!storage) return;

  storage.setItem(OAUTH_PROVIDER_STORAGE_KEY, 'kakao');
  storage.setItem(OAUTH_REDIRECT_STORAGE_KEY, redirectTo);
};

export const clearOAuthCallbackState = () => {
  const storage = getSessionStorage();
  if (!storage) return;

  storage.removeItem(OAUTH_PROVIDER_STORAGE_KEY);
  storage.removeItem(OAUTH_REDIRECT_STORAGE_KEY);
  storage.removeItem(EXCHANGED_CALLBACK_STORAGE_KEY);
};
