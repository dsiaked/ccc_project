import React, { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';

const copy = {
  ko: {
    title: 'QR 스캔',
    desc: '작품 옆 QR을 화면 안에 맞춰 주세요.',
    loading: '카메라를 여는 중...',
    unsupported: '이 브라우저는 카메라 QR 스캔을 지원하지 않아요. QR 링크를 직접 열어 주세요.',
    permission: '카메라 권한을 허용해야 QR을 스캔할 수 있어요.',
    close: '닫기',
  },
  en: {
    title: 'Scan QR',
    desc: 'Place the artwork QR inside the camera view.',
    loading: 'Opening camera...',
    unsupported: 'This browser does not support camera QR scanning. Please open the QR link directly.',
    permission: 'Camera permission is required to scan QR codes.',
    close: 'Close',
  },
};

export default function QRScannerPopup({ language = 'ko', onClose, onDetected }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(0);
  const detectedRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const text = copy[language] || copy.ko;

  useEffect(() => {
    let isCancelled = false;

    const stopCamera = () => {
      window.cancelAnimationFrame(frameRef.current);
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    };

    const startScanner = async () => {
      if (!('BarcodeDetector' in window)) {
        setIsLoading(false);
        setErrorMessage(text.unsupported);
        return;
      }

      try {
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

        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        setIsLoading(false);

        const scanFrame = async () => {
          if (isCancelled || detectedRef.current) return;

          if (video.readyState >= 2) {
            const codes = await detector.detect(video);
            const rawValue = codes[0]?.rawValue;

            if (rawValue) {
              detectedRef.current = true;
              stopCamera();
              onDetected(rawValue);
              return;
            }
          }

          frameRef.current = window.requestAnimationFrame(scanFrame);
        };

        frameRef.current = window.requestAnimationFrame(scanFrame);
      } catch (error) {
        console.error('QR 카메라 스캔 시작 실패:', error);
        setIsLoading(false);
        setErrorMessage(text.permission);
      }
    };

    startScanner();

    return () => {
      isCancelled = true;
      stopCamera();
    };
  }, [onDetected, text.permission, text.unsupported]);

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
            <div>
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
            <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/80 shadow-[0_0_0_999px_rgba(15,23,42,0.34)]" />
            {isLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/70 text-sm text-slate-100">
                <Loader2 className="mb-2 h-6 w-6 animate-spin" />
                {text.loading}
              </div>
            )}
          </div>

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
