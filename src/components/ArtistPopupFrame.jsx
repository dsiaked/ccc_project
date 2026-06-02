import React from 'react';
import ArtworkCommentModal from './ArtworkCommentModal';

const commentThemes = {
  heart: {
    accent: '#fa5c5c',
    accentTextClass: 'text-rose-500',
    accentNameClass: 'text-rose-800',
    accentBgClass: 'bg-rose-50/30 border border-rose-100/50',
    focusRingClass: 'focus:ring-rose-400',
  },
  divide: {
    accent: '#f97316',
    accentTextClass: 'text-orange-500',
    accentNameClass: 'text-orange-800',
    accentBgClass: 'bg-orange-50/30 border border-orange-100/50',
    focusRingClass: 'focus:ring-orange-400',
  },
  cross: {
    accent: '#10b981',
    accentTextClass: 'text-emerald-500',
    accentNameClass: 'text-emerald-800',
    accentBgClass: 'bg-emerald-50/30 border border-emerald-100/50',
    focusRingClass: 'focus:ring-emerald-400',
  },
};

export default function ArtistPopupFrame({
  children,
  commentsApi,
  commentTheme = 'heart',
  showCommentModal,
  onCloseComment,
  uiText,
  style,
}) {
  const theme = commentThemes[commentTheme] || commentThemes.heart;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300 overflow-x-hidden touch-pan-y"
      style={style}
    >
      {children}
      {showCommentModal && (
        <ArtworkCommentModal
          commentsApi={commentsApi}
          onClose={onCloseComment}
          uiText={uiText}
          {...theme}
        />
      )}
    </div>
  );
}
