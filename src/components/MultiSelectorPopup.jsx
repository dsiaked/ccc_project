import React from 'react';
import { X, Lock, Heart, Divide, Sparkles } from 'lucide-react';

const CustomCrossIcon = ({ className = "w-5 h-5", color = "currentColor", strokeWidth = "2.5" }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke={color} 
    strokeWidth={strokeWidth} 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <line x1="12" y1="2.5" x2="12" y2="21.5" />
    <line x1="6.5" y1="8" x2="17.5" y2="8" />
  </svg>
);

const ARTIST_LIST = {
  heart: [
    { key: 'heart_kymin', name: '김규민', color: '#ff8b8b', borderColor: '#ff9d9d', type: 'heart' },
    { key: 'heart_yewon', name: '손예원', color: '#ff8b8b', borderColor: '#ff9d9d', type: 'heart' },
    { key: 'heart_eunhye', name: '김은혜', color: '#ff8b8b', borderColor: '#ff9d9d', type: 'heart' },
    { key: 'heart_jihoon', name: '홍지훈', color: '#ff8b8b', borderColor: '#ff9d9d', type: 'heart' },
    { key: 'heart_eunchae', name: '이은채', color: '#ff8b8b', borderColor: '#ff9d9d', type: 'heart' }
  ],
  divide: [
    { key: 'divide_kyeomjun', name: '서겸준', color: '#fb923c', borderColor: '#ffedd5', type: 'divide' },
    { key: 'divide_yewon', name: '손예원', color: '#fb923c', borderColor: '#ffedd5', type: 'divide' }
  ],
  cross: [
    { key: 'cross', name: '서겸준', color: '#84cc16', borderColor: '#bef264', type: 'cross' },
    { key: 'cross_jihoon', name: '홍지훈', color: '#84cc16', borderColor: '#bef264', type: 'cross' }
  ]
};

const CATEGORY_THEMES = {
  heart: {
    panel: 'border-[#F8CFD0] shadow-[0_20px_50px_rgba(248,207,208,0.4)]',
    iconWrap: 'bg-[#FFE2E2]',
    icon: 'text-pink-500 fill-pink-500',
    badge: 'bg-[#FFE2E2]/60 border-[#F8CFD0]/80',
    badgeIcon: 'text-pink-500',
    badgeText: 'text-pink-700',
    card: 'border-[#F8CFD0]',
  },
  divide: {
    panel: 'border-orange-200 shadow-[0_20px_50px_rgba(251,146,60,0.26)]',
    iconWrap: 'bg-orange-50',
    icon: 'text-orange-500',
    badge: 'bg-orange-50 border-orange-200',
    badgeIcon: 'text-orange-500',
    badgeText: 'text-orange-700',
    card: 'border-orange-200',
  },
  cross: {
    panel: 'border-lime-200 shadow-[0_20px_50px_rgba(132,204,22,0.24)]',
    iconWrap: 'bg-lime-50',
    icon: 'text-lime-600',
    badge: 'bg-lime-50 border-lime-200',
    badgeIcon: 'text-lime-600',
    badgeText: 'text-lime-700',
    card: 'border-lime-200',
  },
};

export default function MultiSelectorPopup({ id, symbols, onClose, onSelectArtist }) {
  const artists = ARTIST_LIST[id] || [];
  const categoryLabel = id === 'heart' ? '하트' : id === 'divide' ? '나누기' : '십자가';
  const theme = CATEGORY_THEMES[id] || CATEGORY_THEMES.heart;
  
  const totalCount = artists.length;
  const discoveredCount = artists.filter(a => symbols[a.key]).length;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-fade-in">
      <div className={`w-full max-w-sm bg-white/95 rounded-[32px] border-[3px] ${theme.panel} overflow-hidden relative p-6 flex flex-col items-center`}>
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 bg-gray-100 hover:bg-gray-200 transition-colors rounded-full flex items-center justify-center text-gray-500 hover:text-gray-800"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header Icon */}
        <div className={`w-14 h-14 ${theme.iconWrap} border-2 border-white rounded-2xl flex items-center justify-center shadow-md mb-4 animate-bounce`}>
          {id === 'heart' ? (
            <Heart className={`w-7 h-7 ${theme.icon}`} />
          ) : id === 'divide' ? (
            <Divide className={`w-7 h-7 ${theme.icon} stroke-[2.5]`} />
          ) : (
            <CustomCrossIcon className={`w-7 h-7 ${theme.icon}`} strokeWidth="3" />
          )}
        </div>

        {/* Title */}
        <h3 className="font-['Cafe24_Ssurround'] font-bold text-2xl text-gray-800 text-center mb-1">
          {categoryLabel} 심볼 작품 리스트
        </h3>
        
        {/* Progress Badge */}
        <div className={`border rounded-full px-3 py-1 flex items-center gap-1.5 mb-6 text-sm ${theme.badge}`}>
          <Sparkles className={`w-3.5 h-3.5 ${theme.badgeIcon}`} />
          <span className={`${theme.badgeText} font-medium`}>수집 진행도: {discoveredCount}/{totalCount}</span>
        </div>

        {/* Grid List */}
        <div className={`w-full grid ${id === 'heart' ? 'grid-cols-2' : 'grid-cols-1'} gap-4 mb-3`}>
          {artists.map((artist) => {
            const isDiscovered = symbols[artist.key];
            
            return (
              <div
                key={artist.key}
                onClick={() => isDiscovered && onSelectArtist(artist.key)}
                className={`relative rounded-[24px] border-2 p-4 flex flex-col items-center justify-center transition-all ${
                  isDiscovered 
                    ? `bg-white ${theme.card} shadow-md cursor-pointer hover:scale-105 active:scale-95` 
                    : 'bg-gray-50/50 border-gray-200/80 cursor-not-allowed select-none'
                }`}
              >
                {/* Artist Symbol Circle */}
                <div 
                  className={`w-12 h-12 rounded-full flex items-center justify-center bg-white border-[1.8px] shadow-sm mb-2 transition-all ${
                    isDiscovered ? '' : 'filter grayscale opacity-45'
                  }`}
                  style={{ 
                    borderColor: isDiscovered ? artist.borderColor : '#d1d5db',
                    color: isDiscovered ? artist.color : '#9ca3af'
                  }}
                >
                  {artist.type === 'heart' ? (
                    <Heart className="w-5 h-5 fill-current" />
                  ) : artist.type === 'divide' ? (
                    <Divide className="w-5 h-5 stroke-[2.5]" />
                  ) : (
                    <CustomCrossIcon className="w-5 h-5" color="currentColor" strokeWidth="3" />
                  )}
                </div>

                {/* Artist Name */}
                <span className={`font-['Cafe24_Ssurround'] font-bold text-base transition-colors ${
                  isDiscovered ? 'text-gray-800' : 'text-gray-400'
                }`}>
                  {artist.name} 작가
                </span>

                {/* Lock Overlay for Undiscovered Artists */}
                {!isDiscovered && (
                  <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px] rounded-[22px] flex items-center justify-center">
                    <div className="w-8 h-8 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-md">
                      <Lock className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-xs text-gray-400 text-center mt-2 leading-relaxed">
          {id === 'heart' 
            ? '현장 QR을 스캔하여 5가지의 다양한 하트 작품들을 해금해 보세요!'
            : id === 'divide'
            ? '현장 QR을 스캔하여 2가지의 따뜻한 나누기 작품들을 해금해 보세요!'
            : '현장 QR을 스캔하여 2가지의 은혜로운 십자가 작품들을 해금해 보세요!'
          }
        </p>

      </div>
    </div>
  );
}
