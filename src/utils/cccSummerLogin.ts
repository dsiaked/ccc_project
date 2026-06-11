const trimTrailingSlashes = (value: string) => value.replace(/\/+$/, '');

export const getCccSummerLoginUrl = (
  env: Record<string, string | undefined>,
  redirectUri: string
) => {
  const baseUrl = env.VITE_CCC_SUMMER_BASE_URL?.trim();
  const clientId = env.VITE_CCC_SUMMER_CLIENT_ID?.trim();

  if (!baseUrl || !clientId) return null;

  const url = new URL(`${trimTrailingSlashes(baseUrl)}/api/handoff/go`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  return url.toString();
};
