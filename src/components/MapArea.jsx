import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Divide, Heart, Minus, Plus, RotateCcw } from 'lucide-react';

const MAP_BASE_WIDTH = 345;
const MIN_ZOOM = 1;
const MAX_ZOOM = 2.6;
const ZOOM_STEP = 0.35;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const CustomCrossIcon = ({ size = 14, color = "currentColor", strokeWidth = "3" }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke={color} 
    strokeWidth={strokeWidth} 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    style={{ width: size, height: size }}
  >
    <line x1="12" y1="2.5" x2="12" y2="21.5" />
    <line x1="6.5" y1="8" x2="17.5" y2="8" />
  </svg>
);

// eslint-disable-next-line react-refresh/only-export-components
export const DEFAULT_MAP_PINS = [
  {
    id: 'heart_kymin',
    label: '김규민',
    type: 'heart',
    pinTop: '27.16%',
    pinLeft: '46.38%',
    textTop: '28.4%',
    textLeft: '35.36%',
    color: '#ff8b8b', // 피그마 핑크 하트
    borderColor: '#ff9d9d',
  },
  {
    id: 'heart_eunchae',
    label: '이은채',
    type: 'heart',
    pinTop: '15.0%',
    pinLeft: '80.0%',
    textTop: '15.0%',
    textLeft: '70.0%',
    color: '#ff8b8b',
    borderColor: '#ff9d9d',
  },
  {
    id: 'cross_jihoon',
    label: '홍지훈',
    type: 'cross',
    pinTop: '18.52%',
    pinLeft: '36.23%',
    textTop: '19.76%',
    textLeft: '28.00%',
    color: '#84cc16', // 피그마 초록 십자가 테마 색상 적용
    borderColor: '#bef264',
  },
  {
    id: 'cross',
    label: '서겸준',
    type: 'cross',
    pinTop: '31.48%',
    pinLeft: '56.81%',
    textTop: '32.72%',
    textLeft: '62.03%',
    color: '#84cc16', // 피그마 초록 십자가
    borderColor: '#bef264',
  },
  {
    id: 'divide_kyeomjun',
    label: '서겸준',
    type: 'divide',
    pinTop: '41.98%',
    pinLeft: '60.87%',
    textTop: '43.52%',
    textLeft: '67.25%',
    color: '#fb923c', // 피그마 주황 나누기
    borderColor: '#ffedd5',
  },
  {
    id: 'heart_yewon',
    label: '손예원',
    type: 'heart',
    pinTop: '49.38%',
    pinLeft: '53.04%',
    textTop: '49.38%',
    textLeft: '42.61%',
    color: '#ff8b8b',
    borderColor: '#ff9d9d',
  },
  {
    id: 'divide_yewon',
    label: '손예원',
    type: 'divide',
    pinTop: '71.91%',
    pinLeft: '43.77%',
    textTop: '77.78%',
    textLeft: '40.58%',
    color: '#fb923c',
    borderColor: '#ffedd5',
  },
  {
    id: 'heart_eunhye',
    label: '김은혜',
    type: 'heart',
    pinTop: '61.42%',
    pinLeft: '47.25%',
    textTop: '60.8%',
    textLeft: '35.65%',
    color: '#ff8b8b',
    borderColor: '#ff9d9d',
  },
  {
    id: 'heart_jihoon',
    label: '홍지훈',
    type: 'heart',
    pinTop: '71.91%',
    pinLeft: '64.93%',
    textTop: '72.53%',
    textLeft: '74.78%',
    color: '#ff8b8b',
    borderColor: '#ff9d9d',
  },
  {
    id: 'question',
    label: null,
    type: 'question',
    pinTop: '58.33%',
    pinLeft: '59.71%',
    color: '#60a5fa', // 피그마 하늘색 물음표
    borderColor: '#dbeafe',
  }
];

