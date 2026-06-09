const ALREADY_REGISTERED_CODES = new Set([
  'email_exists',
  'user_already_exists',
]);

export const isAlreadyRegisteredSignupError = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const { code, message } = error as {
    code?: unknown;
    message?: unknown;
  };

  return (
    (typeof code === 'string' && ALREADY_REGISTERED_CODES.has(code)) ||
    (typeof message === 'string' &&
      message.toLowerCase().includes('user already registered'))
  );
};
