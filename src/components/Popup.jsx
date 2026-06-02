import React, { Suspense, lazy, useState } from 'react';

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

const PopupLoading = () => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 text-sm text-white">
    불러오는 중...
  </div>
);

export default function Popup({ id, type, symbols, discovered, onClose }) {
  const [selectedArtist, setSelectedArtist] = useState(null);

  const renderPopup = () => {
    if (selectedArtist) {
      const ArtistPopup = ARTIST_POPUPS[selectedArtist];
      return ArtistPopup
        ? <ArtistPopup onClose={() => setSelectedArtist(null)} />
        : <QrPopup id={selectedArtist} onClose={() => setSelectedArtist(null)} />;
    }

    if (type === 'map') {
      return <MapPopup id={id} discovered={discovered} onClose={onClose} />;
    }

    if (type === 'qr') {
      const ArtistPopup = ARTIST_POPUPS[id];
      return ArtistPopup
        ? <ArtistPopup onClose={onClose} />
        : <QrPopup id={id} onClose={onClose} />;
    }

    if (type === 'question_guide') {
      return <QuestionGuidePopup onClose={onClose} />;
    }

    if (type === 'multi') {
      return (
        <MultiSelectorPopup
          id={id}
          symbols={symbols}
          onClose={onClose}
          onSelectArtist={artistKey => setSelectedArtist(artistKey)}
        />
      );
    }

    return null;
  };

  return (
    <Suspense fallback={<PopupLoading />}>
      {renderPopup()}
    </Suspense>
  );
}
