const KAKAO_MAP_SDK_ID = 'kakao-map-sdk';
let kakaoMapSdkPromise: Promise<void> | null = null;

const normalizeEnvValue = (value: unknown) =>
  String(value ?? '')
    .trim()
    .replace(/^['"]|['"]$/g, '');

export const getKakaoMapAppKey = () =>
  normalizeEnvValue(import.meta.env.VITE_KAKAO_JAVASCRIPT_KEY) ||
  normalizeEnvValue(import.meta.env.VITE_KAKAO_MAP_KEY);

const validateKakaoMapAppKey = (appKey: string) => {
  if (!appKey) {
    throw new Error(
      '지도 검색 키가 설정되지 않았습니다. .env에 VITE_KAKAO_JAVASCRIPT_KEY를 설정해주세요.'
    );
  }

  if (appKey.length !== 32) {
    throw new Error(
      'Kakao JavaScript 키 형식이 올바르지 않습니다. 카카오 개발자 콘솔의 JavaScript 키 32자만 입력해주세요.'
    );
  }
};

export const loadKakaoMapSdk = () => {
  if (window.kakao?.maps) {
    return Promise.resolve();
  }

  if (kakaoMapSdkPromise) {
    return kakaoMapSdkPromise;
  }

  kakaoMapSdkPromise = new Promise<void>((resolve, reject) => {
    if (window.kakao?.maps) {
      window.kakao.maps.load(resolve);
      return;
    }

    const appKey = getKakaoMapAppKey();

    try {
      validateKakaoMapAppKey(appKey);
    } catch (error) {
      reject(error);
      return;
    }

    const scriptSrc = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(
      appKey
    )}&libraries=services&autoload=false`;
    const existingScript = document.getElementById(
      KAKAO_MAP_SDK_ID
    ) as HTMLScriptElement | null;

    if (existingScript && existingScript.src !== scriptSrc) {
      existingScript.remove();
    }

    const currentScript = document.getElementById(
      KAKAO_MAP_SDK_ID
    ) as HTMLScriptElement | null;
    const script = currentScript ?? document.createElement('script');
    let timeoutId: number | null = null;
    const clearHandlers = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      script.onload = null;
      script.onerror = null;
    };
    const rejectWithCleanup = (error: Error) => {
      clearHandlers();
      script.remove();
      reject(error);
    };
    timeoutId = window.setTimeout(() => {
      rejectWithCleanup(new Error('Kakao Maps SDK loading timed out.'));
    }, 10000);

    script.id = KAKAO_MAP_SDK_ID;
    script.src = scriptSrc;
    script.async = true;
    script.onload = () => {
      if (!window.kakao?.maps) {
        rejectWithCleanup(
          new Error('Kakao Maps SDK loaded without the maps object.')
        );
        return;
      }

      clearHandlers();
      window.kakao.maps.load(resolve);
    };
    script.onerror = () => {
      rejectWithCleanup(new Error('Kakao Maps SDK could not be loaded.'));
    };

    if (!currentScript) {
      document.head.appendChild(script);
    }
  });

  kakaoMapSdkPromise.catch(() => {
    kakaoMapSdkPromise = null;
  });

  return kakaoMapSdkPromise;
};

export const geocodeKakaoAddress = async (address: string) => {
  await loadKakaoMapSdk();

  const services = window.kakao?.maps?.services;

  if (!services) {
    throw new Error('카카오 주소 검색 서비스를 사용할 수 없습니다.');
  }

  return new Promise<{ lat: number; lng: number }>((resolve, reject) => {
    const geocoder = new services.Geocoder();

    geocoder.addressSearch(address, (result, status) => {
      const firstResult = result[0];

      if (status !== services.Status.OK || !firstResult) {
        reject(new Error(`주소의 위치를 찾지 못했습니다: ${address}`));
        return;
      }

      const lat = Number(firstResult.y);
      const lng = Number(firstResult.x);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        reject(new Error(`주소의 좌표가 올바르지 않습니다: ${address}`));
        return;
      }

      resolve({ lat, lng });
    });
  });
};
