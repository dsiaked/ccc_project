let firebaseApiPromise;

export const FIREBASE_BOOT_DELAY_MS = 900;

export const loadFirebaseApi = () => {
  if (!firebaseApiPromise) {
    firebaseApiPromise = Promise.all([
      import('../firebase'),
      import('firebase/firestore'),
    ]).then(([firebase, firestore]) => ({
      ...firebase,
      collection: firestore.collection,
      limit: firestore.limit,
      onSnapshot: firestore.onSnapshot,
      query: firestore.query,
      serverTimestamp: firestore.serverTimestamp,
      where: firestore.where,
    }));
  }

  return firebaseApiPromise;
};

export const withTimeout = (promise, timeoutMs, label) => (
  Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => {
        reject(new Error(`${label} timed out`));
      }, timeoutMs);
    }),
  ])
);

export const scheduleAfterInitialPaint = callback => {
  const run = () => window.setTimeout(callback, FIREBASE_BOOT_DELAY_MS);

  if ('requestIdleCallback' in window) {
    const idleId = window.requestIdleCallback(run, { timeout: FIREBASE_BOOT_DELAY_MS });
    return () => window.cancelIdleCallback?.(idleId);
  }

  const timerId = window.setTimeout(run, FIREBASE_BOOT_DELAY_MS);
  return () => window.clearTimeout(timerId);
};

export const saveUserSymbols = async (userId, symbols) => {
  const { db, doc, serverTimestamp, setDoc } = await loadFirebaseApi();
  await setDoc(doc(db, 'users', userId), {
    symbols,
    updatedAt: serverTimestamp(),
  }, { merge: true });
};