const MapPinMarker = React.memo(function MapPinMarker({
  pin,
  isDiscovered,
  isHighlighted,
  isQuestionUnlocked,
  editable,
  pinMetrics,
  onSymbolClick,
  onPinPointerDown,
}) {
  const { id, type, pinTop, pinLeft, color, borderColor } = pin;

  let IconComponent = null;
  if (type === 'heart') {
    IconComponent = <Heart className="fill-current" style={{ width: pinMetrics.icon, height: pinMetrics.icon }} />;
  } else if (type === 'cross') {
    IconComponent = <CustomCrossIcon size={pinMetrics.icon} color="currentColor" strokeWidth="3.2" />;
  } else if (type === 'divide') {
    IconComponent = <Divide className="stroke-[2.5]" style={{ width: pinMetrics.icon, height: pinMetrics.icon }} />;
  } else if (type === 'question') {
    IconComponent = (
      <span
        className={[
          'font-bold leading-none select-none',
          isQuestionUnlocked && !isDiscovered ? 'animate-bounce' : '',
        ].join(' ')}
        style={{ fontSize: pinMetrics.questionText }}
      >
        ?
      </span>
    );
  }

  let finalColor = color;
  let finalBorderColor = borderColor;
  let extraPinClass = '';

  if (id === 'question') {
    if (!isQuestionUnlocked) {
      finalColor = '#38bdf8';
      finalBorderColor = '#dbeafe';
      extraPinClass = 'opacity-75';
    } else if (!isDiscovered) {
      finalColor = '#0284c7';
      finalBorderColor = '#bae6fd';
      extraPinClass = 'animate-pulse ring-2 ring-sky-400 ring-offset-1';
    } else {
      finalColor = '#6b21a8';
      finalBorderColor = '#e9d5ff';
      extraPinClass = 'ring-2 ring-purple-400 ring-offset-1';
    }
  } else if (isDiscovered) {
    extraPinClass = 'animate-pulse ring-2 ring-purple-400 ring-offset-1';
  }

  return (
    <button
      type="button"
      aria-label={`${type} symbol`}
      data-map-pin-id={id}
      className={[
        'absolute flex items-center justify-center cursor-pointer transition-all duration-300 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 rounded-full',
        isHighlighted ? 'map-pin-button-highlight' : '',
      ].join(' ')}
      style={{
        top: pinTop,
        left: pinLeft,
        width: pinMetrics.touch,
        height: pinMetrics.touch,
        transform: 'translate(-50%, -50%)',
        zIndex: isHighlighted ? 30 : 20,
        '--pin-hover-scale': pinMetrics.hoverScale,
      }}
      onClick={() => {
        if (!editable) onSymbolClick(id);
      }}
      onPointerDown={event => onPinPointerDown(event, id)}
    >
      <div className="relative">
        <div
          className={`rounded-full flex items-center justify-center bg-white transition-all ${extraPinClass} ${isHighlighted ? 'map-pin-highlight' : ''}`}
          style={{
            borderColor: finalBorderColor,
            borderWidth: pinMetrics.border,
            boxShadow: `0 ${pinMetrics.shadowY}px ${pinMetrics.shadowBlur}px rgba(0,0,0,0.1)`,
            color: finalColor,
            width: pinMetrics.marker,
            height: pinMetrics.marker,
          }}
        >
          {IconComponent}
        </div>
      </div>
    </button>
  );
});

