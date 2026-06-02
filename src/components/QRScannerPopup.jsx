import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, Loader2, RotateCcw, ScanLine, X } from 'lucide-react';

const copy = {
  ko: {
    title: 'QR 스캔',
    desc: '작품 QR을 화면 안에 맞춰 주세요.',
    loading: '카메라를 여는 중...',
    scanning: 'QR을 찾는 중...',
    noCamera: '이 브라우저에서 카메라를 사용할 수 없어요. QR 링크나 코드를 직접 입력해 주세요.',
    permission: '카메라 권한을 허용해야 QR을 스캔할 수 있어요.',
    directLabel: 'QR 링크 또는 코드',
    directPlaceholder: '예: https://.../?symbol=heart_kymin',
    submit: '적용',
    retry: '다시 시도',
    close: '닫기',
  },
  en: {
    title: 'Scan QR',
    desc: 'Place the artwork QR inside the camera view.',
    loading: 'Opening camera...',
    scanning: 'Looking for a QR code...',
    noCamera: 'This browser cannot use the camera. Enter the QR link or code directly.',
    permission: 'Camera permission is required to scan QR codes.',
    directLabel: 'QR link or code',
    directPlaceholder: 'Example: https://.../?symbol=heart_kymin',
    submit: 'Apply',
    retry: 'Try again',
    close: 'Close',
  },
};

const buildCameraConstraints = () => ({
  audio: false,
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
});

export default function QRScannerPopup({ language = 'ko', onClose, onDetected }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(0);
  const detectedRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusText, setStatusText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [manualValue, setManualValue] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const text = copy[language] || copy.ko;

  useEffect(() => {
    let isCancelled = false;

    const stopCamera = () => {
      window.cancelAnimationFrame(frameRef.current);
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    };

    const decodeWithCanvas = video => {
      const canvas = canvasRef.current;
      if (!canvas || video.videoWidth === 0 || video.videoHeight === 0) return '';

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const context = canvas.getContext('2d');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      return jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth',
      })?.data || '';
    };

    const getBarcodeDetector = () => {
      if (!('BarcodeDetector' in window)) return null;

      try {
        return new window.BarcodeDetector({ formats: ['qr_code'] });
      } catch (error) {
        console.error('QR BarcodeDetector init failed:', error);
        return null;
      }
    };

    const startScanner = async () => {
      const video = videoRef.current;
      const detector = getBarcodeDetector();

      detectedRef.current = false;
      setIsLoading(true);
      setErrorMessage('');
      setStatusText(text.loading);

      if (!navigator.mediaDevices?.getUserMedia || !video) {
        setIsLoading(false);
        setStatusText('');
        setErrorMessage(text.noCamera);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia(buildCameraConstraints());

        if (isCancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        streamRef.current = stream;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        await video.play();

        setIsLoading(false);
        setStatusText(text.scanning);

        const scanFrame = async () => {
          if (isCancelled || detectedRef.current) return;

          let rawValue = '';

          try {
            if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
              if (detector) {
                const codes = await detector.detect(video);
                rawValue = codes[0]?.rawValue || '';
              }

              if (!rawValue) {
                rawValue = decodeWithCanvas(video);
              }
            }
          } catch (error) {
            console.error('QR frame decode failed:', error);
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
        console.error('QR camera start failed:', error);
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
  }, [onDetected, retryKey, text.loading, text.noCamera, text.permission, text.scanning]);

  const handleManualSubmit = event => {
    event.preventDefault();
    const value = manualValue.trim();
    if (value) onDetected(value);
  };

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

        <div className="px-5 pb-5 pt-6">
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
              autoPlay
              muted
              playsInline
              className="h-full w-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />
            <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/80 shadow-[0_0_0_999px_rgba(15,23,42,0.34)]" />
            <ScanLine className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-white/80" />
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
            <div className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-[13px] leading-5 text-amber-100">
              <p>{errorMessage}</p>
              <button
                type="button"
                onClick={() => setRetryKey(key => key + 1)}
                className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-2 text-xs font-semibold text-white transition active:scale-95"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {text.retry}
              </button>
            </div>
          )}

          <form onSubmit={handleManualSubmit} className="mt-4">
            <label className="mb-2 block text-[12px] font-semibold text-slate-300">
              {text.directLabel}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualValue}
                onChange={event => setManualValue(event.target.value)}
                placeholder={text.directPlaceholder}
                className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-[13px] text-white outline-none placeholder:text-slate-500 focus:border-sky-300/60"
              />
              <button
                type="submit"
                disabled={!manualValue.trim()}
                className="rounded-2xl bg-sky-300 px-4 py-2 text-[13px] font-bold text-slate-950 transition active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
              >
                {text.submit}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
