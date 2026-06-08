export const normalizeAppRedirect = (
  value: unknown,
  fallback = '/'
) => {
  if (typeof value !== 'string') return fallback;

  const redirect = value.trim();
  if (!redirect.startsWith('/') || redirect.startsWith('//')) return fallback;

  return redirect;
};

export const decodeUrlComponentSafely = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};
