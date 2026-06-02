import React, { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';

const JS_QR_CDN = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';

const copy = {
  ko: {
    title: 'QR 스캔',
    desc: '작품 옆 QR을 화면 안에 맞춰 주세요.',
    loading: '카메라를 여는 중...',
    scanning: 'QR을 찾는 중...',
    permission: '카메라 권한을 허용해야 QR을 스캔할 수 있어요.',
    decoderError: 'QR 스캐너를 불러오지 못했어요. QR 링크를 직접 열어 주세요.',
    close: '닫기',
  },
  en: {
    title: 'Scan QR',
    desc: 'Place the artwork QR inside the camera view.',
    loading: 'Opening camera...',
    scanning: 'Looking for a QR code...',
    permission: 'Camera permission is required to scan QR codes.',
    decoderError: 'Could not load the QR scanner. Please open the QR link directly.',
    close: 'Close',
  },
};

let jsQrPromise;

const loadJsQr = () => {
  if (window.jsQR) return Promise.resolve(window.jsQR);

  if (!jsQrPromise) {
    jsQrPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = JS_QR_CDN;
      script.async = true;
      script.onload = () => {
        if (window.jsQR) resolve(window.jsQR);
        else reject(new Error('jsQR global was not found'));
      };
      script.onerror = () => reject(new Error('Failed to load jsQR'));
      document.head.appendChild(script);
    });
  }

  return jsQrPromise;
};

export default function QRScannerPopup({ language = 'ko', onClose, onDetected }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(0);
  const detectedRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusText, setStatusText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const text = copy[language] || copy.ko;

  useEffect(() => {
    let isCancelled = false;

    const stopCamera = () => {
      window.cancelAnimationFrame(frameRef.current);
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    };

    const decodeWithCanvas = (video, jsQr) => {
      const canvas = canvasRef.current;
      if (!canvas || video.videoWidth === 0 || video.videoHeight === 0) return '';

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const context = canvas.getContext('2d');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      return jsQr(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      })?.data || '';
    };

    const startScanner = async () => {
      let detector = null;
      let jsQr = null;

      try {
        if ('BarcodeDetector' in window) {
          detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        } else {
          jsQr = await loadJsQr();
        }
      } catch (error) {
        console.error('QR 디코더 로드 실패:', error);
        setIsLoading(false);
        setErrorMessage(text.decoderError);
        return;
      }

      try {
        setStatusText(text.loading);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
          },
          audio: false,
        });

        if (isCancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();

        setIsLoading(false);
        setStatusText(text.scanning);

        const scanFrame = async () => {
          if (isCancelled || detectedRef.current) return;

          let rawValue = '';

          try {
            if (video.readyState >= 2) {
              if (detector) {
                const codes = await detector.detect(video);
                rawValue = codes[0]?.rawValue || '';
              } else if (jsQr) {
                rawValue = decodeWithCanvas(video, jsQr);
              }
            }
          } catch (error) {
            console.error('QR 프레임 판독 실패:', error);
          }

          if (rawValue) {
            detectedRef.current = true;
            stopCamera();
            onDetected(rawValue);
            return;
          }

          frameRef.current = window.requestAnimationFrame(scanFrame);
        };

        frameRef.current = window.requestAnimationFrame(scanFrame);
      } catch (error) {
        console.error('QR 카메라 스캔 시작 실패:', error);
        setIsLoading(false);
        setStatusText('');
        setErrorMessage(text.permission);
      }
    };

    startScanner();

    return () => {
      isCancelled = true;
      stopCamera();
    };
  }, [onDetected, text.decoderError, text.loading, text.permission, text.scanning]);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/70 p-5 backdrop-blur-md">
      <div className="relative w-full max-w-sm overflow-hidden rounded-[28px] border border-white/15 bg-slate-950 text-white shadow-[0_24px_64px_rgba(15,23,42,0.45)]">
        <button
          type="button"
          onClick={onClose}
          aria-label={text.close}
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/12 text-white backdrop-blur transition active:scale-95"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="px-5 pb-4 pt-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-sky-200">
              <Camera className="h-5 w-5" />
            </div>
            <div className="pr-10">
              <h2 className="text-xl font-bold">{text.title}</h2>
              <p className="text-[13px] leading-5 text-slate-300">{text.desc}</p>
            </div>
          </div>

          <div className="relative aspect-square overflow-hidden rounded-[22px] border border-white/15 bg-black">
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              muted
              playsInline
            />
            <canvas ref={canvasRef} className="hidden" />
            <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/80 shadow-[0_0_0_999px_rgba(15,23,42,0.34)]" />
            {isLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/70 text-sm text-slate-100">
                <Loader2 className="mb-2 h-6 w-6 animate-spin" />
                {statusText || text.loading}
              </div>
            )}
          </div>

          {!errorMessage && statusText && !isLoading && (
            <p className="mt-4 text-center text-[13px] leading-5 text-slate-300">
              {statusText}
            </p>
          )}

          {errorMessage && (
            <p className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-[13px] leading-5 text-amber-100">
              {errorMessage}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