export default function MapArea({ symbols, onSymbolClick, isQuestionUnlocked, zoom = 1, pins = DEFAULT_MAP_PINS, editable = false, onPinMove, highlightedPinId = null }) {
  const mapRef = useRef(null);
  const dragRef = useRef(null);
  const interactionRef = useRef({ pan: { x: 0, y: 0 }, viewZoom: 1 });
  const [mapScale, setMapScale] = useState(1);
  const [mapSize, setMapSize] = useState({ width: MAP_BASE_WIDTH, height: 324 });
  const [zoomLevel, setZoomLevel] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const viewZoom = clamp(zoomLevel * zoom, MIN_ZOOM, MAX_ZOOM);
  const zoomProgress = (viewZoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM);
  const zoomPinScale = clamp(1 / Math.pow(viewZoom, 1.15), 0.32, 1);
  const pinScale = clamp(mapScale * zoomPinScale, 0.36, 1.75);
  const pinMetrics = useMemo(() => ({
    touch: Math.round(36 * pinScale),
    marker: Math.round(24 * pinScale),
    icon: Math.round(11 * pinScale),
    questionText: Math.round(11 * pinScale),
    border: Math.max(1.25, 1.6 * pinScale),
    shadowY: Math.max(1.5, 1.6 * pinScale),
    shadowBlur: Math.max(4, 4 * pinScale),
    hoverScale: 1 + (1 - zoomProgress) * 0.05,
  }), [pinScale, zoomProgress]);

  interactionRef.current = { pan, viewZoom };

  const handlePinPointerDown = useCallback((event, id) => {
    if (!editable) return;
    event.stopPropagation();
    event.preventDefault();

    const mapElement = mapRef.current;
    if (!mapElement) return;

    // 포인터 캡처 활성화로 맵 밖으로 나가도 드래그 유지
    event.currentTarget.setPointerCapture(event.pointerId);

    const handlePointerMove = (moveEvent) => {
      const rect = mapElement.getBoundingClientRect();
      
      // 마우스 위치 (rect 내 상대 좌표)
      const mouseX = moveEvent.clientX - rect.left;
      const mouseY = moveEvent.clientY - rect.top;

      // 줌(scale) 및 패닝(translate) 오프셋 보정 계산
      // transform: translate(pan.x, pan.y) scale(viewZoom) origin: center center
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const { pan: currentPan, viewZoom: currentViewZoom } = interactionRef.current;
      const correctedX = (mouseX - centerX - currentPan.x) / currentViewZoom + centerX;
      const correctedY = (mouseY - centerY - currentPan.y) / currentViewZoom + centerY;

      // 백분율 좌표 계산
      const leftPercent = clamp((correctedX / rect.width) * 100, 0, 100).toFixed(2) + '%';
      const topPercent = clamp((correctedY / rect.height) * 100, 0, 100).toFixed(2) + '%';

      if (onPinMove) {
        onPinMove(id, leftPercent, topPercent);
      }
    };

    const handlePointerUp = (upEvent) => {
      try {
        upEvent.currentTarget?.releasePointerCapture(upEvent.pointerId);
      } catch {
        // Pointer capture can already be released by the browser.
      }
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, [editable, onPinMove]);

  const getClampedPan = useCallback((nextPan, nextZoom = viewZoom, nextMapSize = mapSize) => {
    if (nextZoom <= 1) return { x: 0, y: 0 };

    const maxX = (nextMapSize.width * (nextZoom - 1)) / 2;
    const maxY = (nextMapSize.height * (nextZoom - 1)) / 2;

    return {
      x: clamp(nextPan.x, -maxX, maxX),
      y: clamp(nextPan.y, -maxY, maxY),
    };
  }, [mapSize, viewZoom]);

  const setZoom = nextZoom => {
    const clampedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    setZoomLevel(clampedZoom);
    setPan(currentPan => getClampedPan(currentPan, clampedZoom));
  };

  const resetZoom = () => {
    setZoomLevel(1);
    setPan({ x: 0, y: 0 });
  };

  const isInteractiveControl = target => target.closest('button');

  useEffect(() => {
    const mapElement = mapRef.current;
    if (!mapElement) return undefined;

    const getClampedPanForSize = (nextPan, nextZoom, nextMapSize) => {
      if (nextZoom <= 1) return { x: 0, y: 0 };

      const maxX = (nextMapSize.width * (nextZoom - 1)) / 2;
      const maxY = (nextMapSize.height * (nextZoom - 1)) / 2;

      return {
        x: clamp(nextPan.x, -maxX, maxX),
        y: clamp(nextPan.y, -maxY, maxY),
      };
    };

    const updateScale = () => {
      const { width, height } = mapElement.getBoundingClientRect();
      const nextMapSize = { width, height };
      const nextMapScale = width / MAP_BASE_WIDTH;
      setMapScale(currentScale => (currentScale === nextMapScale ? currentScale : nextMapScale));
      setMapSize(currentSize => (
        currentSize.width === nextMapSize.width && currentSize.height === nextMapSize.height
          ? currentSize
          : nextMapSize
      ));
      setPan(currentPan => {
        const nextPan = getClampedPanForSize(currentPan, viewZoom, nextMapSize);
        return currentPan.x === nextPan.x && currentPan.y === nextPan.y ? currentPan : nextPan;
      });
    };

    updateScale();

    if (!window.ResizeObserver) {
      window.addEventListener('resize', updateScale);
      return () => window.removeEventListener('resize', updateScale);
    }

    const observer = new ResizeObserver(updateScale);
    observer.observe(mapElement);
    return () => observer.disconnect();
  }, [viewZoom]);

  const handlePointerDown = event => {
    if (viewZoom <= 1 || isInteractiveControl(event.target)) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      pan,
    };
    setIsDragging(true);
  };

  const handlePointerMove = event => {
    const dragState = dragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const nextPan = {
      x: dragState.pan.x + event.clientX - dragState.startX,
      y: dragState.pan.y + event.clientY - dragState.startY,
    };
    setPan(getClampedPan(nextPan));
  };

  const endDrag = event => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      setIsDragging(false);
    }
  };

  const handleDoubleClick = event => {
    if (isInteractiveControl(event.target)) return;
    setZoom(viewZoom >= MAX_ZOOM ? 1 : viewZoom + ZOOM_STEP);
  };

  const handleWheel = event => {
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    setZoom(viewZoom + direction * ZOOM_STEP);
  };

  return (
    <div
      ref={mapRef}
      className={[
        'w-full aspect-[345/324] border-2 border-[#F8CFD0]/70 rounded-2xl relative overflow-hidden shadow-[0_10px_24px_rgba(248,207,208,0.26)] bg-white/90 backdrop-blur-sm select-none',
        viewZoom > 1 ? isDragging ? 'cursor-grabbing' : 'cursor-grab' : 'cursor-zoom-in',
      ].join(' ')}
      onDoubleClick={handleDoubleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onWheel={handleWheel}
      style={{ touchAction: viewZoom > 1 ? 'none' : 'pan-y' }}
    >
      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${viewZoom})`,
          transformOrigin: 'center center',
          transition: isDragging ? 'none' : 'transform 180ms ease-out',
        }}
      >
        {/* Figma Rectangle 349 based Custom Styled Map */}
        <svg 
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 345 324" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
        >
        <g id="Mask group">
          <mask id="mask0_4_32" style={{ maskType: 'alpha' }} maskUnits="userSpaceOnUse" x="0" y="0" width="345" height="324">
            <rect id="Rectangle 349" x="0.5" y="0.5" width="344" height="323" rx="24.5" fill="url(#paint0_radial_4_32)" />
          </mask>
          <g mask="url(#mask0_4_32)">
            {/* Background Base (피그마 원본 그라데이션으로 바탕색 지정) */}
            <rect width="345" height="324" fill="url(#paint0_radial_4_32)" />
            
            {/* 구역 1 (피그마 파스텔 로즈 핑크 #FFE2E2 + 화이트 경계선) */}
            <path 
              id="Rectangle 362" 
              d="M168.03 -174.716C174.117 -196.381 199.617 -204.246 216.488 -189.66L355.965 -69.082C368.259 -58.4533 370.727 -39.8906 361.628 -26.4847L288.018 81.9666C278.403 96.1325 259.449 99.3647 245.682 89.1859L137.866 9.4666C127.183 1.56761 122.443 -12.4583 126.08 -25.4051L168.03 -174.716Z" 
              fill="#FFE2E2" 
              stroke="#ffffff"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeOpacity="0.95"
            />
            
            {/* 구역 2 (피그마 파스텔 로즈 핑크 #FFE2E2 + 화이트 경계선) */}
            <path 
              id="Rectangle 363" 
              d="M-156.752 106.573C-165.946 96.6464 -168.007 81.9336 -161.864 70.082L-63.7451 -119.224C-56.2892 -133.609 -39.1315 -139.426 -24.4152 -132.557L92.7783 -77.8612C107.414 -71.0306 114.714 -53.9461 109.555 -38.5975L19.0279 230.744C11.6285 252.759 -16.0489 258.491 -31.9666 241.304L-156.752 106.573Z" 
              fill="#FFE2E2" 
              stroke="#ffffff"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeOpacity="0.95"
            />
            
            {/* 구역 3 (피그마 파스텔 로즈 핑크 #FFE2E2 + 화이트 경계선) */}
            <path 
              id="Rectangle 364" 
              d="M208.385 501.501C205.878 522.901 183.354 534.889 164.375 524.924L0.331887 438.788C-14.0333 431.245 -20.5338 413.803 -14.5917 398.746L34.9946 273.094C40.9157 258.089 57.2114 250.478 72.4679 255.59L206.471 300.494C220.653 305.246 229.688 319.614 227.931 334.617L208.385 501.501Z" 
              fill="#FFE2E2" 
              stroke="#ffffff"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeOpacity="0.95"
            />
            
            {/* 구역 4 (피그마 파스텔 로즈 핑크 #FFE2E2 + 화이트 경계선) */}
            <path 
              id="Vector 20" 
              d="M297.837 207.915C310.163 173.397 294.705 142.932 287.314 134.172L350.451 159.276L353.458 336.181L258 341.673C266.143 311.47 285.51 242.433 297.837 207.915Z" 
              fill="#FFE2E2" 
              stroke="#ffffff"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeOpacity="0.95"
            />
            
            {/* 구역 5 (피그마 파스텔 로즈 핑크 #FFE2E2 + 화이트 경계선) */}
            <path 
              id="Rectangle 365" 
              d="M345.239 29.8853L399.566 56.9349L361.823 146.694L293 116.573L345.239 29.8853Z" 
              fill="#FFE2E2" 
              stroke="#ffffff"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeOpacity="0.95"
            />
            
            {/* 큰 강 / 메인 도로 (피그마 연한 파란색 강줄기 #DFFBFF) */}
            <path 
              id="Subtract" 
              d="M71.1927 154.888C83.4572 159.185 105.41 164.462 126.812 164.059C127.673 166.813 129.77 169.096 132.63 169.991C132.953 170.092 133.278 170.17 133.603 170.231C135.451 175.921 138.006 182.702 141.229 189.604C145.962 199.742 153.738 216.167 161.662 224.704C155.041 229.815 149.314 233.496 146.372 235.385L146.345 235.403C136.574 241.679 139.204 240.11 135.446 241.679C131.687 243.248 126.802 244.973 113.273 240.894C99.7432 236.815 59.1559 228.532 54.2698 227.165C49.384 225.799 48.968 221.674 50.887 215.79C51.7253 213.22 60.9865 185.456 71.1927 154.888ZM163.333 155.319C166.926 164.179 173.679 172.51 184.924 179.142C183.989 185.723 185.647 192.041 189.175 196.351C182.746 206.162 173.968 214.683 165.877 221.344C158.419 213.684 150.692 197.338 145.957 187.198C143.024 180.916 140.668 174.744 138.919 169.482C141.073 168.408 142.802 166.426 143.54 163.852C143.693 163.319 143.794 162.782 143.852 162.247C150.766 160.796 157.58 158.448 163.333 155.319ZM172.463 109.675C175.693 113.484 180.923 116.883 189.189 118.905C190.326 119.127 191.939 119.754 193.286 121.171C196.539 132.951 198.631 145.637 198.761 160.432C193.436 162.346 188.731 167.131 186.319 173.64C171.688 164.564 166.263 152.568 165.365 141.008C164.451 129.249 168.21 117.648 172.463 109.675ZM138.828 66.7348C143.81 66.6014 152.489 66.8706 161.102 70.2494C163.348 72.0972 169.106 77.6975 170.774 83.2094C172.578 89.1715 168.388 87.1319 167.767 94.5844C167.53 97.4298 167.793 100.961 169.278 104.502C164.128 113.124 158.999 127.025 160.12 141.453C160.344 144.331 160.817 147.216 161.579 150.072C156.207 153.108 149.613 155.433 142.843 156.858C141.777 154.811 139.967 153.186 137.659 152.464C133.034 151.018 128.16 153.75 126.758 158.569C106.17 158.964 84.8449 153.873 72.9232 149.703C85.6111 111.705 99.0986 71.3609 99.3685 70.6566C99.8699 69.349 102.074 66.7349 106.884 66.7348C111.694 66.7348 129.055 66.9963 138.828 66.7348Z" 
              fill="#DFFBFF" 
              stroke="#ffffff"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeOpacity="0.95"
            />
            
            {/* 세부 도로 1 (피그마 연한 민트빛 #F0FFF5) */}
            <path 
              id="Vector 16" 
              d="M160.249 60.851C163.255 62.8126 168.79 66.7351 182.422 83.2094C196.054 99.6838 202.718 129.103 204.597 140.086C206.476 151.069 206.851 151.461 206.851 161.267C206.851 171.074 197.832 195.393 189.564 206.769C181.296 218.144 162.129 231.873 154.989 237.364C147.848 242.856 142.038 249.524 137.326 253.839C132.613 258.154 130.185 259.527 136.949 261.292C143.713 263.057 245.183 298.556 248.942 298.948C252.7 299.34 253.609 296.202 254.955 292.279C256.3 288.357 264.519 259.595 268.692 243.768C272.865 227.941 274.873 222.066 277.88 209.907C280.886 197.747 282.389 187.94 282.013 183.626C281.638 179.311 281.638 169.112 279.521 161.353C277.404 153.593 271.208 135.971 253.076 122.435C234.944 108.898 164.383 58.4978 161.752 56.9286C159.121 55.3594 157.242 58.8895 160.249 60.851Z" 
              fill="#F0FFF5" 
            />
            
            {/* 세부 도로 2 (피그마 연한 민트빛 #F0FFF5) */}
            <path 
              id="Vector 17" 
              d="M112.522 47.122L108.45 54.5748C106.947 58.3404 108.45 58.1154 111.081 58.4973C124.235 60.4068 137.012 61.1913 141.898 58.4973C146.008 56.2309 147.248 52.7987 146.408 51.0445C145.656 49.4756 150.104 52.2213 137.702 43.1995C125.593 34.3909 115.779 42.2842 112.522 47.122Z" 
              fill="#F0FFF5" 
            />
          </g>
        </g>
        <defs>
          {/* 피그마 원본: 화이트에서 부드러운 핑크 #F8CFD0로 변하는 그라데이션 */}
          <radialGradient id="paint0_radial_4_32" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(172.5 122.013) rotate(90) scale(263.506 280.585)">
            <stop stopColor="#ffffff" />
            <stop offset="1" stopColor="#F8CFD0" />
          </radialGradient>
        </defs>
        </svg>

        {/* Grid background (아주 은은한 그리드 가이드) */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(107,33,168,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(107,33,168,0.02)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

        {/* Markers (피그마 맵 레이아웃과 일치하는 원형 심볼 및 아티스트 이름 핀 목록) */}
        {pins.map(pin => (
          <MapPinMarker
            key={pin.id}
            pin={pin}
            isDiscovered={!!symbols[pin.id]}
            isHighlighted={highlightedPinId === pin.id}
            isQuestionUnlocked={isQuestionUnlocked}
            editable={editable}
            pinMetrics={pinMetrics}
            onSymbolClick={onSymbolClick}
            onPinPointerDown={handlePinPointerDown}
          />
        ))}
      </div>

      <div className="absolute top-3 right-3 z-30 flex flex-col gap-2" data-map-control="true">
        <button
          type="button"
          aria-label="지도 확대"
          onClick={() => setZoom(viewZoom + ZOOM_STEP)}
          className="w-9 h-9 rounded-full bg-white/95 border border-slate-200 shadow-sm flex items-center justify-center text-slate-800 active:scale-95 disabled:opacity-45"
          disabled={viewZoom >= MAX_ZOOM}
        >
          <Plus className="w-4.5 h-4.5" />
        </button>
        <button
          type="button"
          aria-label="지도 축소"
          onClick={() => setZoom(viewZoom - ZOOM_STEP)}
          className="w-9 h-9 rounded-full bg-white/95 border border-slate-200 shadow-sm flex items-center justify-center text-slate-800 active:scale-95 disabled:opacity-45"
          disabled={viewZoom <= MIN_ZOOM}
        >
          <Minus className="w-4.5 h-4.5" />
        </button>
        {viewZoom > 1 && (
          <button
            type="button"
            aria-label="지도 원래 크기로"
            onClick={resetZoom}
            className="w-9 h-9 rounded-full bg-white/95 border border-slate-200 shadow-sm flex items-center justify-center text-slate-800 active:scale-95"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
