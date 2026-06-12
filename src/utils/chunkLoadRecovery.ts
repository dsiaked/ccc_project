const reloadAttemptKey = 'chunk-load-recovery-attempted';
const stableLoadDelayMs = 10_000;

const isChunkLoadError = (error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';

  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    message.includes('error loading dynamically imported module') ||
    message.includes('Unable to preload CSS')
  );
};

const reloadForLatestDeployment = () => {
  try {
    if (sessionStorage.getItem(reloadAttemptKey) === window.location.pathname) {
      return false;
    }

    sessionStorage.setItem(reloadAttemptKey, window.location.pathname);
  } catch {
    return false;
  }

  window.location.reload();
  return true;
};

export const installChunkLoadRecovery = () => {
  window.setTimeout(() => {
    try {
      sessionStorage.removeItem(reloadAttemptKey);
    } catch {
      // Storage may be unavailable in restricted browsing modes.
    }
  }, stableLoadDelayMs);

  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForLatestDeployment()) {
      event.preventDefault();
    }
  });

  window.addEventListener('error', (event) => {
    if (isChunkLoadError(event.error ?? event.message)) {
      reloadForLatestDeployment();
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (isChunkLoadError(event.reason) && reloadForLatestDeployment()) {
      event.preventDefault();
    }
  });
};
