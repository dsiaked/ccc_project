import React, { Suspense, lazy, useState } from 'react';
import { hasArtistEnglish } from '../data/artistPopupEnglish';
import LanguageToggle from './LanguageToggle';

const MapPopup = lazy(() => import('./MapPopup'));
const QrPopup = lazy(() => import('./QrPopup'));
const MultiSelectorPopup = lazy(() => import('./MultiSelectorPopup'));
const QuestionGuidePopup = lazy(() => import('./QuestionGuidePopup'));

const ARTIST_POPUPS = {
  heart_eunhye: lazy(() => import('./HeartEunhyePopup')),
  heart_eunchae: lazy(() => import('./HeartEunchaePopup')),
  heart_kymin: lazy(() => import('./HeartKyminPopup')),
  heart_yewon: lazy(() => import('./HeartYewonPopup')),
  heart_jihoon: lazy(() => import('./HeartJihoonPopup')),
  divide_yewon: lazy(() => import('./DivideYewonPopup')),
  divide_kyeomjun: lazy(() => import('./DivideKyeomjunPopup')),
  cross: lazy(() => import('./CrossKyeomjunPopup')),
  cross_jihoon: lazy(() => import('./CrossJihoonPopup')),
};

const PopupLoading = ({ language = 'ko' }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 text-sm text-white">
    {language === 'en' ? 'Loading...' : '불러오는 중...'}
  </div>
);

export default function Popup({ id, type, symbols, discovered, onClose, language = 'ko', onToggleLanguage }) {
  const [selectedArtist, setSelectedArtist] = useState(null);
  const activeArtistId = selectedArtist || (type === 'qr' && ARTIST_POPUPS[id] ? id : '');

  const renderPopup = () => {
    if (selectedArtist) {
      const ArtistPopup = ARTIST_POPUPS[selectedArtist];
      return ArtistPopup
        ? (
          <ArtistPopup
            onClose={() => setSelectedArtist(null)}
            language={language}
            onToggleLanguage={onToggleLanguage}
          />
        )
        : <QrPopup id={selectedArtist} onClose={() => setSelectedArtist(null)} language={language} />;
    }

    if (type === 'map') {
      return <MapPopup id={id} discovered={discovered} onClose={onClose} language={language} />;
    }

    if (type === 'qr') {
      const ArtistPopup = ARTIST_POPUPS[id];
      return ArtistPopup
        ? (
          <ArtistPopup
            onClose={onClose}
            language={language}
            onToggleLanguage={onToggleLanguage}
          />
        )
        : <QrPopup id={id} onClose={onClose} language={language} />;
    }

    if (type === 'question_guide') {
      return <QuestionGuidePopup onClose={onClose} language={language} />;
    }

    if (type === 'multi') {
      return (
        <MultiSelectorPopup
          id={id}
          symbols={symbols}
          onClose={onClose}
          language={language}
          onSelectArtist={artistKey => setSelectedArtist(artistKey)}
        />
      );
    }

    return null;
  };

  return (
    <Suspense fallback={<PopupLoading language={language} />}>
      {renderPopup()}
      {hasArtistEnglish(activeArtistId) && onToggleLanguage && (
        <LanguageToggle
          language={language}
          onToggle={onToggleLanguage}
          tone="dark"
          className="fixed left-[calc(50%+112px)] top-5 z-[80] flex h-10 items-center gap-1.5 rounded-full border border-white/75 bg-slate-950/82 px-3 text-xs font-bold text-white shadow-[0_10px_28px_rgba(15,23,42,0.28)] backdrop-blur transition active:scale-95"
        />
      )}
    </Suspense>
  );
}
