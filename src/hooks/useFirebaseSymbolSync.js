import { useEffect, useRef, useState } from 'react';
import { DEFAULT_MAP_PINS } from '../components/MapArea';
import { getSymbolsSignature, INITIAL_SYMBOLS } from '../utils/symbols';
import {
  loadFirebaseApi,
  saveUserSymbols,
  scheduleAfterInitialPaint,
  withTimeout,
} from '../utils/firebaseApi';

const FIREBASE_SYNC_TIMEOUT_MS = 4500;
const FIREBASE_LOADING_FAILSAFE_MS = 7000;

export default function useFirebaseSymbolSync({
  symbols,
  setSymbols,
  setPins,
  setAnnouncement,
}) {
  const [userId, setUserId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const hasStartedFirebaseSession = useRef(false);
  const lastStoredSymbolsSignature = useRef(getSymbolsSignature(symbols));
  const lastSyncedSymbolsSignature = useRef('');

  useEffect(() => {
    if (hasStartedFirebaseSession.current) return undefined;
    hasStartedFirebaseSession.current = true;

    async function initFirebaseSession() {
      try {
        const { auth, db, doc, getDoc, serverTimestamp, setDoc, signInAnonymously } = await withTimeout(
          loadFirebaseApi(),
          FIREBASE_SYNC_TIMEOUT_MS,
          'Firebase module load',
        );

        const userCredential = await withTimeout(
          signInAnonymously(auth),
          FIREBASE_SYNC_TIMEOUT_MS,
          'Firebase auth',
        );
        const uid = userCredential.user.uid;
        setUserId(uid);

        try {
          const pinsDocSnap = await withTimeout(
            getDoc(doc(db, 'settings', 'map_pins')),
            FIREBASE_SYNC_TIMEOUT_MS,
            'Map pins load',
          );
          if (pinsDocSnap.exists()) {
            const cloudPins = pinsDocSnap.data().pins;
            if (Array.isArray(cloudPins) && cloudPins.length > 0) {
              const mergedPins = DEFAULT_MAP_PINS.map(defaultPin => {
                const cloudMatch = cloudPins.find(cp => cp.id === defaultPin.id);
                return cloudMatch ? { ...defaultPin, ...cloudMatch } : defaultPin;
              });
              setPins(mergedPins);
            }
          }
        } catch (pinError) {
          console.error('심볼 위치(pins) 데이터를 로드하는 중 에러 발생:', pinError);
        }

        try {
          const announcementDocSnap = await withTimeout(
            getDoc(doc(db, 'settings', 'announcement')),
            FIREBASE_SYNC_TIMEOUT_MS,
            'Announcement load',
          );

          if (announcementDocSnap.exists()) {
            const announcementData = announcementDocSnap.data();
            const message = String(announcementData.message || '').trim();
            setAnnouncement(
              announcementData.isActive && message
                ? {
                    title: String(announcementData.title || '공지').trim(),
                    message,
                  }
                : null,
            );
          }
        } catch (announcementError) {
          console.error('공지 데이터를 불러오는 중 오류 발생:', announcementError);
        }

        const userDocRef = doc(db, 'users', uid);

        if (localStorage.getItem('needReset') === 'true') {
          await withTimeout(
            setDoc(userDocRef, {
              symbols: INITIAL_SYMBOLS,
              updatedAt: serverTimestamp(),
            }),
            FIREBASE_SYNC_TIMEOUT_MS,
            'Reset sync',
          );
          localStorage.removeItem('needReset');
          setSymbols(INITIAL_SYMBOLS);
          lastSyncedSymbolsSignature.current = getSymbolsSignature(INITIAL_SYMBOLS);
          return;
        }

        const userDocSnap = await withTimeout(
          getDoc(userDocRef),
          FIREBASE_SYNC_TIMEOUT_MS,
          'User symbols load',
        );

        if (userDocSnap.exists()) {
          const cloudSymbols = userDocSnap.data().symbols || {};

          setSymbols(prev => {
            const merged = {};
            let isChanged = false;
            let cloudNeedsUpdate = false;

            for (const key of Object.keys(INITIAL_SYMBOLS)) {
              const val = !!(prev[key] || cloudSymbols[key]);
              if (prev[key] !== val) isChanged = true;
              if (prev[key] && !cloudSymbols[key]) cloudNeedsUpdate = true;
              merged[key] = val;
            }

            if (cloudNeedsUpdate) {
              lastSyncedSymbolsSignature.current = '';
            }

            if (isChanged) {
              const mergedSignature = getSymbolsSignature(merged);
              lastStoredSymbolsSignature.current = mergedSignature;
              localStorage.setItem('symbols', JSON.stringify(merged));
            }

            return (isChanged || cloudNeedsUpdate) ? merged : prev;
          });
        } else {
          setSymbols(current => current);
        }
      } catch (error) {
        console.error('Firebase Auth/Firestore 동기화 중 에러 발생:', error);
      } finally {
        setIsLoading(false);
      }
    }

    return scheduleAfterInitialPaint(initFirebaseSession);
  }, [setAnnouncement, setPins, setSymbols]);

  useEffect(() => {
    if (!isLoading) return undefined;

    const failSafeTimerId = window.setTimeout(() => {
      console.warn('Firebase sync took too long; opening with local data.');
      setIsLoading(false);
    }, FIREBASE_LOADING_FAILSAFE_MS);

    return () => window.clearTimeout(failSafeTimerId);
  }, [isLoading]);

  useEffect(() => {
    const symbolsSignature = getSymbolsSignature(symbols);

    if (lastStoredSymbolsSignature.current !== symbolsSignature) {
      localStorage.setItem('symbols', JSON.stringify(symbols));
      lastStoredSymbolsSignature.current = symbolsSignature;
    }

    if (userId && !isLoading && lastSyncedSymbolsSignature.current !== symbolsSignature) {
      lastSyncedSymbolsSignature.current = symbolsSignature;
      saveUserSymbols(userId, symbols).catch(err => {
        console.error('Firestore 백업 중 에러 발생:', err);
      });
    }
  }, [symbols, userId, isLoading]);

  return { userId, isLoading };
}
